import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { assertSuperAdmin } from "./auth.helpers";
import {
  buildDemoPlan,
  categories,
  customers,
  industries,
  pickers,
  products,
  riders,
  summarisePlan,
  vendors,
} from "./lib/demo_data";
import { computeUserSearchText } from "./user/users";

/**
 * Demo data, so the dashboards can be looked at.
 *
 * ── Why a mutation rather than a script ──────────────────────────────────
 *
 * `npx convex run` needs a deploy key carrying `deployment:functions:run`, and
 * this project's does not — the same gap that broke `convex dev` and forced
 * first-run setup into a public mutation. A seeder only the dashboard can invoke
 * is a seeder nobody can invoke.
 *
 * So it is a public mutation, gated on the wildcard permission. That is a real
 * gate, unlike the bootstrap's: by the time anyone wants demo data a super admin
 * exists, so there is a permission to require.
 *
 * ── The manifest, and why cleanup is exact ───────────────────────────────
 *
 * Every id written is recorded in `platform_settings` under
 * `demo_seed_manifest`. `clearDemoData` deletes exactly those rows and nothing
 * else.
 *
 * The alternative — matching by name prefix, or by "created after" — is how a
 * cleanup routine eventually deletes real data. Anyone who seeds a demo will
 * later add a real vendor, and a heuristic that catches it is worse than no
 * cleanup at all. An explicit manifest cannot be wrong about what it created.
 *
 * ── What this deliberately does not do ──────────────────────────────────
 *
 * No Clerk users. The seeded customers, riders and pickers are Convex rows with
 * synthetic `clerkId`s prefixed `demo_`, so they cannot collide with a real
 * Clerk subject and nobody can sign in as them. Creating real Clerk accounts
 * from a seeder would leave accounts behind that this cleanup cannot reach.
 */

const MANIFEST_KEY = "demo_seed_manifest";

/**
 * The phrase a caller must type. Not a nicety: this writes several hundred rows
 * and someone will eventually click it on the wrong deployment.
 */
const CONFIRM_PHRASE = "seed demo data";

interface Manifest {
  seededAt: number;
  seededBy: string;
  /** Table name to the ids written into it. */
  rows: Partial<Record<TableNames, string[]>>;
  summary: Record<string, number>;
}

async function requireSuperAdmin(ctx: MutationCtx): Promise<Doc<"users">> {
  // Shared with platform_settings.ts and anything else gated on holding the
  // wildcard outright, rather than a resource permission — see
  // `auth.helpers.assertSuperAdmin` for why settings-shaped actions need this
  // rather than `assertPermission`.
  const { user } = await assertSuperAdmin(ctx);
  const doc = await ctx.db.get(user._id);
  if (!doc) throw new ConvexError("Your user record could not be read.");
  return doc;
}

async function readManifest(ctx: MutationCtx): Promise<{
  setting: Doc<"platform_settings"> | null;
  manifest: Manifest | null;
}> {
  const setting = await ctx.db
    .query("platform_settings")
    .withIndex("by_key", (q) => q.eq("key", MANIFEST_KEY))
    .unique();
  if (!setting) return { setting: null, manifest: null };
  try {
    return { setting, manifest: JSON.parse(setting.value) as Manifest };
  } catch {
    // A corrupt manifest must not be treated as "nothing was seeded", because
    // that would let a second seed run and orphan the first batch forever.
    throw new ConvexError(
      `The ${MANIFEST_KEY} setting exists but is not valid JSON. Delete it by ` +
        "hand once you have confirmed what it was tracking.",
    );
  }
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export const getDemoDataStatus = query({
  args: {},
  handler: async (ctx) => {
    const setting = await ctx.db
      .query("platform_settings")
      .withIndex("by_key", (q) => q.eq("key", MANIFEST_KEY))
      .unique();

    if (!setting) {
      return { seeded: false as const, canSeed: true, summary: null, seededAt: null };
    }

    let summary: Record<string, number> | null = null;
    let seededAt: number | null = null;
    try {
      const manifest = JSON.parse(setting.value) as Manifest;
      summary = manifest.summary;
      seededAt = manifest.seededAt;
    } catch {
      // Reported rather than thrown: a query that throws makes the settings page
      // blank instead of telling anyone what is wrong.
      summary = null;
    }

    return { seeded: true as const, canSeed: false, summary, seededAt };
  },
});

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

export const seedDemoData = mutation({
  args: {
    confirm: v.string(),
    /** Days of history. Fewer for a quick look, more for a fuller trend. */
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireSuperAdmin(ctx);

    if (args.confirm.trim().toLowerCase() !== CONFIRM_PHRASE) {
      throw new ConvexError(
        `Type "${CONFIRM_PHRASE}" to confirm. This writes several hundred rows.`,
      );
    }

    const { manifest: existing } = await readManifest(ctx);
    if (existing) {
      // Refusing rather than adding a second batch. Two overlapping demo
      // datasets cannot be told apart afterwards, and the manifest could then
      // only clean up one of them.
      throw new ConvexError(
        "Demo data is already present. Clear it first, then seed again.",
      );
    }

    const now = Date.now();
    const days = Math.max(7, Math.min(180, args.days ?? 95));
    const plan = buildDemoPlan({ now, days });
    const summary = summarisePlan(plan);

    // Convex allows several thousand writes per mutation, but a plan that grew
    // past that would fail halfway and leave an unrecorded partial dataset —
    // the exact thing the manifest exists to prevent. Refuse up front instead.
    if (summary.totalWrites > 6000) {
      throw new ConvexError(
        `That would write ${summary.totalWrites} documents, which risks the ` +
          "per-mutation limit. Reduce `days`.",
      );
    }

    const rows: Partial<Record<TableNames, string[]>> = {};
    const track = (table: TableNames, id: string) => {
      (rows[table] ??= []).push(id);
    };

    // ── Roles for the seeded people ──────────────────────────────────────
    //
    // Read rather than created: bootstrap already seeded them, and creating a
    // second "Rider" role here would give the platform two.
    const allRoles = await ctx.db.query("roles").collect();
    const roleByName = new Map(
      allRoles.map((r) => [r.name.trim().toLowerCase(), r._id]),
    );
    const customerRoleId = roleByName.get("customer");
    const riderRoleId = roleByName.get("rider");
    const pickerRoleId = roleByName.get("picker");

    if (!customerRoleId || !riderRoleId || !pickerRoleId) {
      throw new ConvexError(
        "The Customer, Rider and Picker roles are missing. Complete setup at " +
          "/setup first — seeded users need a role or they appear unassigned.",
      );
    }

    // ── Industries ───────────────────────────────────────────────────────
    const industryIds = new Map<string, Id<"industry">>();
    for (const spec of industries) {
      const id = await ctx.db.insert("industry", {
        name: spec.name,
        description: spec.description,
        status: "Active",
        searchText: `${spec.name} ${spec.description}`,
      });
      industryIds.set(spec.key, id);
      track("industry", id);
    }

    // ── Vendors ──────────────────────────────────────────────────────────
    const vendorIds = new Map<string, Id<"vendors">>();
    for (const spec of vendors) {
      const id = await ctx.db.insert("vendors", {
        name: spec.name,
        industry_id: industryIds.get(spec.industryKey),
        contact: {
          name: "Hub Manager",
          phone: "+254700000000",
          email: `${spec.key}@blinkhub.co.ke`,
        },
        address: { address_1: spec.name, city: spec.city, country: "Kenya" },
        coordinates: { lat: spec.lat, lng: spec.lng },
        service_radius: spec.serviceRadius,
        status: "Active",
        commission: spec.commission,
        commission_type: "percentage",
        searchText: `${spec.name} ${spec.city}`,
        updated_at: now,
      });
      vendorIds.set(spec.key, id);
      track("vendors", id);
    }

    // ── Categories ───────────────────────────────────────────────────────
    const categoryIds = new Map<string, Id<"categories">>();
    let sortOrder = 0;
    for (const spec of categories) {
      const id = await ctx.db.insert("categories", {
        name: spec.name,
        slug: spec.key,
        industry: industryIds.get(spec.industryKey),
        status: "active",
        sort_order: sortOrder++,
        searchText: spec.name,
        created_at: now,
        updated_at: now,
      });
      categoryIds.set(spec.key, id);
      track("categories", id);
    }

    // ── Products ─────────────────────────────────────────────────────────
    const productIds: Id<"products">[] = [];
    for (const [index, spec] of products.entries()) {
      const categoryId = categoryIds.get(spec.categoryKey);
      const vendorId = vendorIds.get(spec.vendorKey);
      if (!categoryId || !vendorId) {
        throw new ConvexError(
          `Product "${spec.name}" references an unknown category or vendor.`,
        );
      }
      const sku = `DEMO-${String(index + 1).padStart(4, "0")}`;
      const id = await ctx.db.insert("products", {
        name: spec.name,
        slug: `${spec.categoryKey}-${index}`,
        sku,
        item_number: sku,
        // A scannable barcode, because the picker flow verifies items by scan
        // and demo orders should be pickable end to end.
        barcode: `9${String(700000000000 + index).padStart(12, "0")}`,
        category_id: categoryId,
        vendor_id: vendorId,
        status: spec.quantity > 0 ? "Active" : "Inactive",
        price: spec.price,
        quantity: spec.quantity,
        requires_prescription: spec.requiresPrescription ?? false,
        searchText: `${spec.name} ${sku}`,
        created_at: now,
        updated_at: now,
      });
      productIds.push(id);
      track("products", id);
    }

    // ── People ───────────────────────────────────────────────────────────
    //
    // `clerkId` is prefixed `demo_` so it can never match a real Clerk subject.
    // Nobody can sign in as these accounts, which is the point: they exist to
    // populate figures, not to be used.
    const insertPerson = async (
      person: (typeof customers)[number],
      roleId: Id<"roles">,
      extra: Partial<Doc<"users">> = {},
    ) => {
      const id = await ctx.db.insert("users", {
        clerkId: `demo_${person.email}`,
        email: person.email,
        name: `${person.firstName} ${person.lastName}`,
        first_name: person.firstName,
        last_name: person.lastName,
        phone: person.phone,
        image: "",
        status: "Active",
        role_id: roleId,
        address: {
          address: "Nairobi, Kenya",
          lat: -1.2864,
          lng: 36.8172,
        },
        searchText: computeUserSearchText({
          name: `${person.firstName} ${person.lastName}`,
          first_name: person.firstName,
          last_name: person.lastName,
          email: person.email,
          phone: person.phone,
        }),
        updated_at: now,
        ...extra,
      });
      track("users", id);
      return id;
    };

    const customerIds: Id<"users">[] = [];
    for (const person of customers) {
      customerIds.push(await insertPerson(person, customerRoleId));
    }

    const vendorIdList = [...vendorIds.values()];
    const riderIds: Id<"users">[] = [];
    for (const [index, person] of riders.entries()) {
      riderIds.push(
        await insertPerson(person, riderRoleId, {
          rider_details: {
            vehicle_type: index % 2 === 0 ? "Motorbike" : "Car",
            vehicle_plate: `KDA ${100 + index}A`,
            vendor_id: vendorIdList[index % vendorIdList.length],
            status: "Active",
            rating: 4.2 + (index % 4) * 0.2,
            rating_count: 20 + index * 7,
          },
        }),
      );
    }

    const pickerIds: Id<"users">[] = [];
    for (const [index, person] of pickers.entries()) {
      const vendorId = vendorIdList[index % vendorIdList.length];
      if (!vendorId) throw new ConvexError("No vendor to assign a picker to.");
      pickerIds.push(
        await insertPerson(person, pickerRoleId, {
          picker_details: { vendor_id: vendorId, status: "Active" },
        }),
      );
    }

    // ── Orders, items, shipments, payments ───────────────────────────────
    for (const planned of plan.orders) {
      const vendorId = vendorIds.get(planned.vendorKey);
      const customerId = customerIds[planned.customerIndex];
      const vendorSpec = vendors.find((vnd) => vnd.key === planned.vendorKey);
      if (!vendorId || !customerId || !vendorSpec) {
        throw new ConvexError("Planned order references something unknown.");
      }
      const customer = customers[planned.customerIndex]!;

      const pickerId =
        planned.pickerIndex === null
          ? undefined
          : pickerIds[planned.pickerIndex];

      const orderId = await ctx.db.insert("orders", {
        reference: planned.reference,
        order_date: planned.orderDate,
        vendor_id: vendorId,
        user_id: customerId,
        service_radius: vendorSpec.serviceRadius,
        order_status: planned.orderStatus,
        payment_status: planned.paymentStatus,
        payment_method: planned.paymentMethod,
        payment_mode: planned.paymentMode,
        subtotal_amount: planned.subtotal,
        tax_amount: planned.tax,
        discount_amount: planned.discount,
        delivery_fee: planned.deliveryFee,
        total_amount: planned.total,
        payment_reference: planned.paid
          ? `demo_ref_${planned.reference}`
          : undefined,
        assigned_picker_id: pickerId,
        rider_id: planned.shipment
          ? riderIds[planned.shipment.riderIndex]
          : undefined,
        address: {
          address_1: "Riverside Drive",
          city: "Nairobi",
          country: "Kenya",
          lat: -1.2864,
          lng: 36.8172,
        },
        receiver_contact: {
          name: `${customer.firstName} ${customer.lastName}`,
          phone: customer.phone,
          email: customer.email,
        },
        searchText: `${planned.reference} ${customer.firstName} ${customer.lastName}`,
        payment_collected_at: planned.paid ? planned.orderDate : undefined,
        updated_at: planned.orderDate,
      });
      track("orders", orderId);

      for (const item of planned.items) {
        const spec = products[item.productIndex]!;
        const productId = productIds[item.productIndex];
        if (!productId) throw new ConvexError("Planned item has no product.");
        const lineTotal = spec.price * item.quantity;
        const itemId = await ctx.db.insert("order_items", {
          order_id: orderId,
          product_id: productId,
          vendor_id: vendorId,
          name: spec.name,
          sku: `DEMO-${String(item.productIndex + 1).padStart(4, "0")}`,
          quantity: item.quantity,
          price: spec.price,
          tax: Math.round(lineTotal * 0.16),
          discount: 0,
          total: lineTotal,
          requires_prescription: spec.requiresPrescription ?? false,
          // Delivered orders were picked, so the per-unit scan counters are
          // consistent with the lifecycle rather than left at zero.
          is_picked: planned.orderStatus === "Delivered",
          picked_quantity:
            planned.orderStatus === "Delivered" ? item.quantity : 0,
        });
        track("order_items", itemId);
      }

      if (planned.shipment) {
        const riderId = riderIds[planned.shipment.riderIndex];
        if (!riderId) throw new ConvexError("Planned shipment has no rider.");
        const shipmentId = await ctx.db.insert("shipments", {
          order_id: orderId,
          vendor_id: vendorId,
          rider_id: riderId,
          pickup_address: {
            address_1: vendorSpec.name,
            city: vendorSpec.city,
            country: "Kenya",
          },
          delivery_address: {
            address_1: "Riverside Drive",
            city: "Nairobi",
            country: "Kenya",
            lat: -1.2864,
            lng: 36.8172,
          },
          status: planned.shipment.status,
          updated_at: planned.shipment.updatedAt,
          searchText: `${planned.reference} ${vendorSpec.name}`,
        });
        track("shipments", shipmentId);
      }

      if (planned.paid) {
        const paymentId = await ctx.db.insert("payments", {
          order_id: orderId,
          user_id: customerId,
          customerEmail: customer.email,
          payment_method: planned.paymentMethod,
          amount: planned.total,
          reference: `demo_ref_${planned.reference}`,
          payment_date: planned.orderDate,
          status: "Successful",
          payer_type: "customer",
          payer_phone: customer.phone,
          searchText: `demo_ref_${planned.reference} ${customer.email}`,
          updated_at: planned.orderDate,
        });
        track("payments", paymentId);
      }
    }

    // ── The manifest, written last ───────────────────────────────────────
    //
    // Last on purpose: if anything above throws, the whole mutation rolls back,
    // so there is never a manifest describing rows that do not exist, nor rows
    // without a manifest.
    const manifest: Manifest = {
      seededAt: now,
      seededBy: actor.email ?? actor._id,
      rows,
      summary: {
        industries: summary.industries,
        vendors: summary.vendors,
        categories: summary.categories,
        products: summary.products,
        customers: summary.customers,
        riders: summary.riders,
        pickers: summary.pickers,
        orders: summary.orders,
        orderItems: summary.orderItems,
        shipments: summary.shipments,
        payments: summary.payments,
        days,
      },
    };

    const settingId = await ctx.db.insert("platform_settings", {
      key: MANIFEST_KEY,
      value: JSON.stringify(manifest),
      description:
        "Ids created by seedDemoData, so clearDemoData can remove exactly those.",
      updated_by: actor._id,
      updated_at: now,
    });

    // The typed summary rather than a spread of `manifest.summary`, which is a
    // Record<string, number> and would erase the field names for the caller.
    return {
      industries: summary.industries,
      vendors: summary.vendors,
      categories: summary.categories,
      products: summary.products,
      customers: summary.customers,
      riders: summary.riders,
      pickers: summary.pickers,
      orders: summary.orders,
      orderItems: summary.orderItems,
      shipments: summary.shipments,
      payments: summary.payments,
      days,
      manifestId: settingId,
    };
  },
});

// ---------------------------------------------------------------------------
// Clear
// ---------------------------------------------------------------------------

export const clearDemoData = mutation({
  args: { confirm: v.string() },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);

    if (args.confirm.trim().toLowerCase() !== "clear demo data") {
      throw new ConvexError('Type "clear demo data" to confirm.');
    }

    const { setting, manifest } = await readManifest(ctx);
    if (!setting || !manifest) {
      throw new ConvexError("No demo data is recorded for this deployment.");
    }

    // Children before parents, so nothing is briefly orphaned mid-transaction.
    // Convex rolls back on failure so it could not be observed, but the order
    // also means a partial read by a concurrent query never sees an order whose
    // items have gone.
    const order: TableNames[] = [
      "payments",
      "shipments",
      "order_items",
      "orders",
      "products",
      "categories",
      "users",
      "vendors",
      "industry",
    ];

    let deleted = 0;
    let missing = 0;
    for (const table of order) {
      for (const id of manifest.rows[table] ?? []) {
        const doc = await ctx.db.get(id as Id<TableNames>);
        if (!doc) {
          // Already gone — deleted by hand, most likely. Counted rather than
          // thrown, because refusing to finish would leave the rest behind.
          missing++;
          continue;
        }
        await ctx.db.delete(id as Id<TableNames>);
        deleted++;
      }
    }

    await ctx.db.delete(setting._id);

    return { deleted, alreadyGone: missing };
  },
});
