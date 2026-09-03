import { v, ConvexError } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  assertAgentOwner,
  assertPermission,
  getAuthUser,
  getAuthUserOrNull,
} from "../auth.helpers";
import { PAYSTACK_BASE_URL } from "../lib/paystack";
import {
  agentPaymentRequestStatus,
} from "../validators";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

async function paystackRequest(
  secret: string,
  path: string,
  init?: RequestInit,
) {
  const res = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const msg =
      isRecord(body) && typeof body.message === "string"
        ? body.message
        : typeof body === "string"
          ? body
          : `HTTP ${res.status}`;
    console.error("[Paystack] Request failed", {
      path,
      status: res.status,
      statusText: res.statusText,
      message: msg,
    });
    throw new ConvexError(msg);
  }
  return body;
}

// ── Queries ────────────────────────────────────────────────────

export const getPaymentRequests = query({
  args: {
    limit: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    status: v.optional(
      v.union(...agentPaymentRequestStatus.map((e) => v.literal(e))),
    ),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(200, args.limit));

    const buildQuery = () => {
      if (args.status) {
        return ctx.db
          .query("agent_payment_requests")
          .withIndex("by_status", (q) => q.eq("status", args.status!));
      }
      return ctx.db.query("agent_payment_requests").order("desc");
    };

    const pageResult = await buildQuery().paginate({
      cursor: args.cursor ?? null,
      numItems: limit,
    });

    const total = (await buildQuery().collect()).length;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const enriched = await Promise.all(
      pageResult.page.map(async (req) => {
        const agent = await ctx.db.get(req.agent_id);
        const user = agent ? await ctx.db.get(agent.user_id) : null;
        return { ...req, agent, user };
      }),
    );

    return {
      data: enriched,
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

export const getPaymentRequest = query({
  args: { id: v.id("agent_payment_requests") },
  handler: async (ctx, args) => {
    const req = await ctx.db.get(args.id);
    if (!req) return null;
    const agent = await ctx.db.get(req.agent_id);
    const user = agent ? await ctx.db.get(agent.user_id) : null;
    const processedBy = req.processed_by
      ? await ctx.db.get(req.processed_by)
      : null;
    return { ...req, agent, user, processedBy };
  },
});

/**
 * @internal Took `agentId` as an argument with no auth, so an agent id was
 * enough to read another agent's payout history - amounts, dates, and which
 * requests were refused. Use `getMyPayoutRequests`.
 */
export const getAgentPaymentRequests = internalQuery({
  args: {
    agentId: v.id("agents"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("agent_payment_requests")
      .withIndex("by_agent", (q) => q.eq("agent_id", args.agentId))
      .order("desc")
      .take(limit);
  },
});

// ── Mutations ──────────────────────────────────────────────────

/**
 * Open a payout request for an agent, with every rule applied.
 *
 * Extracted so `createPaymentRequest` (which takes an agent id and checks it
 * against the caller) and `requestMyPayout` (which takes no id at all) cannot
 * drift. The rules are: a positive amount, payouts enabled, within the available
 * balance after money already spoken for, on an allowed payout day, and at most
 * one pending request at a time.
 */
async function openPayoutRequest(
  ctx: MutationCtx,
  agent: Doc<"agents">,
  amount: number,
): Promise<Id<"agent_payment_requests">> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ConvexError("Amount must be greater than zero.");
  }

  if (!agent.paystack_recipient_code) {
    throw new ConvexError(
      "Payouts are not enabled for your account. Please contact admin.",
    );
  }

  // Pending and approved both hold money that is already claimed. Bounded reads:
  // the agent this would throw for is the most active one.
  const pendingRequests = await ctx.db
    .query("agent_payment_requests")
    .withIndex("by_agent_status", (q) =>
      q.eq("agent_id", agent._id).eq("status", "pending"),
    )
    .take(100);
  const approvedRequests = await ctx.db
    .query("agent_payment_requests")
    .withIndex("by_agent_status", (q) =>
      q.eq("agent_id", agent._id).eq("status", "approved"),
    )
    .take(100);

  const requestedAmount = [...pendingRequests, ...approvedRequests].reduce(
    (sum, r) => sum + r.amount,
    0,
  );
  const availableBalance = Math.max(0, (agent.balance ?? 0) - requestedAmount);

  if (amount > availableBalance) {
    throw new ConvexError("Amount cannot exceed your available balance.");
  }

  const payoutDaysSetting = await ctx.db
    .query("platform_settings")
    .withIndex("by_key", (q) => q.eq("key", "agent_payout_days"))
    .first();

  if (payoutDaysSetting?.value) {
    const allowedDays = payoutDaysSetting.value
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 0);
    const today = new Date()
      .toLocaleDateString("en-US", { weekday: "long" })
      .toLowerCase();
    // An empty or all-whitespace setting is treated as "no restriction" rather
    // than as "no day is allowed", which would block every payout silently.
    if (allowedDays.length > 0 && !allowedDays.includes(today)) {
      throw new ConvexError(
        `Payouts can only be requested on ${payoutDaysSetting.value}.`,
      );
    }
  }

  if (pendingRequests.length > 0) {
    throw new ConvexError("You already have a pending payout request.");
  }

  return await ctx.db.insert("agent_payment_requests", {
    agent_id: agent._id,
    amount,
    status: "pending",
    requested_at: Date.now(),
  });
}

/**
 * @deprecated Takes `agentId` as an argument. Ownership IS asserted, so this is
 * not an IDOR — but the client has no business choosing an identifier it does not
 * get to decide, and every such argument is one refactor away from being
 * trusted. Use `requestMyPayout`.
 */
export const createPaymentRequest = mutation({
  args: {
    agentId: v.id("agents"),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    // An agent may only open a payout request against their OWN agent record.
    // Before this guard the mutation took `agentId` with no identity check at
    // all, so any caller could open a request against any agent - the first link
    // in the payout chain.
    const { agent } = await assertAgentOwner(ctx, args.agentId);
    return await openPayoutRequest(ctx, agent, args.amount);
  },
});

export const updatePaymentRequestStatus = mutation({
  args: {
    id: v.id("agent_payment_requests"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
    /**
     * @deprecated Ignored — the approver is derived from the caller's identity.
     *
     * This was a required `v.id("users")`, which made the approval trail
     * forgeable: the client named its own approver. Kept as an optional arg only
     * so existing admin builds keep working during the migration; the value is
     * discarded, and a mismatch is logged as a tamper signal. Delete the arg once
     * the admin app stops sending it.
     */
    processedBy: v.optional(v.id("users")),
    rejection_reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await assertPermission(ctx, "agents:UPDATE");

    if (args.processedBy && args.processedBy !== user._id) {
      console.error(
        `[payout] client-supplied processedBy (${args.processedBy}) does not ` +
          `match the authenticated caller (${user._id}); using the caller`,
      );
    }
    const processedBy: Id<"users"> = user._id;

    const req = await ctx.db.get(args.id);
    if (!req) throw new ConvexError("Payment request not found.");
    if (req.status !== "pending") {
      throw new ConvexError(
        `This request has already been ${req.status} and cannot be updated.`,
      );
    }
    if (args.status === "rejected" && !args.rejection_reason) {
      throw new ConvexError("A rejection reason is required.");
    }

    await ctx.db.patch(args.id, {
      status: args.status,
      processed_at: Date.now(),
      processed_by: processedBy,
      ...(args.rejection_reason
        ? { rejection_reason: args.rejection_reason }
        : {}),
    });
  },
});

export const markRequestPaid = internalMutation({
  args: {
    id: v.id("agent_payment_requests"),
    transferCode: v.string(),
    reference: v.string(),
    processedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const req = await ctx.db.get(args.id);
    if (!req) throw new Error("Payment request not found");

    const agent = await ctx.db.get(req.agent_id);
    if (!agent) throw new Error("Agent not found");

    await ctx.db.patch(args.id, {
      status: "paid",
      paystack_transfer_code: args.transferCode,
      paystack_reference: args.reference,
      processed_at: Date.now(),
      processed_by: args.processedBy,
    });

    // Deduct from balance and add to total_paid
    await ctx.db.patch(req.agent_id, {
      balance: Math.max(0, (agent.balance ?? 0) - req.amount),
      total_paid: (agent.total_paid ?? 0) + req.amount,
    });
  },
});

// ── Actions ────────────────────────────────────────────────────

function normalizeMpesaPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");

  if (digits.startsWith("0") && digits.length === 10) {
    return digits;
  }

  if (digits.startsWith("254") && digits.length === 12) {
    return `0${digits.slice(3)}`;
  }

  if (digits.startsWith("+254") && digits.length === 13) {
    return `0${digits.slice(4)}`;
  }

  if (digits.startsWith("7") && digits.length === 9) {
    return `0${digits}`;
  }

  throw new ConvexError(
    "Invalid M-Pesa phone. Use 07XXXXXXXX or 2547XXXXXXXX.",
  );
}

export const createAgentPaystackRecipient = action({
  args: {
    agentId: v.id("agents"),
    mpesaNumber: v.string(),
  },
  handler: async (ctx, args) => {
    // Registers an M-Pesa payout destination for an agent. Was fully
    // unauthenticated. Actions have no `ctx.db`, so the check runs in an
    // internal query where the caller's identity still propagates.
    await ctx.runQuery(internal.data.agent_payment_requests.assertPayoutPermission, {});

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new Error("PAYSTACK_SECRET_KEY is not configured");

    // Fetch agent and user details from db via a query
    const agent: Doc<"agents"> | null = await ctx.runQuery(
      internal.data.agent_payment_requests.getAgentForAction,
      { agentId: args.agentId },
    );
    if (!agent) throw new Error("Agent not found");

    const user: Doc<"users"> | null = await ctx.runQuery(
      internal.data.agent_payment_requests.getUserForAction,
      { userId: agent.user_id },
    );
    if (!user) throw new Error("Agent user not found");

    const name =
      user.name ||
      `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() ||
      "Agent";

    const body = await paystackRequest(secret, "/transferrecipient", {
      method: "POST",
      body: JSON.stringify({
        type: "mobile_money",
        name,
        account_number: normalizeMpesaPhone(args.mpesaNumber),
        bank_code: "MPESA",
        currency: "KES",
      }),
    });

    if (
      !isRecord(body) ||
      !isRecord(body.data) ||
      typeof body.data.recipient_code !== "string"
    ) {
      throw new Error("Unexpected response from Paystack /transferrecipient");
    }

    const recipientCode = body.data.recipient_code as string;

    await ctx.runMutation(internal.data.agent_payment_requests.patchAgentRecipient, {
      agentId: args.agentId,
      mpesaNumber: args.mpesaNumber,
      recipientCode,
    });

    return { recipientCode };
  },
});

/**
 * Public entry point for executing an approved payout.
 *
 * Deliberately thin: it authorises, then delegates to `executePayout`, an
 * `internalAction`. The Paystack transfer itself is therefore **unreachable from
 * any client** — previously this was a public action that issued
 * `POST /transfer` from `source: "balance"`, gated only by the request's own
 * status, which the equally-unguarded approve step had just set.
 */
export const processPaymentRequest = action({
  args: {
    requestId: v.id("agent_payment_requests"),
    /** @deprecated Ignored — derived from the caller. See updatePaymentRequestStatus. */
    processedBy: v.optional(v.id("users")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ transferCode: string; reference: string }> => {
    // Actions have no `ctx.db`, so the permission check runs in an internal
    // query. Identity propagates through `runQuery`, and the acting user id
    // comes back from the server rather than from the client.
    const processedBy: Id<"users"> = await ctx.runQuery(
      internal.data.agent_payment_requests.assertPayoutPermission,
      {},
    );

    if (args.processedBy && args.processedBy !== processedBy) {
      console.error(
        `[payout] client-supplied processedBy (${args.processedBy}) does not ` +
          `match the authenticated caller (${processedBy}); using the caller`,
      );
    }

    return await ctx.runAction(internal.data.agent_payment_requests.executePayout, {
      requestId: args.requestId,
      processedBy,
    });
  },
});

/**
 * Performs the actual Paystack transfer. Internal by construction — no auth
 * check inside, because it cannot be called by a client.
 */
export const executePayout = internalAction({
  args: {
    requestId: v.id("agent_payment_requests"),
    processedBy: v.id("users"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ transferCode: string; reference: string }> => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new Error("PAYSTACK_SECRET_KEY is not configured");

    const req:
      | (Doc<"agent_payment_requests"> & {
          agent: Doc<"agents"> | null;
        })
      | null = await ctx.runQuery(
      internal.data.agent_payment_requests.getRequestForAction,
      { requestId: args.requestId },
    );

    if (!req) throw new ConvexError("Payment request not found.");
    if (req.status !== "approved") {
      throw new ConvexError(
        `This request cannot be processed — current status is "${req.status}". Please approve it first.`,
      );
    }
    if (!req.agent) throw new ConvexError("Agent record not found.");
    if (!req.agent.paystack_recipient_code) {
      throw new ConvexError(
        "Agent does not have a registered M-Pesa recipient yet. Set up their Paystack recipient before processing.",
      );
    }

    const reference = `agent-payout-${args.requestId.slice(0, 8)}-${Date.now()}`;

    const body = await paystackRequest(secret, "/transfer", {
      method: "POST",
      body: JSON.stringify({
        source: "balance",
        amount: req.amount * 100, // Convert to cents
        recipient: req.agent.paystack_recipient_code,
        reason: "Agent commission payout",
        reference,
        currency: "KES",
      }),
    });

    if (!isRecord(body) || !isRecord(body.data)) {
      throw new Error("Unexpected response from Paystack /transfer");
    }

    const transferCode =
      typeof body.data.transfer_code === "string"
        ? body.data.transfer_code
        : "";

    await ctx.runMutation(internal.data.agent_payment_requests.markRequestPaid, {
      id: args.requestId,
      transferCode,
      reference,
      processedBy: args.processedBy,
    });

    return { transferCode, reference };
  },
});

// ── Internal helpers for actions ───────────────────────────────

/**
 * Authorisation gate usable from an `action`.
 *
 * `assertPermission` needs `ctx.db` to resolve the caller's role, which actions
 * do not have. Wrapping it in an `internalQuery` lets an action authorise itself
 * — the caller's identity propagates through `ctx.runQuery` — and returns the
 * acting user id so audit fields are stamped server-side rather than trusted
 * from the client.
 *
 * `agents:UPDATE` is the gate for every payout operation. Verified against the
 * live roles table: SUPER ADMIN holds it, so this does not lock out the four
 * users who actually administer payouts.
 */
export const assertPayoutPermission = internalQuery({
  args: {},
  handler: async (ctx): Promise<Id<"users">> => {
    const { user } = await assertPermission(ctx, "agents:UPDATE");
    return user._id;
  },
});

export const getAgentForAction = internalQuery({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.agentId);
  },
});

export const getUserForAction = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const getRequestForAction = internalQuery({
  args: { requestId: v.id("agent_payment_requests") },
  handler: async (ctx, args) => {
    const req = await ctx.db.get(args.requestId);
    if (!req) return null;
    const agent = await ctx.db.get(req.agent_id);
    return { ...req, agent };
  },
});

export const patchAgentRecipient = internalMutation({
  args: {
    agentId: v.id("agents"),
    mpesaNumber: v.string(),
    recipientCode: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.agentId, {
      mpesa_number: normalizeMpesaPhone(args.mpesaNumber),
      paystack_recipient_code: args.recipientCode,
    });
  },
});

/**
 * The caller's own payout requests, newest first.
 *
 * `getAgentPaymentRequests` above took `agentId` as an argument with no auth, so
 * an agent id was enough to read another agent's payout history — amounts,
 * dates, and which requests were refused. Auth-derived, and bounded.
 */
export const getMyPayoutRequests = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const caller = await getAuthUserOrNull(ctx);
    if (!caller) return [];

    const agent = await ctx.db
      .query("agents")
      .withIndex("by_user", (q) => q.eq("user_id", caller.user._id))
      .first();
    if (!agent) return [];

    const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
    const rows = await ctx.db
      .query("agent_payment_requests")
      .withIndex("by_agent", (q) => q.eq("agent_id", agent._id))
      .order("desc")
      .take(limit);

    return rows.map((row) => ({
      _id: row._id,
      amount: row.amount,
      status: row.status,
      requested_at: row.requested_at,
      processed_at: row.processed_at ?? null,
      // Whatever the admin recorded when refusing. Shown to the agent, because a
      // rejection with no reason is a support ticket.
      rejection_reason: row.rejection_reason ?? null,
    }));
  },
});

/**
 * Open a payout request against the caller's own agent record.
 *
 * A thin wrapper over `createPaymentRequest`, which already asserts ownership —
 * the point of this one is that it takes NO agent id. Passing an id that is then
 * checked against the caller works, but it means the client holds and sends an
 * identifier it has no business choosing, and every such argument is one
 * refactor away from being trusted.
 */
export const requestMyPayout = mutation({
  args: { amount: v.number() },
  handler: async (ctx, args) => {
    const { user } = await getAuthUser(ctx);

    const agent = await ctx.db
      .query("agents")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();
    if (!agent) throw new ConvexError("You are not registered as an agent.");

    return await openPayoutRequest(ctx, agent, args.amount);
  },
});
