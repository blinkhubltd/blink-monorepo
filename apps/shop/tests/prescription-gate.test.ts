import { describe, expect, it } from "vitest";

import { checkoutBlockers, prescriptionGate } from "../lib/checkout-rules";

const NO_RECEIVER_ERRORS = {};

describe("prescriptionGate", () => {
  it("is 'none' when nothing in the basket needs paperwork", () => {
    expect(prescriptionGate({ vendorsNeeding: [], rows: null })).toBe("none");
  });

  it("is 'loading' while the answer is in flight", () => {
    // Never 'missing': that would block checkout for a beat on every render.
    // Never 'approved': that would open the gate before the answer arrives.
    expect(prescriptionGate({ vendorsNeeding: ["v1"], rows: null })).toBe(
      "loading",
    );
  });

  it("is 'missing' when a shop has nothing on file", () => {
    expect(
      prescriptionGate({
        vendorsNeeding: ["v1"],
        rows: [{ vendorId: "v1", status: null, uploadedAt: null }],
      }),
    ).toBe("missing");
  });

  it("is 'missing' when a shop is absent from the rows entirely", () => {
    expect(
      prescriptionGate({ vendorsNeeding: ["v1", "v2"], rows: [] }),
    ).toBe("missing");
  });

  it("is 'approved' only when every shop that needs paperwork has it", () => {
    expect(
      prescriptionGate({
        vendorsNeeding: ["v1", "v2"],
        rows: [
          { vendorId: "v1", status: "approved", uploadedAt: 1 },
          { vendorId: "v2", status: "approved", uploadedAt: 2 },
        ],
      }),
    ).toBe("approved");
  });

  it("does NOT let one shop's approval clear another", () => {
    // This is the defect: the old checkout asked one vendor-keyed query and
    // treated its answer as the whole basket's, so the item that needed a
    // pharmacist shipped without one.
    expect(
      prescriptionGate({
        vendorsNeeding: ["v1", "v2"],
        rows: [
          { vendorId: "v1", status: "approved", uploadedAt: 1 },
          { vendorId: "v2", status: null, uploadedAt: null },
        ],
      }),
    ).toBe("missing");
  });

  it("prefers 'rejected' over everything, because there is something to fix", () => {
    expect(
      prescriptionGate({
        vendorsNeeding: ["v1", "v2", "v3"],
        rows: [
          { vendorId: "v1", status: "approved", uploadedAt: 1 },
          { vendorId: "v2", status: null, uploadedAt: null },
          { vendorId: "v3", status: "rejected", uploadedAt: 3 },
        ],
      }),
    ).toBe("rejected");
  });

  it("prefers 'missing' over 'pending'", () => {
    // A shop with no document cannot be reviewed at all, so that is the more
    // actionable message.
    expect(
      prescriptionGate({
        vendorsNeeding: ["v1", "v2"],
        rows: [
          { vendorId: "v1", status: "pending", uploadedAt: 1 },
          { vendorId: "v2", status: null, uploadedAt: null },
        ],
      }),
    ).toBe("missing");
  });

  it("treats an unrecognised status as under review, never as cleared", () => {
    // A status this build does not know must not open a gate.
    expect(
      prescriptionGate({
        vendorsNeeding: ["v1"],
        rows: [{ vendorId: "v1", status: "escalated", uploadedAt: 1 }],
      }),
    ).toBe("pending");
  });

  it("ignores rows for shops that do not need paperwork", () => {
    expect(
      prescriptionGate({
        vendorsNeeding: ["v1"],
        rows: [
          { vendorId: "v1", status: "approved", uploadedAt: 1 },
          { vendorId: "v9", status: "rejected", uploadedAt: 2 },
        ],
      }),
    ).toBe("approved");
  });
});

describe("the gate as checkout applies it", () => {
  const base = {
    hasQuote: true,
    hasAddress: true,
    hasPhone: true,
    receiverErrors: NO_RECEIVER_ERRORS,
  };

  it("blocks on missing and on rejected", () => {
    expect(
      checkoutBlockers({ ...base, prescriptionStatus: "missing" }),
    ).toHaveLength(1);
    expect(
      checkoutBlockers({ ...base, prescriptionStatus: "rejected" }),
    ).toHaveLength(1);
  });

  it("does not block on pending", () => {
    // The order can be placed and held for dispatch. Blocking would mean a
    // customer waiting on a pharmacist cannot check out at all, and the server
    // refuses dispatch regardless.
    expect(
      checkoutBlockers({ ...base, prescriptionStatus: "pending" }),
    ).toEqual([]);
  });

  it("does not block on loading, none or approved", () => {
    for (const status of ["loading", "none", "approved"] as const) {
      expect(
        checkoutBlockers({ ...base, prescriptionStatus: status }),
        status,
      ).toEqual([]);
    }
  });
});
