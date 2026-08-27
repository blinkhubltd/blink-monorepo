/**
 * Every platform setting the dashboard can edit, grouped for the page.
 *
 * ── Why a declared model rather than JSX per setting ──────────────────────
 *
 * The page previously hardcoded five `<Card>`s, each with its own Save button
 * and its own copy of the parse/validate/toast logic. Two consequences worth
 * naming:
 *
 *  - Seven of the twelve seeded settings had no UI at all. `platform_settings.ts`
 *    seeds `clearance_batch_wait_minutes`, `clearance_batch_max_orders` and the
 *    three legal versions, and every one was editable only from the Convex
 *    dashboard. The batch settings control when a clearance order dispatches, so
 *    they are operational, not internal.
 *
 *  - Saving five settings meant five separate clicks, each a round trip, with no
 *    indication of which had unsaved edits.
 *
 * Declaring them makes both problems structural: a new setting is a row here,
 * and the save bar covers whatever is dirty.
 *
 * ── Units are converted at the edge ──────────────────────────────────────
 *
 * `platform_settings.value` is a string, always. The stored unit is whatever the
 * backend reads — metres for radii, minutes for waits — and the display unit is
 * whatever a person thinks in. `toStored`/`fromStored` is the only place that
 * conversion happens, so a setting shown in km cannot be saved as km by
 * accident.
 */

export type SettingKind = "integer" | "money" | "text";

export interface SettingField {
  key: string;
  label: string;
  help: string;
  kind: SettingKind;
  /** Shown after the input. */
  unit?: string;
  /** Stored value → what the input shows. */
  fromStored: (raw: string) => string;
  /** What the input shows → stored value. */
  toStored: (shown: string) => string;
  /** Returns a message when invalid, or null. */
  validate?: (shown: string) => string | null;
  /** Written to `description` on the setting row, for whoever reads the table. */
  description: string;
}

export interface SettingGroup {
  id: string;
  title: string;
  blurb: string;
  fields: SettingField[];
}

const identity = (v: string) => v;

/** A whole number of at least `min`. */
function positiveInteger(min: number, max?: number) {
  return (shown: string): string | null => {
    const trimmed = shown.trim();
    if (trimmed === "") return "Required.";
    if (!/^\d+$/.test(trimmed)) return "Whole numbers only.";
    const n = Number(trimmed);
    if (n < min) return `Must be at least ${min}.`;
    if (max !== undefined && n > max) return `Must be at most ${max}.`;
    return null;
  };
}

/** Money, to two decimal places, non-negative. */
function money(shown: string): string | null {
  const trimmed = shown.trim();
  if (trimmed === "") return "Required.";
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return "A number, up to two decimal places.";
  }
  return null;
}

export const settingGroups: SettingGroup[] = [
  {
    id: "delivery",
    title: "Delivery fees",
    blurb:
      "What customers are charged for delivery. Applied at checkout — changing a fee does not alter orders already placed.",
    fields: [
      {
        key: "delivery_fee",
        label: "Standard delivery",
        help: "Charged on a normal order.",
        kind: "money",
        unit: "KES",
        fromStored: identity,
        toStored: identity,
        validate: money,
        description: "Delivery fee for normal products in KES",
      },
      {
        key: "clearance_delivery_fee",
        label: "Clearance delivery",
        help: "Charged on a clearance order instead of the standard fee.",
        kind: "money",
        unit: "KES",
        fromStored: identity,
        toStored: identity,
        validate: money,
        description: "Delivery fee for clearance products in KES",
      },
      {
        key: "clearance_extra_vendor_fee",
        label: "Extra vendor surcharge",
        help: "Added per additional hub in a clearance order, since each one is a separate pickup.",
        kind: "money",
        unit: "KES",
        fromStored: identity,
        toStored: identity,
        validate: money,
        description:
          "Extra delivery fee per additional vendor in clearance orders (KES)",
      },
    ],
  },
  {
    id: "clearance",
    title: "Clearance",
    blurb:
      "How near-expiry stock is shown and dispatched. The batching settings decide how long an order waits for company before a rider is sent.",
    fields: [
      {
        key: "clearance_service_radius",
        label: "Visibility radius",
        help: "How far from a hub its clearance stock is shown to customers.",
        kind: "integer",
        unit: "km",
        // Stored in metres, shown in km — the value a person reasons about.
        fromStored: (v) => {
          const n = Number(v);
          return Number.isFinite(n) ? String(n / 1000) : "";
        },
        toStored: (v) => String(Math.round(Number(v) * 1000)),
        validate: (shown) => {
          const trimmed = shown.trim();
          if (trimmed === "") return "Required.";
          const n = Number(trimmed);
          if (!Number.isFinite(n) || n <= 0) return "A positive number of km.";
          if (n > 100) return "That is over 100 km — check the unit.";
          return null;
        },
        description:
          "Service radius for clearance products in meters (default 5km)",
      },
      {
        key: "clearance_expiry_buffer_days",
        label: "Expiry buffer",
        help: "Stop showing clearance stock this many days before it expires.",
        kind: "integer",
        unit: "days",
        fromStored: identity,
        toStored: identity,
        validate: positiveInteger(0, 60),
        description: "Days before expiry to stop displaying clearance products",
      },
      {
        key: "clearance_batch_wait_minutes",
        label: "Batch wait",
        help: "How long a single-hub clearance order waits for another order before a rider is dispatched.",
        kind: "integer",
        unit: "minutes",
        fromStored: identity,
        toStored: identity,
        validate: positiveInteger(0, 240),
        description:
          "Minutes to wait for additional orders before dispatching a single-vendor clearance batch",
      },
      {
        key: "clearance_batch_max_orders",
        label: "Batch size limit",
        help: "Reaching this many orders dispatches the batch immediately, without waiting out the timer.",
        kind: "integer",
        unit: "orders",
        fromStored: identity,
        toStored: identity,
        validate: positiveInteger(1, 50),
        description:
          "Max orders per clearance batch; triggers immediate dispatch when reached",
      },
    ],
  },
  {
    id: "legal",
    title: "Legal document versions",
    blurb:
      "Bumping a version forces every user to accept that document again on next launch. Only change one when the document itself has changed.",
    fields: [
      {
        key: "terms_version",
        label: "Terms & Conditions",
        help: "Any change re-prompts every user.",
        kind: "text",
        fromStored: identity,
        toStored: identity,
        validate: (shown) =>
          shown.trim() === "" ? "Required." : null,
        description:
          "Current Terms & Conditions version. Bump to force re-acceptance for all users.",
      },
      {
        key: "privacy_version",
        label: "Privacy Policy",
        help: "Any change re-prompts every user.",
        kind: "text",
        fromStored: identity,
        toStored: identity,
        validate: (shown) => (shown.trim() === "" ? "Required." : null),
        description:
          "Current Privacy Policy version. Bump to force re-acceptance for all users.",
      },
      {
        key: "eula_version",
        label: "EULA",
        help: "Any change notifies users of updated licence terms.",
        kind: "text",
        fromStored: identity,
        toStored: identity,
        validate: (shown) => (shown.trim() === "" ? "Required." : null),
        description:
          "Current EULA version. Bump to notify users of updated licence terms.",
      },
    ],
  },
];

/** Flat lookup, for the dirty-state machinery. */
export const settingFieldsByKey: Record<string, SettingField> =
  Object.fromEntries(
    settingGroups.flatMap((g) => g.fields.map((f) => [f.key, f])),
  );

export const allSettingKeys: string[] = Object.keys(settingFieldsByKey);
