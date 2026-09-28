/**
 * The app's data layer.
 *
 * Screens call these hooks and nothing else — no screen imports `api` directly.
 * That keeps the awkward parts of the backend in one place: which query a role
 * is allowed to call, which mutation a payment mode requires, and which pieces
 * of the design have no backend source at all.
 *
 * `undefined` from any hook means loading, matching Convex's own convention, so
 * a screen can drive a skeleton off it.
 */
import { useCallback, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";

import { useCrew } from "../../providers/CrewProvider";
import {
  completedFromShipments,
  type CompletedDelivery,
} from "./buckets";
import {
  confirmationMode,
  sortPickerQueue,
  sortRiderQueue,
  toCrewNotification,
  toDeliveryDetail,
  toPickerQueueItem,
  toPickItem,
  toQueueItem,
  toRiderJob,
  type ConfirmationMode,
} from "./map";
import type { RiderJob } from "../earnings";
import { upcomingShifts, withWeekdayEnabled, type UpcomingShift, type WeeklyScheduleDoc, type WeekdayName } from "./shifts";
import type {
  ActiveWork,
  CrewNotification,
  DeliveryDetail,
  HomeSummary,
  PickItem,
  QueueItem,
  ScanOutcome,
} from "./types";
import { formatMoneyCompact } from "../format";
import { toIncentiveRole } from "../roles";
import { periodPlan } from "../incentives";

// ---------------------------------------------------------------------------
// Queue — Deliveries (rider) / Orders (picker)
// ---------------------------------------------------------------------------

export function useQueue(): QueueItem[] | undefined {
  const { crew, userId } = useCrew();
  const isRider = crew?.role === "rider";

  const riderDocs = useQuery(
    api.data.shipments.listRiderDeliveries,
    isRider && userId ? { riderId: userId } : "skip",
  );
  const pickerDocs = useQuery(
    api.data.picker_orders.getPickerOrders,
    !isRider && userId ? { pickerId: userId } : "skip",
  );

  return useMemo(() => {
    if (isRider) {
      if (riderDocs === undefined) return undefined;
      return sortRiderQueue(riderDocs).map(toQueueItem);
    }
    if (pickerDocs === undefined) return undefined;
    return sortPickerQueue(pickerDocs).map(toPickerQueueItem);
  }, [isRider, riderDocs, pickerDocs]);
}

/**
 * The rider's completed deliveries, for the incentives chart.
 *
 * Reuses `listRiderDeliveries` rather than adding a query: there is no bucketed
 * aggregate on the backend, so the chart is derived from this list. See
 * `buckets.ts` for why that is a stopgap.
 */
export function useCompletedDeliveries(): CompletedDelivery[] | undefined {
  const { crew, userId } = useCrew();
  const docs = useQuery(
    api.data.shipments.listRiderDeliveries,
    crew?.role === "rider" && userId ? { riderId: userId } : "skip",
  );
  return useMemo(
    () => (docs === undefined ? undefined : completedFromShipments(docs)),
    [docs],
  );
}

// ---------------------------------------------------------------------------
// Rider jobs — Home, Deliveries and Incentives
// ---------------------------------------------------------------------------

export interface RiderJobs {
  /** Live work, the first-assigned first: the job to do now leads. */
  active: RiderJob[];
  /** Delivered work, the most recent first. */
  done: RiderJob[];
  /** Everything, for the earnings arithmetic. */
  all: RiderJob[];
}

/**
 * The rider's whole delivery list, as jobs.
 *
 * One subscription feeds three screens. `listRiderDeliveries` is the only
 * source of per-delivery fees and times, so the home sparklines, the
 * Deliveries tabs and the Incentives charts all read the same rows — and
 * cannot disagree about what happened on a given day.
 *
 * Failed deliveries are in neither tab: they are not work to do, and they are
 * not something the rider completed.
 */
export function useRiderJobs(): RiderJobs | undefined {
  const { crew, userId } = useCrew();
  const docs = useQuery(
    api.data.shipments.listRiderDeliveries,
    crew?.role === "rider" && userId ? { riderId: userId } : "skip",
  );
  return useMemo(() => {
    if (docs === undefined) return undefined;
    const all = docs.map(toRiderJob);
    return {
      active: all
        .filter((j) => j.live)
        .sort((a, b) => a.assignedAt - b.assignedAt),
      done: all
        .filter((j) => j.completedAt !== null)
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
      all,
    };
  }, [docs]);
}

export interface RiderStats {
  earningsToday: number;
  completedToday: number;
  /** Lifetime completed deliveries. */
  completedTotal: number;
  /** Customer rating out of 5, or null before the first one. */
  rating: number | null;
  /**
   * Delivered as a share of all assigned, 0–100.
   *
   * The backend also returns an `onTimeRate`, and it is this same number under
   * another name: nothing records whether a delivery beat its promise, so
   * `getRiderDashboard` copies the completion rate into it. The profile shows
   * it as "completed" rather than repeat a label the data cannot back.
   */
  completionRate: number;
}

export function useRiderStats(): RiderStats | undefined {
  const { crew, userId } = useCrew();
  const dashboard = useQuery(
    api.data.rider_analytics.getRiderDashboard,
    crew?.role === "rider" && userId ? { riderId: userId } : "skip",
  );
  return useMemo(() => {
    if (dashboard === undefined) return undefined;
    const rating = dashboard.performanceStats.rating;
    return {
      earningsToday: dashboard.dailyStats.todaysEarnings,
      completedToday: dashboard.dailyStats.completedToday,
      completedTotal: dashboard.performanceStats.completedDeliveries,
      rating: rating > 0 ? rating : null,
      completionRate: dashboard.performanceStats.completionRate,
    };
  }, [dashboard]);
}

/**
 * "Start the ride": the rider sets off, and the shipment and order both move
 * to out-for-delivery. Scoped server-side to the assigned rider and to forward
 * moves only — see `shipments.startMyRide`.
 */
export function useStartRide() {
  const start = useMutation(api.data.shipments.startMyRide);
  return useCallback(
    async (shipmentId: Id<"shipments">) => {
      await start({ shipmentId });
    },
    [start],
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export interface HomeModel {
  summary: HomeSummary;
  active: ActiveWork | null;
  upNext: QueueItem | null;
}

export function useHome(): HomeModel | undefined {
  const { crew, userId } = useCrew();
  const isRider = crew?.role === "rider";

  // getRiderDashboard throws "Rider not found" for a non-rider, so it is only
  // ever called for a rider.
  const dashboard = useQuery(
    api.data.rider_analytics.getRiderDashboard,
    isRider && userId ? { riderId: userId } : "skip",
  );
  const pickerOrders = useQuery(
    api.data.picker_orders.getPickerOrders,
    !isRider && userId ? { pickerId: userId } : "skip",
  );
  // Item throughput from picker_activity. The table has recorded it all along;
  // getPickerItemStats is the query that finally reads it.
  const pickerItems = useQuery(
    api.data.incentives.getPickerItemStats,
    !isRider && userId ? { pickerId: userId } : "skip",
  );

  return useMemo(() => {
    if (isRider) {
      if (dashboard === undefined) return undefined;
      const next = dashboard.nextDeliveries[0];
      return {
        summary: {
          primary: {
            label: "Today",
            value: formatMoneyCompact(dashboard.dailyStats.todaysEarnings),
          },
          secondary: {
            label: "Deliveries",
            value: String(dashboard.dailyStats.completedToday),
            unit: "today",
          },
        },
        active: next
          ? {
              reference: next.order_ref ?? "—",
              addressLine: null,
              badgeLabel: next.status,
              badgeTone: "neutral",
              progress: null,
              targetId: next._id,
            }
          : null,
        upNext: null,
      };
    }

    if (pickerOrders === undefined || pickerItems === undefined) {
      return undefined;
    }
    const sorted = sortPickerQueue(pickerOrders);
    const picking = sorted.find((o) => o.order_status === "Processing");
    const items = picking?.items as { is_picked?: boolean }[] | undefined;
    const done = items?.filter((i) => i.is_picked === true).length ?? 0;
    const total = picking?.total_items ?? items?.length ?? 0;

    return {
      summary: {
        // "Picked today" is now real, from picker_activity. Note it counts LINE
        // ITEMS, not units — three loaves is one item, which is how a picker
        // experiences the work.
        primary: {
          label: "Picked today",
          value: String(pickerItems.itemsToday),
          unit: "items",
        },
        // "Accuracy" from the design still has no backend source — there is no
        // metric for it anywhere — so this reports orders completed today,
        // which the same table does record.
        secondary: {
          label: "Orders done",
          value: String(pickerItems.ordersToday),
          unit: "today",
        },
      },
      active: picking
        ? {
            reference: picking.reference,
            addressLine: null,
            badgeLabel: `${total} ${total === 1 ? "item" : "items"}`,
            badgeTone: "neutral",
            progress: { done, total },
            targetId: picking._id,
          }
        : null,
      upNext:
        sorted.filter((o) => o.order_status !== "Processing").map(toPickerQueueItem)[0] ??
        null,
    };
  }, [isRider, dashboard, pickerOrders, pickerItems]);
}

// ---------------------------------------------------------------------------
// Delivery detail
// ---------------------------------------------------------------------------

export interface DeliveryModel {
  detail: DeliveryDetail;
  /** Which confirmation the backend will accept for this order. */
  mode: ConfirmationMode;
  orderId: Id<"orders"> | null;
}

export function useDelivery(
  shipmentId: Id<"shipments"> | null,
): DeliveryModel | null | undefined {
  // getCrewDeliveryDetail, not getShipmentDetails: that one returns four whole
  // documents with no auth check — the vendor's commission and bank details, the
  // customer's email and address book, and any shipment to any caller. This is
  // projected to the job and scoped to the assigned rider.
  const doc = useQuery(
    api.data.shipments.getCrewDeliveryDetail,
    shipmentId ? { shipmentId } : "skip",
  );

  return useMemo(() => {
    if (doc === undefined) return undefined;
    if (doc === null) return null;
    return {
      detail: toDeliveryDetail(doc),
      mode: confirmationMode(doc.order),
      orderId: doc.order?._id ?? null,
    };
  }, [doc]);
}

export interface ConfirmResult {
  ok: boolean;
  /** Set when the code was wrong, so the field can show it. */
  invalidCode?: boolean;
  message?: string;
}

/**
 * Completes a delivery down whichever path the order's payment mode allows.
 *
 * `orders.verifyDeliveryCode` throws unless `payment_mode === "pay_now"`, so a
 * pay-on-delivery order goes through `tracking.confirmDelivery` instead. Getting
 * this wrong fails in the rider's hands at the doorstep, which is why the branch
 * lives here and not in the screen.
 */
export function useConfirmDelivery() {
  const { userId } = useCrew();
  const verifyCode = useMutation(api.data.orders.verifyDeliveryCode);
  const confirm = useMutation(api.data.tracking.confirmDelivery);

  return useCallback(
    async (input: {
      mode: ConfirmationMode;
      shipmentId: Id<"shipments">;
      orderId: Id<"orders"> | null;
      code: string;
    }): Promise<ConfirmResult> => {
      if (!userId) return { ok: false, message: "Not signed in" };

      if (input.mode === "delivery_code") {
        if (!input.orderId) {
          return { ok: false, message: "This delivery has no order attached" };
        }
        // No `riderId`: the mutation derives the rider from the auth token and
        // asserts it matches the order's assigned rider. It previously took the
        // id as an argument and ignored it, which meant an anonymous caller
        // could close anyone else's delivery.
        const result = await verifyCode({
          orderId: input.orderId,
          code: input.code,
        });
        if (!result.verified) {
          return { ok: false, invalidCode: true };
        }
        // verifyDeliveryCode moves the ORDER to Delivered but never touches the
        // shipment, so the rider's own queue would still show this as live.
        // Confirming after it closes the shipment too.
        await confirm({ shipmentId: input.shipmentId, riderId: userId });
        return { ok: true };
      }

      await confirm({ shipmentId: input.shipmentId, riderId: userId });
      return { ok: true };
    },
    [userId, verifyCode, confirm],
  );
}

// ---------------------------------------------------------------------------
// Pick list
// ---------------------------------------------------------------------------

export interface PickListModel {
  reference: string;
  items: PickItem[];
  /** True once every item is picked. */
  complete: boolean;
  status: string;
  /** Units taken across the whole order, for the header progress. */
  unitsPicked: number;
  unitsTotal: number;
  /** Line items fully picked, which is what the order-level count means. */
  itemsPicked: number;
}

export function usePickList(
  orderId: Id<"orders"> | null,
): PickListModel | null | undefined {
  const { userId } = useCrew();
  const doc = useQuery(
    api.data.picker_orders.getPickerOrderDetails,
    orderId && userId ? { orderId, pickerId: userId } : "skip",
  );

  return useMemo(() => {
    if (doc === undefined) return undefined;
    // getPickerOrderDetails returns null both for a missing order AND for one
    // belonging to another vendor — the screen shows "not available" either way.
    if (doc === null) return null;
    const items = doc.items.map(toPickItem);
    return {
      reference: doc.reference,
      items,
      complete: items.length > 0 && items.every((i) => i.picked),
      status: doc.order_status,
      // Progress is measured in UNITS, not line items. An order of one loaf and
      // twelve eggs is not half done when the loaf is in the bag.
      unitsPicked: items.reduce((sum, i) => sum + i.pickedQuantity, 0),
      unitsTotal: items.reduce((sum, i) => sum + i.quantity, 0),
      itemsPicked: items.filter((i) => i.picked).length,
    };
  }, [doc]);
}

export function usePickActions(orderId: Id<"orders"> | null) {
  const { userId } = useCrew();
  const recordPick = useMutation(api.data.picker_orders.recordItemPick);
  const scan = useMutation(api.data.picker_orders.scanItem);
  const markPicked = useMutation(api.data.picker_orders.markItemPicked);
  const startPicking = useMutation(api.data.picker_orders.startPicking);
  const markReady = useMutation(api.data.picker_orders.markReadyForPickup);

  return useMemo(
    () => ({
      /**
       * Takes one unit, or puts one back. This is the picking interaction —
       * three loaves means three calls.
       */
      async pickUnit(itemId: Id<"order_items">, delta: 1 | -1) {
        if (!orderId || !userId) return null;
        return await recordPick({
          orderId,
          itemId,
          pickerId: userId,
          delta,
        });
      },
      /**
       * Barcode path. Resolves the item itself, so it takes no item id.
       *
       * Never throws: a scanner is used in a hurry and an unrecognised code is
       * an ordinary event, not an exception. The three cases a picker can act on
       * are translated here rather than at each call site.
       */
      async scanBarcode(barcode: string): Promise<ScanOutcome> {
        if (!orderId || !userId) {
          return { ok: false, message: "Not signed in" };
        }
        try {
          const result = await scan({ orderId, barcode, pickerId: userId });
          return {
            ok: true,
            message: result.item.name,
            picked: result.item.picked_quantity ?? 0,
            total: result.item.quantity,
            orderComplete: result.orderComplete,
          };
        } catch (err) {
          const raw = err instanceof Error ? err.message : "";
          return {
            ok: false,
            message: /not in the current order/i.test(raw)
              ? "Not on this order"
              : /exceeded/i.test(raw)
                ? "Already fully picked"
                : /not found/i.test(raw)
                  ? "No product matches that code"
                  : "Could not record that scan",
          };
        }
      },
      /**
       * Whole-item override, for an item whose units cannot be counted one at a
       * time. Not the normal path — see recordItemPick in the backend.
       */
      async setPicked(itemId: Id<"order_items">, isPicked: boolean) {
        if (!orderId || !userId) return;
        await markPicked({ orderId, itemId, pickerId: userId, isPicked });
      },
      async start() {
        if (!orderId || !userId) return;
        await startPicking({ orderId, pickerId: userId });
      },
      async complete() {
        if (!orderId || !userId) return;
        await markReady({ orderId, pickerId: userId });
      },
    }),
    [orderId, userId, markPicked, startPicking, markReady],
  );
}

// ---------------------------------------------------------------------------
// Prescriptions
// ---------------------------------------------------------------------------

export interface PrescriptionModel {
  id: Id<"prescriptions">;
  status: string;
  /** The stored document. Its URL needs a second query, per image. */
  storageId: Id<"_storage">;
  uploadedAt: number;
  customerName: string;
}

/**
 * The prescription awaiting this picker's review for a given order.
 *
 * Structural mismatch worth knowing: a prescription is keyed by user + vendor
 * and holds ONE `prescription_document`. It is not attached to an order item, so
 * "the prescription for this item" does not exist in the data model — the best
 * available answer is "the pending prescription assigned to this picker whose
 * customer matches this order".
 */
export function usePendingPrescriptions():
  | PrescriptionModel[]
  | undefined {
  const { userId, vendorId } = useCrew();
  const docs = useQuery(
    api.data.prescriptions.getOrdersAwaitingPrescription,
    userId ? { pickerId: userId, ...(vendorId ? { vendorId } : {}) } : "skip",
  );

  return useMemo(() => {
    if (docs === undefined) return undefined;
    return docs.map((d) => ({
      id: d._id,
      status: d.status,
      storageId: d.prescription_document,
      uploadedAt: d.uploaded_at,
      customerName: [d.user?.first_name, d.user?.last_name]
        .filter((p) => typeof p === "string" && p.trim().length > 0)
        .join(" ")
        .trim(),
    }));
  }, [docs]);
}

/**
 * The prescription authorising a specific pick-list item.
 *
 * Returns null when the item carries no link, which is every row created before
 * `order_items.prescription_id` existed. Callers fall back to the picker's
 * pending queue in that case rather than showing nothing.
 */
export function usePrescriptionForItem(itemId: Id<"order_items"> | null) {
  return useQuery(
    api.data.prescriptions.getPrescriptionForOrderItem,
    itemId ? { itemId } : "skip",
  );
}

/** The items a prescription authorises, so a review can name what it approves. */
export function usePrescriptionItems(
  prescriptionId: Id<"prescriptions"> | null,
) {
  return useQuery(
    api.data.prescriptions.getOrderItemsForPrescription,
    prescriptionId ? { prescriptionId } : "skip",
  );
}

export function usePrescriptionImage(
  storageId: Id<"_storage"> | null,
): string | null | undefined {
  return useQuery(
    api.data.prescriptions.getPrescriptionDocumentUrl,
    storageId ? { storageId } : "skip",
  );
}

export function useRejectionReasons() {
  return useQuery(
    api.data.prescription_rejection_reasons.getActiveRejectionReasons,
    {},
  );
}

export function usePrescriptionActions() {
  const decide = useMutation(
    api.data.prescriptions.updatePrescriptionStatusWithReason,
  );

  return useMemo(
    () => ({
      async approve(prescriptionId: Id<"prescriptions">) {
        await decide({ prescriptionId, status: "approved" });
      },
      async reject(
        prescriptionId: Id<"prescriptions">,
        reasonId: Id<"prescriptionRejectionReasons"> | null,
        notes?: string,
      ) {
        await decide({
          prescriptionId,
          status: "rejected",
          ...(reasonId ? { rejectionReasonId: reasonId } : {}),
          ...(notes ? { customNotes: notes } : {}),
        });
      },
    }),
    [decide],
  );
}

// ---------------------------------------------------------------------------
// Incentives
// ---------------------------------------------------------------------------

export function useIncentiveDashboard() {
  const { crew, userId } = useCrew();
  return useQuery(
    api.data.incentives.getIncentiveDashboard,
    userId && crew
      ? { user_id: userId, role: toIncentiveRole(crew.role) }
      : "skip",
  );
}

export function useSetDailyTarget() {
  const { crew, userId } = useCrew();
  const setTargets = useMutation(api.data.incentives.setUserTargets);

  return useCallback(
    async (dailyTarget: number) => {
      if (!userId || !crew) return;
      // setUserTargets requires all three targets, not just the one the design
      // exposes. Weekly and monthly are derived with the same arithmetic the
      // chart uses for its plan line, so the two never disagree.
      await setTargets({
        user_id: userId,
        role: toIncentiveRole(crew.role),
        daily_target: dailyTarget,
        weekly_target: periodPlan("weekly", dailyTarget),
        monthly_target: periodPlan("monthly", dailyTarget),
      });
    },
    [userId, crew, setTargets],
  );
}

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------

export interface ShiftsModel {
  rows: UpcomingShift[];
  /** The raw template, needed to send a toggle back. */
  template: WeeklyScheduleDoc | null;
  scheduleId: Id<"schedules"> | null;
}

export function useShifts(now: number): ShiftsModel | undefined {
  const { crew, userId } = useCrew();
  const doc = useQuery(
    api.data.schedules.getUserSchedule,
    userId ? { userId } : "skip",
  );

  return useMemo(() => {
    if (doc === undefined) return undefined;
    const template = (doc?.weeklySchedule ?? null) as WeeklyScheduleDoc | null;
    return {
      rows: upcomingShifts(template, crew?.hubName ?? "Blink", now),
      template,
      scheduleId: doc?._id ?? null,
    };
  }, [doc, crew?.hubName, now]);
}

export function useToggleShift() {
  const { userId, vendorId } = useCrew();
  const save = useMutation(api.data.schedules.createOrUpdateSchedule);

  return useCallback(
    async (
      template: WeeklyScheduleDoc,
      weekday: WeekdayName,
      enabled: boolean,
    ) => {
      if (!userId) return;
      // createOrUpdateSchedule replaces the whole weeklySchedule, so the toggle
      // resends every day rebuilt from the current template. Note the arg is
      // `userId` singular — `createBulkSchedules` is the plural variant.
      await save({
        userId,
        ...(vendorId ? { vendorId } : {}),
        weeklySchedule: withWeekdayEnabled(template, weekday, enabled),
      });
    },
    [userId, vendorId, save],
  );
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export function useNotifications(): CrewNotification[] | undefined {
  // Auth-derived: the previous query took `userId` as an argument and was
  // public, so any caller could read any user's feed — and delivery-code
  // notifications carry the handover code in their message.
  const docs = useQuery(api.data.user_notifications.getMyNotifications, {});
  return useMemo(
    () => (docs === undefined ? undefined : docs.map(toCrewNotification)),
    [docs],
  );
}

export function useUnreadCount(): number | undefined {
  return useQuery(api.data.user_notifications.getMyUnreadCount, {});
}

export function useMarkNotificationsRead() {
  const markAll = useMutation(
    api.data.user_notifications.markAllMyNotificationsRead,
  );
  return useCallback(async () => {
    await markAll({});
  }, [markAll]);
}
