import { Id } from "@repo/backend/dataModel";

export interface Category {
  _id: Id<"categories">;
  name: string;
  slug: string;
  parent_category_id?: Id<"categories">;
  description?: string;
  image?: Id<"_storage">;
  status: "active" | "inactive";
  sort_order: number;
  created_at?: number;
  updated_at?: number;
}

export interface HierarchicalCategory {
  value: string;
  label: string;
  children?: HierarchicalCategory[];
  category: Category;
}

/**
 * Transform flat category list into hierarchical structure
 */
export function buildCategoryHierarchy(
  categories: Category[]
): HierarchicalCategory[] {
  const categoryMap = new Map<string, HierarchicalCategory>();
  const rootCategories: HierarchicalCategory[] = [];

  // First pass: create all category objects
  categories.forEach((category) => {
    const hierarchicalCategory: HierarchicalCategory = {
      value: category._id,
      label: category.name,
      children: [],
      category,
    };
    categoryMap.set(category._id, hierarchicalCategory);
  });

  // Second pass: build hierarchy
  categories.forEach((category) => {
    const hierarchicalCategory = categoryMap.get(category._id);
    if (!hierarchicalCategory) return;

    if (category.parent_category_id) {
      // This is a child category
      const parent = categoryMap.get(category.parent_category_id);
      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.push(hierarchicalCategory);
        // Sort children by sort_order
        parent.children.sort(
          (a, b) => a.category.sort_order - b.category.sort_order
        );
      }
    } else {
      // This is a root category
      rootCategories.push(hierarchicalCategory);
    }
  });

  // Sort root categories by sort_order
  rootCategories.sort((a, b) => a.category.sort_order - b.category.sort_order);

  return rootCategories;
}

/**
 * Get root categories (categories without parent)
 */
export function getRootCategories(
  categories: Category[]
): HierarchicalCategory[] {
  return categories
    .filter((category) => !category.parent_category_id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((category) => ({
      value: category._id,
      label: category.name,
      category,
    }));
}

/**
 * Get child categories for a given parent category
 */
export function getChildCategories(
  categories: Category[],
  parentId: string
): HierarchicalCategory[] {
  return categories
    .filter((category) => category.parent_category_id === parentId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((category) => ({
      value: category._id,
      label: category.name,
      category,
    }));
}

/**
 * Find category path from root to given category
 */
export function findCategoryPath(
  categories: Category[],
  targetCategoryId: string
): Category[] {
  const categoryMap = new Map<string, Category>();
  categories.forEach((cat) => categoryMap.set(cat._id, cat));

  const path: Category[] = [];
  let currentId: string | undefined = targetCategoryId;

  while (currentId) {
    const category = categoryMap.get(currentId);
    if (!category) break;

    path.unshift(category);
    currentId = category.parent_category_id;
  }

  return path;
}

/**
 * Check if a category is a leaf (has no children)
 */
export function isCategoryLeaf(
  categories: Category[],
  categoryId: string
): boolean {
  return !categories.some((cat) => cat.parent_category_id === categoryId);
}
