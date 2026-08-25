/**
 * Deciding whether a camera frame's barcode counts as a new pick.
 *
 * This is the correctness core of the scanner, and the reason it is pure rather
 * than living inside the scan callback. `onBarcodeScanned` fires on every frame
 * a code is visible — several times a second — so a picker holding one packet in
 * front of the lens for two seconds would otherwise increment a dozen units off
 * a single physical item. The rule is: one presentation, one increment.
 *
 * Two windows, doing different jobs:
 *
 *  - `RESUME_AFTER_MS` blocks ALL reads briefly after any accepted scan. It
 *    stops a burst, and it gives the confirmation long enough to be read, which
 *    is the same interval a person needs regardless.
 *
 *  - `SAME_CODE_LOCKOUT_MS` blocks the SAME code for longer, for the picker who
 *    keeps a packet in frame while reaching for the next one. A different code
 *    is accepted as soon as the global window passes, because presenting a new
 *    item is a deliberate act.
 *
 * Both are inputs to a decision, not timers, so the behaviour can be checked
 * without a camera or a clock.
 */

export const RESUME_AFTER_MS = 1400;
export const SAME_CODE_LOCKOUT_MS = 2600;

export interface ScanGateState {
  /** Timestamp before which no scan is accepted. 0 when nothing is pending. */
  pausedUntil: number;
  /** The last accepted code and when it was accepted. */
  lastCode: { data: string; at: number } | null;
  /** True while a scan is in flight. */
  busy: boolean;
}

export const IDLE_GATE: ScanGateState = {
  pausedUntil: 0,
  lastCode: null,
  busy: false,
};

export type RejectionReason = "busy" | "cooling_down" | "same_code";

export type GateDecision =
  | { accept: true; next: ScanGateState }
  | { accept: false; reason: RejectionReason };

/**
 * Whether to submit this read, and the state to hold if so.
 *
 * The returned state is applied BEFORE the network round trip, not after —
 * frames keep arriving while the mutation is in flight, and waiting for the
 * response to start blocking is what lets the same code through several times.
 */
export function evaluateScan(
  state: ScanGateState,
  data: string,
  now: number,
): GateDecision {
  if (state.busy) return { accept: false, reason: "busy" };
  if (now < state.pausedUntil) {
    return { accept: false, reason: "cooling_down" };
  }
  if (
    state.lastCode !== null &&
    state.lastCode.data === data &&
    now - state.lastCode.at < SAME_CODE_LOCKOUT_MS
  ) {
    return { accept: false, reason: "same_code" };
  }

  return {
    accept: true,
    next: {
      pausedUntil: now + RESUME_AFTER_MS,
      lastCode: { data, at: now },
      busy: true,
    },
  };
}

/** State once a submitted scan settles, however it went. */
export function releaseScan(state: ScanGateState): ScanGateState {
  return { ...state, busy: false };
}
