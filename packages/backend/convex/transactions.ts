import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";

// ── Status Transition Guard ──────────────────────────────────────────────────
//
// Enforces a directed state machine for transaction statuses.
// refunded is a terminal state — no further transitions are allowed.
//
// pending  → successful | failed
// failed   → pending          (retry)
// successful → refunded
// refunded → (terminal)

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["successful", "failed"],
  failed: ["pending"],
  successful: ["refunded"],
  refunded: [],
};

type TransactionStatus = "pending" | "successful" | "failed" | "refunded";

function computeTransactionSearchText(txn: {
  reference: string;
  status?: string;
  type?: string;
  payment_method?: string;
}): string {
  return [
    txn.reference,
    txn.status ?? "",
    txn.type ?? "",
    txn.payment_method ?? "",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// ── Queries ──────────────────────────────────────────────────────────────────

export const getTransactions = query({
  args: {
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    search: v.optional(v.string()),
    statusFilter: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("successful"),
        v.literal("failed"),
        v.literal("refunded"),
      ),
    ),
    typeFilter: v.optional(v.union(v.literal("credit"), v.literal("debit"))),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(200, args.limit));
    const search = args.search?.trim();

    const buildListQuery = () => {
      if (search && search.length > 0) {
        return ctx.db
          .query("transactions")
          .withSearchIndex("search_text", (q) => {
            let sq = q.search("searchText", search);
            if (args.statusFilter) {
              sq = sq.eq("status", args.statusFilter);
            }
            return sq;
          });
      }
      if (args.statusFilter) {
        return ctx.db
          .query("transactions")
          .withIndex("by_status", (q) => q.eq("status", args.statusFilter!));
      }
      return ctx.db.query("transactions").order("desc");
    };

    const pageResult = await buildListQuery().paginate({
      cursor: args.cursor ?? null,
      numItems: limit,
    });

    const enriched = await Promise.all(
      pageResult.page.map(async (txn) => {
        const order = await ctx.db.get(txn.order_id);
        return {
          ...txn,
          order_reference: order?.reference ?? null,
        };
      }),
    );

    // Apply client-side type filter (search index doesn't support two eq filters)
    const filtered = args.typeFilter
      ? enriched.filter((t) => t.type === args.typeFilter)
      : enriched;

    const total = (await buildListQuery().collect()).length;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      data: filtered,
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

export const getTransaction = query({
  args: { id: v.id("transactions") },
  handler: async (ctx, args) => {
    const txn = await ctx.db.get(args.id);
    if (!txn) return null;
    const order = await ctx.db.get(txn.order_id);
    return { ...txn, order_reference: order?.reference ?? null };
  },
});

// ── Mutations ────────────────────────────────────────────────────────────────

export const updateTransactionStatus = mutation({
  args: {
    id: v.id("transactions"),
    status: v.union(
      v.literal("pending"),
      v.literal("successful"),
      v.literal("failed"),
      v.literal("refunded"),
    ),
  },
  handler: async (ctx, args) => {
    const txn = await ctx.db.get(args.id);
    if (!txn) throw new Error("Transaction not found.");

    const currentStatus = txn.status as TransactionStatus;
    const nextStatus = args.status;

    const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(nextStatus)) {
      if (currentStatus === "refunded") {
        throw new ConvexError(
          `Cannot change status from 'refunded' — it is a terminal state.`,
        );
      }
      throw new ConvexError(
        `Cannot change status from '${currentStatus}' to '${nextStatus}'. ` +
          `Allowed transitions: ${allowed.length > 0 ? allowed.join(", ") : "none"}.`,
      );
    }

    const searchText = computeTransactionSearchText({
      reference: txn.reference,
      status: nextStatus,
      type: txn.type,
      payment_method: txn.payment_method,
    });

    await ctx.db.patch(args.id, {
      status: nextStatus,
      searchText,
      updated_at: Date.now(),
    });

    return {
      success: true,
      previousStatus: currentStatus,
      newStatus: nextStatus,
    };
  },
});

export const backfillTransactionsSearchText = mutation({
  args: {},
  handler: async (ctx) => {
    const transactions = await ctx.db.query("transactions").collect();
    let updatedCount = 0;

    for (const txn of transactions) {
      const searchText = computeTransactionSearchText({
        reference: txn.reference,
        status: txn.status,
        type: txn.type,
        payment_method: txn.payment_method,
      });
      if (txn.searchText === searchText) continue;
      await ctx.db.patch(txn._id, { searchText, updated_at: Date.now() });
      updatedCount += 1;
    }

    return { updatedCount };
  },
});
