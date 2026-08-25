import { describe, expect, it } from "vitest";
import {
  evaluateScan,
  IDLE_GATE,
  releaseScan,
  RESUME_AFTER_MS,
  SAME_CODE_LOCKOUT_MS,
  type ScanGateState,
} from "../lib/scan-gate";

const T0 = 1_000_000;
const CODE = "5449000000996";
const OTHER = "5000112637922";

describe("evaluateScan", () => {
  it("accepts the first read", () => {
    const decision = evaluateScan(IDLE_GATE, CODE, T0);
    expect(decision.accept).toBe(true);
  });

  it("locks immediately on acceptance, before any await", () => {
    // This is the property that matters. Frames keep arriving during the network
    // round trip, so the returned state has to already be blocking.
    const decision = evaluateScan(IDLE_GATE, CODE, T0);
    if (!decision.accept) throw new Error("expected acceptance");
    expect(decision.next.busy).toBe(true);
    expect(decision.next.pausedUntil).toBe(T0 + RESUME_AFTER_MS);
    expect(decision.next.lastCode).toEqual({ data: CODE, at: T0 });
  });

  it("rejects every frame while a scan is in flight", () => {
    const decision = evaluateScan(IDLE_GATE, CODE, T0);
    if (!decision.accept) throw new Error("expected acceptance");

    // A camera at 30fps delivers ~30 of these in the second that follows.
    for (let i = 1; i <= 30; i++) {
      const frame = evaluateScan(decision.next, CODE, T0 + i * 33);
      expect(frame.accept).toBe(false);
    }
  });

  it("one physical presentation produces exactly one accepted scan", () => {
    // The whole point: holding a single packet in frame for two seconds must not
    // pick two seconds' worth of units.
    let gate: ScanGateState = IDLE_GATE;
    let accepted = 0;

    for (let t = T0; t < T0 + 2000; t += 33) {
      const decision = evaluateScan(gate, CODE, t);
      if (decision.accept) {
        accepted++;
        gate = decision.next;
        // The mutation settles almost immediately on a good connection.
        gate = releaseScan(gate);
      }
    }

    expect(accepted).toBe(1);
  });

  it("still rejects the same code once the global window has passed", () => {
    const first = evaluateScan(IDLE_GATE, CODE, T0);
    if (!first.accept) throw new Error("expected acceptance");
    const settled = releaseScan(first.next);

    const justAfterResume = evaluateScan(settled, CODE, T0 + RESUME_AFTER_MS + 1);
    expect(justAfterResume.accept).toBe(false);
    if (justAfterResume.accept) throw new Error("unreachable");
    expect(justAfterResume.reason).toBe("same_code");
  });

  it("accepts the same code again after the lockout, for a genuine second unit", () => {
    // A picker taking a second identical packet must be able to scan it.
    const first = evaluateScan(IDLE_GATE, CODE, T0);
    if (!first.accept) throw new Error("expected acceptance");
    const settled = releaseScan(first.next);

    const later = evaluateScan(settled, CODE, T0 + SAME_CODE_LOCKOUT_MS + 1);
    expect(later.accept).toBe(true);
  });

  it("accepts a different code as soon as the global window passes", () => {
    // Presenting a new item is deliberate, so it should not wait out the
    // same-code lockout.
    const first = evaluateScan(IDLE_GATE, CODE, T0);
    if (!first.accept) throw new Error("expected acceptance");
    const settled = releaseScan(first.next);

    const other = evaluateScan(settled, OTHER, T0 + RESUME_AFTER_MS + 1);
    expect(other.accept).toBe(true);
  });

  it("blocks a different code during the global window", () => {
    const first = evaluateScan(IDLE_GATE, CODE, T0);
    if (!first.accept) throw new Error("expected acceptance");
    const settled = releaseScan(first.next);

    const other = evaluateScan(settled, OTHER, T0 + RESUME_AFTER_MS - 1);
    expect(other.accept).toBe(false);
    if (other.accept) throw new Error("unreachable");
    expect(other.reason).toBe("cooling_down");
  });

  it("distinguishes why it refused, so the reasons cannot be conflated", () => {
    const busy: ScanGateState = { ...IDLE_GATE, busy: true };
    const refusedBusy = evaluateScan(busy, CODE, T0);
    expect(refusedBusy.accept).toBe(false);
    if (refusedBusy.accept) throw new Error("unreachable");
    expect(refusedBusy.reason).toBe("busy");
  });

  it("keeps blocking if the mutation never settles", () => {
    // A dropped request leaves busy set. Better to accept nothing than to let a
    // retry storm double-count while the first is still outstanding.
    const first = evaluateScan(IDLE_GATE, CODE, T0);
    if (!first.accept) throw new Error("expected acceptance");

    const muchLater = evaluateScan(first.next, OTHER, T0 + 60_000);
    expect(muchLater.accept).toBe(false);
    if (muchLater.accept) throw new Error("unreachable");
    expect(muchLater.reason).toBe("busy");
  });

  it("a rejected scan still consumes its window", () => {
    // An unknown barcode is a real presentation. Not holding the window would
    // let the camera re-submit it every frame until it left the lens.
    const first = evaluateScan(IDLE_GATE, "not-a-product", T0);
    if (!first.accept) throw new Error("expected acceptance");
    const settled = releaseScan(first.next);

    const again = evaluateScan(settled, "not-a-product", T0 + 100);
    expect(again.accept).toBe(false);
  });

  it("the same-code lockout is longer than the global one", () => {
    // Otherwise it would never apply, and holding an item in frame would
    // double-count as soon as the global window lapsed.
    expect(SAME_CODE_LOCKOUT_MS).toBeGreaterThan(RESUME_AFTER_MS);
  });
});

describe("releaseScan", () => {
  it("clears busy but keeps both windows", () => {
    const first = evaluateScan(IDLE_GATE, CODE, T0);
    if (!first.accept) throw new Error("expected acceptance");
    const settled = releaseScan(first.next);

    expect(settled.busy).toBe(false);
    expect(settled.pausedUntil).toBe(first.next.pausedUntil);
    expect(settled.lastCode).toEqual(first.next.lastCode);
  });
});
