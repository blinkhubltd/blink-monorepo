/**
 * The shape of the demo dataset.
 *
 * ── Why this is pure ─────────────────────────────────────────────────────
 *
 * Seeding is a one-shot operation nobody reruns, against dashboards that mostly
 * do not say when a figure is wrong. A dataset where every order happens to be
 * Delivered, or where nothing falls in the previous period, produces a dashboard
 * that looks populated and demonstrates nothing — and the only way to notice is
 * to read every widget carefully.
 *
 * So the dataset is generated here, without a database, and asserted in
 * `tests/demo-data.test.ts`: that the statuses spread, that both periods have
 * orders so the comparison arrows resolve, that some products never sell so
 * "not selling" is non-zero, that some customers repeat so the returning split
 * is not 100% new. The mutation in `seed.ts` only writes what this produces.
 *
 * ── Deterministic on purpose ─────────────────────────────────────────────
 *
 * A seeded PRNG rather than `Math.random()`, so the same `seed` and `now` give
 * the same dataset. That is what makes the tests meaningful and lets two people
 * compare the same screen. `now` is a parameter for the same reason it is in
 * `time_range.ts`.
 */

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

/**
 * mulberry32 — small, fast, good enough for fixtures.
 *
 * Written out rather than pulled in as a dependency: it is eight lines, and a
 * seeded PRNG is exactly the kind of thing that must not change under a version
 * bump, or previously-recorded expectations stop matching.
 */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;

/** Integer in [min, max]. */
function int(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  // Non-empty by construction at every call site; the assertion keeps the
  // return type honest without `!` at each use.
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error("pick() on an empty list");
  return item;
}

/**
 * Pick by weight, so status mixes look like a business rather than a uniform
 * spread. Weights need not sum to anything in particular.
 */
function weighted<T extends string>(
  rng: Rng,
  weights: readonly (readonly [T, number])[],
): T {
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [value, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return weights[weights.length - 1]![0];
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

const DAY = 86_400_000;

export interface IndustrySpec {
  key: string;
  name: string;
  description: string;
}

export const industries: IndustrySpec[] = [
  {
    key: "pharmacy",
    name: "Pharmacy",
    description: "Prescription and over-the-counter medicine.",
  },
  {
    key: "grocery",
    name: "Grocery",
    description: "Everyday food and household goods.",
  },
  {
    key: "electronics",
    name: "Electronics",
    description: "Phones, accessories and small appliances.",
  },
];

export interface VendorSpec {
  key: string;
  name: string;
  industryKey: string;
  city: string;
  lat: number;
  lng: number;
  serviceRadius: number;
  commission: number;
}

/** Nairobi coordinates, so the map screens land somewhere real. */
export const vendors: VendorSpec[] = [
  {
    key: "westlands-pharmacy",
    name: "Blink Pharmacy Westlands",
    industryKey: "pharmacy",
    city: "Nairobi",
    lat: -1.2649,
    lng: 36.8033,
    serviceRadius: 7000,
    commission: 12,
  },
  {
    key: "kilimani-grocer",
    name: "Blink Fresh Kilimani",
    industryKey: "grocery",
    city: "Nairobi",
    lat: -1.2921,
    lng: 36.7833,
    serviceRadius: 6000,
    commission: 10,
  },
  {
    key: "cbd-electronics",
    name: "Blink Tech CBD",
    industryKey: "electronics",
    city: "Nairobi",
    lat: -1.2841,
    lng: 36.8233,
    serviceRadius: 9000,
    commission: 8,
  },
  {
    key: "karen-grocer",
    name: "Blink Fresh Karen",
    industryKey: "grocery",
    city: "Nairobi",
    lat: -1.3197,
    lng: 36.7076,
    serviceRadius: 8000,
    commission: 10,
  },
];

export interface CategorySpec {
  key: string;
  name: string;
  industryKey: string;
}

export const categories: CategorySpec[] = [
  { key: "pain-relief", name: "Pain Relief", industryKey: "pharmacy" },
  { key: "cold-flu", name: "Cold & Flu", industryKey: "pharmacy" },
  { key: "vitamins", name: "Vitamins", industryKey: "pharmacy" },
  { key: "bakery", name: "Bakery", industryKey: "grocery" },
  { key: "dairy", name: "Dairy", industryKey: "grocery" },
  { key: "produce", name: "Fruit & Vegetables", industryKey: "grocery" },
  { key: "pantry", name: "Pantry", industryKey: "grocery" },
  { key: "phones", name: "Phones", industryKey: "electronics" },
  { key: "audio", name: "Audio", industryKey: "electronics" },
  { key: "cables", name: "Cables & Chargers", industryKey: "electronics" },
];

export interface ProductSpec {
  name: string;
  categoryKey: string;
  vendorKey: string;
  /** Kenyan shillings. */
  price: number;
  quantity: number;
  /** Relative likelihood of appearing in an order. 0 means it never sells. */
  popularity: number;
  requiresPrescription?: boolean;
}

/**
 * Prices are plausible Nairobi retail, in KES, and the spread matters: a
 * catalogue where everything costs the same makes the basket-size bands and the
 * units-versus-revenue table meaningless.
 *
 * `popularity: 0` is deliberate on several rows. Products that never sell are
 * what make the products page's "not selling" figure real, and that figure is
 * the one thing that page exists to answer.
 */
export const products: ProductSpec[] = [
  // Pharmacy — Westlands
  { name: "Panadol Extra 24s", categoryKey: "pain-relief", vendorKey: "westlands-pharmacy", price: 320, quantity: 140, popularity: 10 },
  { name: "Brufen 400mg 20s", categoryKey: "pain-relief", vendorKey: "westlands-pharmacy", price: 450, quantity: 96, popularity: 7 },
  { name: "Diclofenac Gel 30g", categoryKey: "pain-relief", vendorKey: "westlands-pharmacy", price: 680, quantity: 8, popularity: 4 },
  { name: "Amoxicillin 500mg 21s", categoryKey: "cold-flu", vendorKey: "westlands-pharmacy", price: 950, quantity: 40, popularity: 5, requiresPrescription: true },
  { name: "Strepsils Honey 24s", categoryKey: "cold-flu", vendorKey: "westlands-pharmacy", price: 410, quantity: 120, popularity: 8 },
  { name: "Actifed Syrup 100ml", categoryKey: "cold-flu", vendorKey: "westlands-pharmacy", price: 560, quantity: 3, popularity: 3 },
  { name: "Vitamin C 1000mg 30s", categoryKey: "vitamins", vendorKey: "westlands-pharmacy", price: 890, quantity: 75, popularity: 6 },
  { name: "Omega 3 Fish Oil 60s", categoryKey: "vitamins", vendorKey: "westlands-pharmacy", price: 1850, quantity: 30, popularity: 3 },
  { name: "Prenatal Multivitamin 60s", categoryKey: "vitamins", vendorKey: "westlands-pharmacy", price: 2400, quantity: 18, popularity: 0 },
  { name: "Zinc Lozenges 20s", categoryKey: "vitamins", vendorKey: "westlands-pharmacy", price: 520, quantity: 0, popularity: 0 },

  // Grocery — Kilimani
  { name: "Superloaf White Bread 400g", categoryKey: "bakery", vendorKey: "kilimani-grocer", price: 75, quantity: 200, popularity: 14 },
  { name: "Brown Bread 400g", categoryKey: "bakery", vendorKey: "kilimani-grocer", price: 90, quantity: 160, popularity: 9 },
  { name: "Croissant 4pk", categoryKey: "bakery", vendorKey: "kilimani-grocer", price: 340, quantity: 24, popularity: 4 },
  { name: "Brookside Fresh Milk 500ml", categoryKey: "dairy", vendorKey: "kilimani-grocer", price: 70, quantity: 240, popularity: 16 },
  { name: "Blue Band 500g", categoryKey: "dairy", vendorKey: "kilimani-grocer", price: 380, quantity: 90, popularity: 6 },
  { name: "Gouda Cheese 250g", categoryKey: "dairy", vendorKey: "kilimani-grocer", price: 720, quantity: 6, popularity: 3 },
  { name: "Bananas 1kg", categoryKey: "produce", vendorKey: "kilimani-grocer", price: 160, quantity: 110, popularity: 11 },
  { name: "Tomatoes 1kg", categoryKey: "produce", vendorKey: "kilimani-grocer", price: 180, quantity: 95, popularity: 10 },
  { name: "Avocado 3pk", categoryKey: "produce", vendorKey: "kilimani-grocer", price: 210, quantity: 60, popularity: 7 },
  { name: "Sukuma Wiki Bunch", categoryKey: "produce", vendorKey: "kilimani-grocer", price: 40, quantity: 0, popularity: 0 },
  { name: "Pishori Rice 2kg", categoryKey: "pantry", vendorKey: "kilimani-grocer", price: 480, quantity: 70, popularity: 8 },
  { name: "Cooking Oil 2L", categoryKey: "pantry", vendorKey: "kilimani-grocer", price: 690, quantity: 55, popularity: 7 },
  { name: "Ketepa Tea 500g", categoryKey: "pantry", vendorKey: "kilimani-grocer", price: 420, quantity: 80, popularity: 5 },
  { name: "Royco Cubes 24s", categoryKey: "pantry", vendorKey: "kilimani-grocer", price: 130, quantity: 9, popularity: 4 },

  // Grocery — Karen
  { name: "Sourdough Loaf", categoryKey: "bakery", vendorKey: "karen-grocer", price: 450, quantity: 30, popularity: 5 },
  { name: "Organic Whole Milk 1L", categoryKey: "dairy", vendorKey: "karen-grocer", price: 190, quantity: 85, popularity: 8 },
  { name: "Greek Yoghurt 500g", categoryKey: "dairy", vendorKey: "karen-grocer", price: 560, quantity: 40, popularity: 6 },
  { name: "Mixed Berries 250g", categoryKey: "produce", vendorKey: "karen-grocer", price: 780, quantity: 20, popularity: 4 },
  { name: "Baby Spinach 200g", categoryKey: "produce", vendorKey: "karen-grocer", price: 260, quantity: 35, popularity: 5 },
  { name: "Olive Oil 500ml", categoryKey: "pantry", vendorKey: "karen-grocer", price: 1450, quantity: 22, popularity: 3 },
  { name: "Quinoa 500g", categoryKey: "pantry", vendorKey: "karen-grocer", price: 890, quantity: 15, popularity: 0 },
  { name: "Almond Butter 340g", categoryKey: "pantry", vendorKey: "karen-grocer", price: 1250, quantity: 4, popularity: 2 },

  // Electronics — CBD
  { name: "Samsung A15 128GB", categoryKey: "phones", vendorKey: "cbd-electronics", price: 21500, quantity: 12, popularity: 3 },
  { name: "Tecno Spark 20", categoryKey: "phones", vendorKey: "cbd-electronics", price: 15800, quantity: 18, popularity: 4 },
  { name: "iPhone 13 128GB", categoryKey: "phones", vendorKey: "cbd-electronics", price: 78000, quantity: 3, popularity: 1 },
  { name: "Oraimo FreePods 4", categoryKey: "audio", vendorKey: "cbd-electronics", price: 3200, quantity: 45, popularity: 7 },
  { name: "JBL Go 3 Speaker", categoryKey: "audio", vendorKey: "cbd-electronics", price: 5400, quantity: 26, popularity: 5 },
  { name: "Wired Earphones 3.5mm", categoryKey: "audio", vendorKey: "cbd-electronics", price: 450, quantity: 130, popularity: 9 },
  { name: "Studio Headphones", categoryKey: "audio", vendorKey: "cbd-electronics", price: 12500, quantity: 7, popularity: 0 },
  { name: "USB-C Cable 1m", categoryKey: "cables", vendorKey: "cbd-electronics", price: 350, quantity: 200, popularity: 12 },
  { name: "20W Fast Charger", categoryKey: "cables", vendorKey: "cbd-electronics", price: 1200, quantity: 64, popularity: 8 },
  { name: "Power Bank 20000mAh", categoryKey: "cables", vendorKey: "cbd-electronics", price: 3800, quantity: 5, popularity: 4 },
  { name: "HDMI Cable 2m", categoryKey: "cables", vendorKey: "cbd-electronics", price: 900, quantity: 0, popularity: 0 },
];

export interface PersonSpec {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export const customers: PersonSpec[] = [
  { firstName: "Amina", lastName: "Wanjiru", email: "amina.wanjiru@example.co.ke", phone: "+254700100101" },
  { firstName: "Brian", lastName: "Otieno", email: "brian.otieno@example.co.ke", phone: "+254700100102" },
  { firstName: "Chege", lastName: "Mwangi", email: "chege.mwangi@example.co.ke", phone: "+254700100103" },
  { firstName: "Diana", lastName: "Kamau", email: "diana.kamau@example.co.ke", phone: "+254700100104" },
  { firstName: "Elias", lastName: "Kiprono", email: "elias.kiprono@example.co.ke", phone: "+254700100105" },
  { firstName: "Faith", lastName: "Njeri", email: "faith.njeri@example.co.ke", phone: "+254700100106" },
  { firstName: "Gerald", lastName: "Omondi", email: "gerald.omondi@example.co.ke", phone: "+254700100107" },
  { firstName: "Halima", lastName: "Abdi", email: "halima.abdi@example.co.ke", phone: "+254700100108" },
  { firstName: "Ian", lastName: "Mutua", email: "ian.mutua@example.co.ke", phone: "+254700100109" },
  { firstName: "Joy", lastName: "Achieng", email: "joy.achieng@example.co.ke", phone: "+254700100110" },
  { firstName: "Kevin", lastName: "Barasa", email: "kevin.barasa@example.co.ke", phone: "+254700100111" },
  { firstName: "Lucy", lastName: "Wambui", email: "lucy.wambui@example.co.ke", phone: "+254700100112" },
  { firstName: "Martin", lastName: "Kariuki", email: "martin.kariuki@example.co.ke", phone: "+254700100113" },
  { firstName: "Nadia", lastName: "Hassan", email: "nadia.hassan@example.co.ke", phone: "+254700100114" },
];

export const riders: PersonSpec[] = [
  { firstName: "Peter", lastName: "Njoroge", email: "peter.njoroge@blinkriders.co.ke", phone: "+254700200201" },
  { firstName: "Sammy", lastName: "Kilonzo", email: "sammy.kilonzo@blinkriders.co.ke", phone: "+254700200202" },
  { firstName: "Tabitha", lastName: "Mueni", email: "tabitha.mueni@blinkriders.co.ke", phone: "+254700200203" },
  { firstName: "Victor", lastName: "Ochieng", email: "victor.ochieng@blinkriders.co.ke", phone: "+254700200204" },
  { firstName: "Wanjiku", lastName: "Ndegwa", email: "wanjiku.ndegwa@blinkriders.co.ke", phone: "+254700200205" },
];

export const pickers: PersonSpec[] = [
  { firstName: "Alice", lastName: "Nyambura", email: "alice.nyambura@blinkhub.co.ke", phone: "+254700300301" },
  { firstName: "Dennis", lastName: "Maina", email: "dennis.maina@blinkhub.co.ke", phone: "+254700300302" },
  { firstName: "Esther", lastName: "Wairimu", email: "esther.wairimu@blinkhub.co.ke", phone: "+254700300303" },
  { firstName: "Felix", lastName: "Oduor", email: "felix.oduor@blinkhub.co.ke", phone: "+254700300304" },
];

// ---------------------------------------------------------------------------
// The order plan
// ---------------------------------------------------------------------------

export interface PlannedItem {
  /** Index into `products`. */
  productIndex: number;
  quantity: number;
}

export interface PlannedShipment {
  /** Index into `riders`. */
  riderIndex: number;
  status:
    | "Awaiting Pickup"
    | "Picked Up"
    | "Out for Delivery"
    | "Delivered"
    | "Failed Delivery";
  /** When the shipment row was conceptually created. */
  createdAt: number;
  /** Last transition. For a delivered shipment, when it was delivered. */
  updatedAt: number;
}

export interface PlannedOrder {
  reference: string;
  orderDate: number;
  vendorKey: string;
  /** Index into `customers`. */
  customerIndex: number;
  /** Index into `pickers`, or null when nobody has been assigned. */
  pickerIndex: number | null;
  orderStatus:
    | "Pending"
    | "Confirmed"
    | "Processing"
    | "Pickup"
    | "Delivery"
    | "Delivered"
    | "Cancelled"
    | "Refunded";
  paymentStatus: "Unpaid" | "Paid" | "Refunded";
  paymentMethod:
    | "Card"
    | "Mobile Money"
    | "Mpesa"
    | "Cash on Delivery"
    | "Bank Transfer"
    | "Paystack";
  paymentMode: "pay_now" | "pay_on_delivery";
  items: PlannedItem[];
  subtotal: number;
  tax: number;
  discount: number;
  deliveryFee: number;
  total: number;
  shipment: PlannedShipment | null;
  /** Whether a payments row should exist. */
  paid: boolean;
}

export interface DemoPlan {
  orders: PlannedOrder[];
  /** The window the orders span, for the summary the UI reports. */
  from: number;
  to: number;
}

/**
 * Status mixes, as weights.
 *
 * Shaped like a hub that mostly works: most orders complete, a tail is still
 * moving, a few fail. A uniform spread would make the pipeline bar and the
 * success rate meaningless, and an all-Delivered dataset would make them look
 * broken in the other direction.
 */
const SETTLED_STATUS = [
  ["Delivered", 78],
  ["Cancelled", 7],
  ["Refunded", 3],
  ["Delivery", 6],
  ["Processing", 4],
  ["Confirmed", 2],
] as const;

const RECENT_STATUS = [
  ["Delivered", 30],
  ["Delivery", 22],
  ["Pickup", 12],
  ["Processing", 16],
  ["Confirmed", 12],
  ["Pending", 8],
] as const;

const PAYMENT_METHODS = [
  ["Mpesa", 44],
  ["Card", 20],
  ["Paystack", 14],
  ["Cash on Delivery", 12],
  ["Mobile Money", 7],
  ["Bank Transfer", 3],
] as const;

/**
 * Build the dataset.
 *
 * @param now   Upper bound of the window. Orders run backwards from here.
 * @param days  How far back to generate. 95 covers this month, last month and
 *              part of the one before, so every period the selector offers has
 *              data AND a previous period to compare against — otherwise every
 *              delta reads "No prior period to compare".
 */
export function buildDemoPlan({
  now,
  days = 95,
  seed = 20260826,
  ordersPerDay = [0, 4] as const,
}: {
  now: number;
  days?: number;
  seed?: number;
  ordersPerDay?: readonly [number, number];
}): DemoPlan {
  const rng = makeRng(seed);
  const orders: PlannedOrder[] = [];

  // Customers are not uniform: a few order often, most occasionally. Without
  // this the top-customers table is a flat list and "orders per customer" is
  // always about 1, so nothing on the customers page says anything.
  const customerWeight = customers.map((_, i) => (i < 4 ? 6 : i < 9 ? 3 : 1));
  const customerPool: number[] = [];
  customerWeight.forEach((weight, index) => {
    for (let n = 0; n < weight; n++) customerPool.push(index);
  });

  const sellable = products
    .map((product, index) => ({ product, index }))
    .filter((entry) => entry.product.popularity > 0);
  const productPool: number[] = [];
  for (const entry of sellable) {
    for (let n = 0; n < entry.product.popularity; n++) {
      productPool.push(entry.index);
    }
  }

  let reference = 1000;

  for (let dayOffset = days; dayOffset >= 0; dayOffset--) {
    const dayStart = now - dayOffset * DAY;

    // A gentle upward trend plus a weekend dip, so the trend line has a shape
    // and month-over-month shows growth rather than noise.
    const trend = 1 + (days - dayOffset) / days; // 1.0 -> 2.0
    const weekday = new Date(dayStart).getDay();
    const weekendFactor = weekday === 0 || weekday === 6 ? 0.65 : 1;
    const base = int(rng, ordersPerDay[0], ordersPerDay[1]);
    const count = Math.max(
      0,
      Math.round(base * trend * weekendFactor * (0.7 + rng() * 0.6)),
    );

    for (let n = 0; n < count; n++) {
      // Placed during trading hours rather than all at midnight, so the
      // local-time `dayKey` bucketing is exercised against realistic stamps —
      // an order at 21:00 Nairobi is the next day in UTC, which is the bug
      // `dayKey` exists to avoid.
      const dayFloor = dayStart - (dayStart % DAY);
      const stamp = Math.min(
        dayFloor + Math.round((8 + rng() * 12) * 3_600_000),
        now,
      );

      const vendor = pick(rng, vendors);
      const vendorProducts = productPool.filter(
        (index) => products[index]!.vendorKey === vendor.key,
      );
      // A vendor with nothing sellable would produce an empty order; skip
      // rather than write one, because a zero-item order breaks basket maths.
      if (vendorProducts.length === 0) continue;

      const itemCount = int(rng, 1, 4);
      const chosen = new Map<number, number>();
      for (let k = 0; k < itemCount; k++) {
        const productIndex = pick(rng, vendorProducts);
        const quantity =
          products[productIndex]!.price > 5000 ? 1 : int(rng, 1, 3);
        chosen.set(productIndex, (chosen.get(productIndex) ?? 0) + quantity);
      }

      const items: PlannedItem[] = [...chosen.entries()].map(
        ([productIndex, quantity]) => ({ productIndex, quantity }),
      );

      const subtotal = items.reduce(
        (sum, item) => sum + products[item.productIndex]!.price * item.quantity,
        0,
      );
      // Kenya VAT is 16%, and the free-delivery threshold mirrors the 2000 the
      // old cart hardcoded, so the bands on the orders page split sensibly.
      const tax = Math.round(subtotal * 0.16);
      const discount = rng() < 0.12 ? Math.round(subtotal * 0.05) : 0;
      const deliveryFee = subtotal >= 2000 ? 0 : 150;
      const total = subtotal + tax - discount + deliveryFee;

      // Anything older than a week has had time to finish. The recent window
      // is what fills the in-flight columns and the awaiting-picker callout, so
      // it has to be wide enough to contain a few of each — at four days it was
      // not, and the callout came out empty.
      const settled = dayOffset > 7;
      const orderStatus = weighted(rng, settled ? SETTLED_STATUS : RECENT_STATUS);

      const paymentMethod = weighted(rng, PAYMENT_METHODS);
      const paymentMode =
        paymentMethod === "Cash on Delivery" ? "pay_on_delivery" : "pay_now";

      // Payment state follows the lifecycle rather than being rolled
      // independently: a Delivered order that is Unpaid would be nonsense, and
      // a dashboard reader would rightly not trust anything else on the screen.
      let paymentStatus: PlannedOrder["paymentStatus"];
      if (orderStatus === "Refunded") paymentStatus = "Refunded";
      else if (orderStatus === "Cancelled") paymentStatus = "Unpaid";
      else if (paymentMode === "pay_on_delivery") {
        paymentStatus = orderStatus === "Delivered" ? "Paid" : "Unpaid";
      } else {
        // Prepaid: usually paid, occasionally still awaiting settlement — which
        // is what gives the "Unpaid" tile a non-zero number to act on.
        paymentStatus = rng() < 0.9 ? "Paid" : "Unpaid";
      }

      // A Pending order has not been confirmed yet, so nothing has been
      // assigned to it — that is what Pending MEANS, and giving it a picker
      // would contradict the status. Confirmed-but-unassigned is the real
      // "waiting for a picker" case, and it has to occur or the operations
      // callout never renders. Everything past Confirmed has one by definition:
      // it could not have been picked otherwise.
      const pickerAssigned =
        orderStatus === "Pending"
          ? false
          : orderStatus === "Confirmed"
            ? rng() < 0.6
            : rng() < 0.97;

      // Shipments exist once an order leaves the hub. A couple of percent are
      // deliberately missing one, so the shipments page's "orders with no
      // shipment" integrity figure is not always zero.
      let shipment: PlannedShipment | null = null;
      const shipped =
        orderStatus === "Delivered" ||
        orderStatus === "Delivery" ||
        orderStatus === "Pickup" ||
        orderStatus === "Refunded";

      if (shipped && rng() > 0.03) {
        const createdAt = stamp + int(rng, 20, 180) * 60_000;
        let status: PlannedShipment["status"];
        if (orderStatus === "Delivered" || orderStatus === "Refunded") {
          // A small share of finished deliveries fail, so the success rate is
          // under 100% and the failed tile has something in it.
          status = rng() < 0.07 ? "Failed Delivery" : "Delivered";
        } else if (orderStatus === "Delivery") {
          status = rng() < 0.5 ? "Out for Delivery" : "Picked Up";
        } else {
          status = "Awaiting Pickup";
        }

        // Transit durations, in minutes. Mostly under two hours with a long
        // tail — which is precisely why the dashboards report a median.
        const transit =
          rng() < 0.85 ? int(rng, 25, 110) : int(rng, 180, 1400);
        shipment = {
          riderIndex: int(rng, 0, riders.length - 1),
          status,
          createdAt,
          updatedAt:
            status === "Delivered" || status === "Failed Delivery"
              ? createdAt + transit * 60_000
              : createdAt + int(rng, 5, 40) * 60_000,
        };
      }

      orders.push({
        reference: `BLK-${reference++}`,
        orderDate: Math.min(stamp, now),
        vendorKey: vendor.key,
        customerIndex: pick(rng, customerPool),
        pickerIndex: pickerAssigned ? int(rng, 0, pickers.length - 1) : null,
        orderStatus,
        paymentStatus,
        paymentMethod,
        paymentMode,
        items,
        subtotal,
        tax,
        discount,
        deliveryFee,
        total,
        shipment,
        paid: paymentStatus === "Paid",
      });
    }
  }

  // Chronological, so the seeded rows read naturally in the admin tables.
  orders.sort((a, b) => a.orderDate - b.orderDate);

  return {
    orders,
    from: now - days * DAY,
    to: now,
  };
}

/** Totals the UI can report after seeding, without re-querying. */
export function summarisePlan(plan: DemoPlan) {
  const items = plan.orders.reduce((sum, o) => sum + o.items.length, 0);
  const shipments = plan.orders.filter((o) => o.shipment !== null).length;
  const payments = plan.orders.filter((o) => o.paid).length;
  return {
    orders: plan.orders.length,
    orderItems: items,
    shipments,
    payments,
    industries: industries.length,
    vendors: vendors.length,
    categories: categories.length,
    products: products.length,
    customers: customers.length,
    riders: riders.length,
    pickers: pickers.length,
    /** Every document this plan will write, for the mutation-limit check. */
    totalWrites:
      plan.orders.length +
      items +
      shipments +
      payments +
      industries.length +
      vendors.length +
      categories.length +
      products.length +
      customers.length +
      riders.length +
      pickers.length,
  };
}
