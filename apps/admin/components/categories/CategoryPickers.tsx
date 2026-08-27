"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import { Combobox } from "@repo/ui/components/ui/combobox";
import { Skeleton } from "@repo/ui/components/ui/skeleton";

/**
 * The two category pickers, replicating sydia's pattern.
 *
 * ── What sydia does, and why ──────────────────────────────────────────────
 *
 * Sydia has two levels (category › sub-category) with services on the second.
 * Its category form offers a searchable `Combobox` of possible parents plus a
 * "None (top-level)" entry; its service form offers ONLY second-level
 * categories, labelled `Parent · Child` — because a sub-category name is unique
 * only within its parent, so a bare name in the picker is ambiguous.
 *
 * Blink has three levels with products on the third, so the same idea with one
 * more level: labels are full `A › B › C` breadcrumbs, and the product picker
 * offers level 3 and nothing else.
 *
 * ── Why a Combobox rather than the old cascading selects ─────────────────
 *
 * `components/ui/cascading-select.tsx` committed a selection the moment the
 * chosen category had no children. That makes leafness the rule instead of
 * depth, so a childless level-2 category was accepted exactly like a proper
 * level-3 one — and a product parked there is unreachable from every listing a
 * customer browses. It also fired `onValueChange` only on that leaf, so
 * selecting a mid-level category left the form value empty with no feedback.
 *
 * A single searchable list of valid targets has neither problem: the options ARE
 * the valid targets, there is no intermediate state to commit by accident, and
 * with a real catalogue typing "bread" beats clicking through three dropdowns.
 *
 * Depth and breadcrumbs come from the server (`getCategoryTree`,
 * `getProductCategoryOptions`) rather than being recomputed here. The previous
 * client-side walks in `lib/category-utils.ts` had no cycle guard, so a circular
 * parent chain — reachable through `updateCategory` before this change — hung
 * the browser tab instead of the function.
 */

// ── Product category picker ─────────────────────────────────────────────────

export function ProductCategoryPicker({
  value,
  onValueChange,
  disabled,
  className,
}: {
  value?: string;
  onValueChange: (categoryId: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const options = useQuery(api.data.categories.getProductCategoryOptions, {});

  if (options === undefined) {
    return <Skeleton className="h-9 w-full" />;
  }

  if (options.length === 0) {
    // A disabled, empty picker reads as a broken form. Say what is missing and
    // what to do about it — on a fresh deployment this is the normal state, not
    // an error.
    return (
      <p className="text-muted-foreground border-warning bg-warning/5 rounded-md border p-3 text-sm">
        No third-level categories exist yet. Products attach to the third level
        (for example <span className="font-medium">Supermarkets › Groceries ›
        Bread &amp; Bakery</span>), so create that depth of category first.
      </p>
    );
  }

  return (
    <div className={className}>
      <Combobox
        value={value}
        onValueChange={onValueChange}
        options={options.map((o) => ({ value: o.value, label: o.label }))}
        placeholder="Select a category"
        searchPlaceholder="Search category…"
        emptyText="No matching category."
        disabled={disabled}
      />
      <p className="text-muted-foreground mt-1.5 text-xs">
        Third-level categories only — the full path is shown so names that repeat
        across branches stay distinguishable.
      </p>
    </div>
  );
}

// ── Parent category picker, for the category form ───────────────────────────

const NONE = "none";

export function ParentCategoryPicker({
  value,
  onValueChange,
  /** The category being edited, so it cannot be offered as its own parent. */
  excludeId,
  disabled,
}: {
  value?: string;
  onValueChange: (parentId: string | undefined) => void;
  excludeId?: Id<"categories">;
  disabled?: boolean;
}) {
  const tree = useQuery(api.data.categories.getCategoryTree, {});

  const options = useMemo(() => {
    if (!tree) return [];

    // Keyed as plain strings: the walk below compares ids without caring which
    // table they belong to, and a branded key type only forces casts at every
    // lookup.
    const parentOf = new Map<string, string | undefined>(
      tree.map((c) => [c._id as string, c.parent_category_id as string | undefined]),
    );

    /**
     * Is `id` the category being edited, or somewhere beneath it?
     *
     * Walks the real parent chain rather than matching breadcrumb text — two
     * categories may legitimately share a name across branches, so a string
     * match would both hide valid parents and miss an actual descendant whose
     * name differs from its ancestor's.
     *
     * Bounded, because a circular chain would otherwise spin here. The server
     * rejects cycles now, but this list renders whatever is currently in the
     * database, including a cycle created before that guard existed.
     */
    const isSelfOrBeneathEdited = (id: string): boolean => {
      if (!excludeId) return false;
      let current: string | undefined = id;
      const seen = new Set<string>();
      while (current && !seen.has(current) && seen.size < 64) {
        if (current === excludeId) return true;
        seen.add(current);
        current = parentOf.get(current) ?? undefined;
      }
      return false;
    };

    // Only levels 1 and 2 can take children — a level-3 category is already at
    // the limit, so offering it as a parent would guarantee a rejected save.
    // Filtering here rather than letting the mutation refuse means the invalid
    // choice is never presented at all.
    const eligible = tree.filter(
      (c) => c.depth !== null && c.depth < 3 && !isSelfOrBeneathEdited(c._id),
    );

    return [
      { value: NONE, label: "None — this is a top-level category" },
      ...eligible.map((c) => ({
        value: c._id,
        label: `${c.breadcrumb ?? c.name}  ·  level ${c.depth}`,
      })),
    ];
  }, [tree, excludeId]);

  if (tree === undefined) {
    return <Skeleton className="h-9 w-full" />;
  }

  return (
    <div>
      <Combobox
        value={value ?? NONE}
        onValueChange={(next) => onValueChange(next === NONE ? undefined : next)}
        options={options}
        placeholder="None — this is a top-level category"
        searchPlaceholder="Search category…"
        emptyText="No matching category."
        disabled={disabled}
      />
      <p className="text-muted-foreground mt-1.5 text-xs">
        Only levels 1 and 2 can have children. The tree is limited to three
        levels: Category › Subcategory › Product type.
      </p>
    </div>
  );
}
