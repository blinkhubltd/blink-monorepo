import { v, ConvexError } from "convex/values";
import {
  mutation,
  query,
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

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
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
        v.literal("paid"),
      ),
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

export const getAgentPaymentRequests = query({
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

export const createPaymentRequest = mutation({
  args: {
    agentId: v.id("agents"),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.amount <= 0) {
      throw new ConvexError("Amount must be greater than zero.");
    }

    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new ConvexError("Agent not found.");

    if (!agent.paystack_recipient_code) {
      throw new ConvexError(
        "Payouts are not enabled for your account. Please contact admin.",
      );
    }

    const balance = agent.balance ?? 0;

    const pendingRequests = await ctx.db
      .query("agent_payment_requests")
      .withIndex("by_agent_status", (q) =>
        q.eq("agent_id", args.agentId).eq("status", "pending"),
      )
      .collect();
    const approvedRequests = await ctx.db
      .query("agent_payment_requests")
      .withIndex("by_agent_status", (q) =>
        q.eq("agent_id", args.agentId).eq("status", "approved"),
      )
      .collect();
    const requestedAmount = [...pendingRequests, ...approvedRequests].reduce(
      (sum, r) => sum + r.amount,
      0,
    );
    const availableBalance = Math.max(0, balance - requestedAmount);

    if (args.amount > availableBalance) {
      throw new ConvexError("Amount cannot exceed your available balance.");
    }

    // Check payout days setting
    const payoutDaysSetting = await ctx.db
      .query("platform_settings")
      .withIndex("by_key", (q) => q.eq("key", "agent_payout_days"))
      .first();

    if (payoutDaysSetting?.value) {
      const allowedDays = payoutDaysSetting.value
        .split(",")
        .map((d) => d.trim().toLowerCase());
      const today = new Date()
        .toLocaleDateString("en-US", { weekday: "long" })
        .toLowerCase();
      if (!allowedDays.includes(today)) {
        throw new ConvexError(
          `Payouts can only be requested on ${payoutDaysSetting.value}.`,
        );
      }
    }

    // Block if there's already a pending request for this agent
    const pending = await ctx.db
      .query("agent_payment_requests")
      .withIndex("by_agent_status", (q) =>
        q.eq("agent_id", args.agentId).eq("status", "pending"),
      )
      .first();

    if (pending) {
      throw new ConvexError("You already have a pending payout request.");
    }

    return await ctx.db.insert("agent_payment_requests", {
      agent_id: args.agentId,
      amount: args.amount,
      status: "pending",
      requested_at: Date.now(),
    });
  },
});

export const updatePaymentRequestStatus = mutation({
  args: {
    id: v.id("agent_payment_requests"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
    processedBy: v.id("users"),
    rejection_reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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
      processed_by: args.processedBy,
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
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new Error("PAYSTACK_SECRET_KEY is not configured");

    // Fetch agent and user details from db via a query
    const agent: Doc<"agents"> | null = await ctx.runQuery(
      internal.agentPaymentRequests.getAgentForAction,
      { agentId: args.agentId },
    );
    if (!agent) throw new Error("Agent not found");

    const user: Doc<"users"> | null = await ctx.runQuery(
      internal.agentPaymentRequests.getUserForAction,
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

    await ctx.runMutation(internal.agentPaymentRequests.patchAgentRecipient, {
      agentId: args.agentId,
      mpesaNumber: args.mpesaNumber,
      recipientCode,
    });

    return { recipientCode };
  },
});

export const processPaymentRequest = action({
  args: {
    requestId: v.id("agent_payment_requests"),
    processedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new Error("PAYSTACK_SECRET_KEY is not configured");

    const req:
      | (Doc<"agent_payment_requests"> & {
          agent: Doc<"agents"> | null;
        })
      | null = await ctx.runQuery(
      internal.agentPaymentRequests.getRequestForAction,
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

    await ctx.runMutation(internal.agentPaymentRequests.markRequestPaid, {
      id: args.requestId,
      transferCode,
      reference,
      processedBy: args.processedBy,
    });

    return { transferCode, reference };
  },
});

// ── Internal helpers for actions ───────────────────────────────

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
