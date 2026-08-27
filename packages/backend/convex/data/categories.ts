import { Id, Doc } from "../_generated/dataModel";
import {
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "../_generated/server";
import { v, ConvexError } from "convex/values";
import {
  lowercaseRecordStatus,
} from "../validators";
import {
  assertCategoryPlacement,
  breadcrumbOf,
  CATEGORY_MAX_DEPTH,
  CategoryTreeError,
  depthOf,
  indexById,
  LEVEL_LABELS,
  productCategoryOptions,
} from "../lib/category_tree";

/**
 * The three-level rule, enforced.
 *
 * `createCategory` and `updateCategory` previously checked only that a chosen
 * parent EXISTED, so nothing stopped a fourth or fifth level, a category being
 * made its own parent, or a category being re-parented under its own
 * descendant — the last of which silently detaches an entire branch from the
 * root with no error and nothing visibly wrong in the form.
 *
 * The rules themselves live in `lib/category_tree.ts` so they are testable
 * without a database; these mutations just run them and translate the result
 * into a ConvexError the admin UI already knows how to surface.
 */
async function assertPlacement(
  ctx: MutationCtx,
  parentId: Id<"categories"> | undefined,
  movingId?: Id<"categories">,
): Promise<number> {
  const all = await ctx.db.query("categories").collect();
  try {
    return assertCategoryPlacement(all, parentId, movingId);
  } catch (err) {
    if (err instanceof CategoryTreeError) throw new ConvexError(err.message);
    throw err;
  }
}

const computeCategorySearchText = (category: {
  name?: string;
  slug?: string;
  description?: string;
}) => {
  return [category.name ?? "", category.slug ?? "", category.description ?? ""]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
};

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const getImageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const getCategoryWithImage = query({
  args: { id: v.id("categories") },
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.id);
    if (!category) return null;

    const imageUrl = category.image
      ? await ctx.storage.getUrl(category.image)
      : null;

    return {
      ...category,
      imageUrl,
    };
  },
});

export const getCategoriesWithImages = query({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_sort_order")
      .collect();

    const categoriesWithImages = await Promise.all(
      categories.map(async (category) => {
        const imageUrl = category.image
          ? await ctx.storage.getUrl(category.image)
          : null;

        return {
          ...category,
          imageUrl,
        };
      }),
    );

    return categoriesWithImages;
  },
});

// Paginated version for categories
export const getCategoriesWithImagesPaginated = query({
  args: {
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(50, args.limit));

    const pageResult = await ctx.db
      .query("categories")
      .withIndex("by_sort_order")
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
      });

    const currentPageCategories = pageResult.page;
    const total = (await ctx.db.query("categories").collect()).length;

    const categoriesWithImages = await Promise.all(
      currentPageCategories.map(async (category) => {
        const imageUrl = category.image
          ? await ctx.storage.getUrl(category.image)
          : null;

        return {
          ...category,
          imageUrl,
        };
      }),
    );

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      data: categoriesWithImages,
      pagination: {
        limit,
        total,
        totalPages,
        hasNext: !pageResult.isDone,
        cursor: pageResult.continueCursor ?? null,
      },
    };
  },
});

export const createCategory = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    parent_category_id: v.optional(v.id("categories")),
    description: v.string(),
    image: v.optional(v.id("_storage")),
    status: v.union(...lowercaseRecordStatus.map((e) => v.literal(e))),
    sort_order: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await assertPlacement(ctx, args.parent_category_id);

    const existingCategory = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (existingCategory) {
      throw new ConvexError("Category with this slug already exists");
    }

    const searchText = computeCategorySearchText(args);

    return await ctx.db.insert("categories", {
      ...args,
      searchText,
      created_at: now,
      updated_at: now,
    });
  },
});

export const getCategories = query({
  args: {
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    search: v.optional(v.string()),
    industry: v.optional(v.id("industry")),
    status: v.optional(v.union(...lowercaseRecordStatus.map((e) => v.literal(e)))),
  },
  handler: async (ctx, args) => {
    const PageLimit = Math.max(1, Math.min(200, args.limit));
    const normalizedSearch = (args.search ?? "").trim();
    const isSearching = normalizedSearch.length > 0;

    const baseQuery = ctx.db.query("categories");

    let categoriesQuery;
    if (isSearching) {
      categoriesQuery = baseQuery.withSearchIndex("search_text", (q) => {
        let sq = q.search("searchText", normalizedSearch);
        if (args.industry) {
          sq = sq.eq("industry", args.industry);
        }
        if (args.status) {
          sq = sq.eq("status", args.status);
        }
        return sq;
      });
    } else if (args.status && args.industry) {
      categoriesQuery = baseQuery
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .filter((q) => q.eq(q.field("industry"), args.industry!))
        .order("desc");
    } else if (args.status) {
      categoriesQuery = baseQuery
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc");
    } else if (args.industry) {
      categoriesQuery = baseQuery
        .withIndex("by_industry", (q) => q.eq("industry", args.industry!))
        .order("desc");
    } else {
      categoriesQuery = baseQuery.withIndex("by_sort_order").order("asc");
    }

    const pageResult = await categoriesQuery.paginate({
      cursor: args.cursor ?? null,
      numItems: PageLimit,
    });

    const currentPageDocs = pageResult.page;

    const total = (
      isSearching
        ? await baseQuery
            .withSearchIndex("search_text", (q) => {
              let sq = q.search("searchText", normalizedSearch);
              if (args.industry) {
                sq = sq.eq("industry", args.industry);
              }
              if (args.status) {
                sq = sq.eq("status", args.status);
              }
              return sq;
            })
            .collect()
        : args.status
          ? await baseQuery
              .withIndex("by_status", (q) => q.eq("status", args.status!))
              .collect()
          : args.industry
            ? await baseQuery
                .withIndex("by_industry", (q) =>
                  q.eq("industry", args.industry!),
                )
                .collect()
            : await baseQuery.collect()
    ).length;

    const totalPages = Math.max(1, Math.ceil(total / PageLimit));

    return {
      data: currentPageDocs,
      pagination: {
        PageLimit,
        total,
        totalPages,
        hasNext: !pageResult.isDone,
        cursor: pageResult.continueCursor ?? null,
      },
    };
  },
});

export const backfillCategoriesSearchText = mutation({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db.query("categories").collect();
    let updatedCount = 0;

    for (const category of categories) {
      const searchText = computeCategorySearchText(category);
      if (category.searchText === searchText) continue;
      await ctx.db.patch(category._id, { searchText, updated_at: Date.now() });
      updatedCount += 1;
    }

    return { updatedCount };
  },
});

export const getAllCategories = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("categories")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
  },
});

export const getCategoryBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

export const getCategoryById = query({
  args: { id: v.id("categories") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getChildCategories = query({
  args: { parent_category_id: v.optional(v.id("categories")) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("categories")
      .withIndex("by_parent", (q) =>
        q.eq("parent_category_id", args.parent_category_id),
      )
      .collect();
  },
});

export const getCategoryHierarchy = query({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, args) => {
    const hierarchy: Doc<"categories">[] = [];
    let currentId: Id<"categories"> | null = args.categoryId;

    while (currentId) {
      const currentCategory: Doc<"categories"> | null =
        await ctx.db.get(currentId);
      if (!currentCategory) break;

      hierarchy.unshift(currentCategory);
      currentId = currentCategory.parent_category_id || null;
    }

    return hierarchy;
  },
});

export const updateCategory = mutation({
  args: {
    id: v.id("categories"),
    name: v.string(),
    slug: v.string(),
    parent_category_id: v.optional(v.id("categories")),
    description: v.string(),
    image: v.optional(v.id("_storage")),
    status: v.union(...lowercaseRecordStatus.map((e) => v.literal(e))),
    sort_order: v.number(),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const now = Date.now();

    const existingCategory = await ctx.db.get(id);
    if (!existingCategory) {
      throw new Error("Category not found");
    }

    if (updates.slug) {
      const categoryWithSlug = await ctx.db
        .query("categories")
        .withIndex("by_slug", (q) => q.eq("slug", updates.slug!))
        .first();

      if (categoryWithSlug && categoryWithSlug._id !== id) {
        throw new ConvexError("Category with slug already exists");
      }
    }

    // `movingId` is passed here and not on create — it is what makes the
    // self-parent and descendant-parent checks possible, both of which are
    // update-only failures.
    await assertPlacement(ctx, updates.parent_category_id, id);

    const nextSearchText = computeCategorySearchText({
      ...existingCategory,
      ...updates,
    });

    return await ctx.db.patch(id, {
      ...updates,
      searchText: nextSearchText,
      updated_at: now,
    });
  },
});

export const deleteCategory = mutation({
  args: { id: v.id("categories") },
  handler: async (ctx, args) => {
    // Disable delete if category has child category or products

    const children = await ctx.db
      .query("categories")
      .withIndex("by_parent", (q) => q.eq("parent_category_id", args.id))
      .collect();

    if (children.length > 0) {
      throw new ConvexError("Cannot delete category with child categories");
    }

    const products = await ctx.db
      .query("products")
      .withIndex("by_category", (q) => q.eq("category_id", args.id))
      .collect();

    if (products.length > 0) {
      throw new ConvexError("Cannot delete category with products");
    }

    return await ctx.db.delete(args.id);
  },
});

// ── Bulk Import ──────────────────────────────────────────────────────────────

export const bulkCreateCategories = mutation({
  args: {
    categories: v.array(
      v.object({
        name: v.string(),
        slug: v.string(),
        parent_category_id: v.optional(v.id("categories")),
        description: v.string(),
        status: v.union(...lowercaseRecordStatus.map((e) => v.literal(e))),
        sort_order: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const results: { success: number; failed: number; errors: string[] } = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (const category of args.categories) {
      try {
        // Same three-level rule as createCategory, but reported per row: an
        // import of fifty categories must not be aborted wholesale because one
        // of them names too deep a parent. Re-read inside the loop because
        // earlier iterations insert rows that later ones may legitimately
        // parent onto.
        if (category.parent_category_id) {
          try {
            await assertPlacement(ctx, category.parent_category_id);
          } catch (err) {
            results.failed++;
            results.errors.push(
              `"${category.name}": ${
                err instanceof ConvexError ? String(err.data) : "invalid parent"
              }`,
            );
            continue;
          }
        }

        // Check slug uniqueness
        const existingSlug = await ctx.db
          .query("categories")
          .withIndex("by_slug", (q) => q.eq("slug", category.slug))
          .first();
        if (existingSlug) {
          results.failed++;
          results.errors.push(
            `"${category.name}": Slug "${category.slug}" already exists`,
          );
          continue;
        }

        const searchText = computeCategorySearchText(category);
        await ctx.db.insert("categories", {
          ...category,
          searchText,
          created_at: now,
          updated_at: now,
        });
        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(
          `"${category.name}": ${error.message || "Unknown error"}`,
        );
      }
    }

    return results;
  },
});

// ── Hierarchy, for the forms ─────────────────────────────────────────────────

/**
 * Every category with its depth and breadcrumb resolved server-side.
 *
 * The admin previously did this in the browser: `lib/category-utils.ts` and
 * `useCascadingCategories` each walked the parent chain themselves, with no
 * cycle guard — a circular chain (reachable through `updateCategory` before
 * this change) hung the tab rather than the function. Resolving it once here
 * means the category form, the product form and the tables all agree, and the
 * walk is guarded in exactly one place.
 */
export const getCategoryTree = query({
  args: {
    /** Omit for every category; "active" for the pickers. */
    status: v.optional(v.union(...lowercaseRecordStatus.map((e) => v.literal(e)))),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("categories").collect();

    // Depth is computed over ALL categories, then filtered — otherwise an
    // inactive parent makes its active child look like a root, and a level-3
    // category would be offered to products as level 1.
    const byId = indexById(all);

    const visible = args.status
      ? all.filter((c) => c.status === args.status)
      : all;

    return visible
      .map((c) => ({
        _id: c._id,
        name: c.name,
        slug: c.slug,
        status: c.status,
        parent_category_id: c.parent_category_id,
        sort_order: c.sort_order,
        depth: depthOf(byId, c._id),
        breadcrumb: breadcrumbOf(byId, c._id),
      }))
      .sort((a, b) => {
        // Grouped by branch, then by the admin's own ordering within a parent.
        const byBranch = (a.breadcrumb ?? a.name).localeCompare(
          b.breadcrumb ?? b.name,
        );
        return byBranch !== 0 ? byBranch : a.sort_order - b.sort_order;
      });
  },
});

/**
 * The only categories a product may be attached to: level 3.
 *
 * Labelled with the full breadcrumb, because a third-level name is unique only
 * within its parent — "Festive Bread" could sit under two different branches
 * and a bare name in the picker would be genuinely ambiguous.
 */
export const getProductCategoryOptions = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("categories").collect();
    // Depth over all categories, options filtered to active — same reason as
    // getCategoryTree above.
    const active = new Set(
      all.filter((c) => c.status === "active").map((c) => c._id),
    );
    return productCategoryOptions(all).filter((o) => active.has(o.value as Id<"categories">));
  },
});

/**
 * Categories and products that violate the three-level rule.
 *
 * Nothing enforced it before, so a live database may already contain any of
 * these — and each one was legal when created but will now fail on its next
 * save, which reaches an admin as a mysterious mid-edit rejection. Run this
 * before trusting the new guards:
 *
 *   npx convex run data/categories:auditHierarchy
 */
export const auditHierarchy = internalQuery({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db.query("categories").collect();
    const byId = indexById(categories);

    const tooDeep: { _id: Id<"categories">; name: string; depth: number }[] = [];
    const broken: { _id: Id<"categories">; name: string }[] = [];

    for (const category of categories) {
      const depth = depthOf(byId, category._id);
      if (depth === null) {
        broken.push({ _id: category._id, name: category.name });
      } else if (depth > CATEGORY_MAX_DEPTH) {
        tooDeep.push({ _id: category._id, name: category.name, depth });
      }
    }

    const products = await ctx.db.query("products").collect();
    const misplaced: {
      _id: Id<"products">;
      name: string;
      category_name: string;
      depth: number | null;
    }[] = [];

    for (const product of products) {
      const depth = depthOf(byId, product.category_id);
      if (depth !== CATEGORY_MAX_DEPTH) {
        misplaced.push({
          _id: product._id,
          name: product.name,
          category_name: byId.get(product.category_id)?.name ?? "(missing)",
          depth,
        });
      }
    }

    return {
      maxDepth: CATEGORY_MAX_DEPTH,
      levelLabels: LEVEL_LABELS,
      categories: {
        total: categories.length,
        tooDeep,
        brokenOrCircular: broken,
      },
      products: {
        total: products.length,
        misplaced,
      },
    };
  },
});
