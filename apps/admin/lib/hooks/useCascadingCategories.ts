"use client";

import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import { useMemo } from "react";
import {
  buildCategoryHierarchy,
  getRootCategories,
  getChildCategories,
  type Category,
  type HierarchicalCategory,
} from "@/lib/category-utils";
import { CascadingOption } from "@/components/ui/cascading-select";
import { Id } from "@repo/backend/dataModel";

export function useCascadingCategories() {
  const allCategories = useQuery(api.data.categories.getAllCategories) ?? [];

  const rootCategories = useMemo(() => {
    return getRootCategories(allCategories);
  }, [allCategories]);

  const loadChildCategories = async (
    parentId: string,
  ): Promise<CascadingOption[]> => {
    const children = getChildCategories(allCategories, parentId);
    return children.map((child) => ({
      value: child.value,
      label: child.label,
    }));
  };

  const getCategoryPath = (categoryId: string) => {
    const findPath = (
      categories: HierarchicalCategory[],
      targetId: string,
    ): HierarchicalCategory[] => {
      for (const category of categories) {
        if (category.value === targetId) {
          return [category];
        }
        if (category.children) {
          const childPath = findPath(category.children, targetId);
          if (childPath.length > 0) {
            return [category, ...childPath];
          }
        }
      }
      return [];
    };

    const hierarchicalCategories = buildCategoryHierarchy(allCategories);
    return findPath(hierarchicalCategories, categoryId);
  };

  const isLeafCategory = (categoryId: string): boolean => {
    return !allCategories.some(
      (cat: any) => cat.parent_category_id === categoryId,
    );
  };

  return {
    rootCategories: rootCategories.map((cat) => ({
      value: cat.value,
      label: cat.label,
    })),
    loadChildCategories,
    getCategoryPath,
    isLeafCategory,
    allCategories,
  };
}
