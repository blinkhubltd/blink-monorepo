import { describe, expect, it } from "vitest";
import * as V from "../convex/validators";

/**
 * Snapshot of every table's wire format.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * Three commits in this refactor claimed that `_generated/dataModel.d.ts` being
 * byte-identical proved no table shape had changed. **That claim was wrong.**
 * `dataModel.d.ts` is generic — it is
 * `DataModelFromSchemaDefinition<typeof schema>`, 60 lines that never change
 * unless the *list of table names* changes. Adding, removing or retyping a field
 * leaves it byte-identical.
 *
 * Proof: the commit that added `orders.idempotency_key` produced an empty
 * `dataModel.d.ts` diff.
 *
 * `api.d.ts` was better evidence — it does expand argument validators inline —
 * but it only covers function *arguments*, not table shapes.
 *
 * So this is the check that was actually missing. Convex validators expose a
 * `.json` property describing the exact wire format, field by field, including
 * optionality and union members. Snapshotting that gives a real fingerprint: any
 * change to any table's shape shows up as a snapshot diff, and has to be
 * acknowledged deliberately with `vitest -u`.
 *
 * Retroactive check: this snapshot was first generated from `validators.ts` as it
 * stood at 99a3a17 — before the enum extraction, the shape extraction and the
 * payments split — and the only diff against the current tree is the
 * deliberately-added `orders.idempotency_key`. So those refactors were in fact
 * shape-preserving; the evidence cited for them at the time simply was not the
 * evidence that showed it.
 */

type ValidatorLike = { json: unknown };

function isValidator(x: unknown): x is ValidatorLike {
  return (
    typeof x === "object" &&
    x !== null &&
    "json" in x &&
    typeof (x as ValidatorLike).json === "object"
  );
}

/** Canonical, key-sorted serialisation so formatting cannot cause a false diff. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = canonical((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

function shapes(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, val] of Object.entries(V)) {
    // Any exported validator, not just names ending in "Validator".
    //
    // The suffix filter was a real gap: `OrderItemWithoutOrderId` is the wire
    // format of the `items` argument to both order finalizers and to
    // `order_items.createMany`, and it was not fingerprinted at all. Shared
    // shapes like `postalAddress` and `weeklyShiftSchedule` were also missed,
    // and those are reused across several tables — a change to one of them
    // changes every table that embeds it.
    if (isValidator(val)) {
      out[name] = canonical(val.json);
    }
  }
  return out;
}

describe("table shapes", () => {
  it("matches the committed snapshot", () => {
    // A diff here means a table's wire format changed. That is sometimes
    // correct — but it must be an explicit decision, because existing documents
    // have to remain valid against the new shape.
    expect(shapes()).toMatchSnapshot();
  });

  it("covers every table validator", () => {
    const found = Object.keys(shapes());
    // 50 table validators after the three dead *Update clones were removed.
    expect(found.length).toBeGreaterThanOrEqual(45);
    for (const required of [
      "OrdersValidator",
      "PaymentsValidator",
      "UsersValidator",
      "ShipmentValidator",
      "VendorsValidator",
      "ClearanceProductValidator",
    ]) {
      expect(found).toContain(required);
    }
  });
});

describe("the idempotency key is present and optional", () => {
  it("orders carries an optional idempotency_key", () => {
    const orders = canonical(V.OrdersValidator.json) as {
      value: Record<string, { optional: boolean }>;
    };
    expect(orders.value.idempotency_key).toBeDefined();
    // Must stay optional: existing orders predate the field, and the standard
    // paid path never sets it.
    expect(orders.value.idempotency_key.optional).toBe(true);
  });
});

describe("the prescription link is present and optional", () => {
  /**
   * `order_items.prescription_id` says WHICH prescription authorises an item.
   * `requires_prescription` only says that one is needed, which left a picker
   * with two prescription items and two uploaded documents guessing.
   */
  const itemShapes = {
    OrderItemValidator: V.OrderItemValidator,
    OrderItemWithoutOrderId: V.OrderItemWithoutOrderId,
    OrderItemUpdateValidator: V.OrderItemUpdateValidator,
  };

  for (const [name, validator] of Object.entries(itemShapes)) {
    it(`${name} carries an optional prescription_id`, () => {
      const shape = canonical(validator.json) as {
        value: Record<
          string,
          { optional: boolean; fieldType: { type: string; tableName?: string } }
        >;
      };
      const field = shape.value.prescription_id;
      expect(field).toBeDefined();
      // Must stay optional: every order item created before this field existed
      // has no value for it, and making it required would invalidate all of
      // them. backfillOrderItemPrescriptions fills them in over time; it does
      // not make the field mandatory.
      expect(field!.optional).toBe(true);
      expect(field!.fieldType.type).toBe("id");
      expect(field!.fieldType.tableName).toBe("prescriptions");
    });
  }

  it("all three item shapes agree, so a round-trip cannot strip the link", () => {
    // OrderItemWithoutOrderId is the finalizers' argument shape and
    // OrderItemUpdateValidator is the patch shape. If either lacked the field,
    // an order created or updated through it would silently lose the link.
    const keysOf = (validator: { json: unknown }) =>
      Object.keys(
        (canonical(validator.json) as { value: Record<string, unknown> }).value,
      );

    const full = keysOf(V.OrderItemValidator).filter((k) => k !== "order_id");
    expect(keysOf(V.OrderItemWithoutOrderId).sort()).toEqual(full.sort());
    expect(keysOf(V.OrderItemUpdateValidator)).toContain("prescription_id");
  });
});
