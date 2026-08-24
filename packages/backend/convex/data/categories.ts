import { Id, Doc } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { v, ConvexError } from "convex/values";

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
    status: v.union(v.literal("active"), v.literal("inactive")),
    sort_order: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.parent_category_id) {
      const parent = await ctx.db.get(args.parent_category_id);
      if (!parent) {
        throw new Error("Parent category not found");
      }
    }

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
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
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
    status: v.union(v.literal("active"), v.literal("inactive")),
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

    if (updates.parent_category_id) {
      const parent = await ctx.db.get(updates.parent_category_id);
      if (!parent) {
        throw new Error("Parent category not found");
      }
    }

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
        status: v.union(v.literal("active"), v.literal("inactive")),
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
        // Validate parent exists if specified
        if (category.parent_category_id) {
          const parent = await ctx.db.get(category.parent_category_id);
          if (!parent) {
            results.failed++;
            results.errors.push(
              `"${category.name}": Parent category not found`,
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
