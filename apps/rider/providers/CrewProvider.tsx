import { createContext, useCallback, useContext, useMemo } from "react";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import { crewRoleFromRoleName, type CrewRole } from "../lib/roles";
import { getDeviceId } from "../lib/device";
import { stopLocationReporting } from "../lib/location-task";
import type { Crew } from "../lib/data/types";

/**
 * Why the crew member cannot use the app, when that is the case.
 *
 *  no_session  — not signed in
 *  no_account  — signed in with Clerk but no `users` row yet (the Clerk webhook
 *                creates it, so this is normally transient)
 *  not_crew    — has an account but the role is neither Rider nor Picker
 *  suspended   — crew account exists but is not Active
 */
export type CrewGate =
  | "ok"
  | "loading"
  | "no_session"
  | "no_account"
  | "not_crew"
  | "suspended";

interface CrewContextValue {
  crew: Crew | null;
  /** The `users` document id, needed by nearly every backend query. */
  userId: Id<"users"> | null;
  /** The picker's vendor. Null for riders. */
  vendorId: Id<"vendors"> | null;
  gate: CrewGate;
  loading: boolean;
  online: boolean;
  setOnline: (online: boolean) => void;
  signOut: () => Promise<void>;
}

const CrewContext = createContext<CrewContextValue | null>(null);

export function CrewProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded: authLoaded, isSignedIn, signOut } = useAuth();
  const { user: clerkUser } = useUser();

  // "skip" rather than a guard around the hook: the rules of hooks make a
  // conditional call impossible, and skip is what Convex provides for it.
  const doc = useQuery(
    api.user.users.getCurrentUser,
    authLoaded && isSignedIn && clerkUser?.id
      ? { clerkId: clerkUser.id }
      : "skip",
  );

  const setOnlineStatus = useMutation(
    api.data.rider_analytics.updateRiderOnlineStatus,
  );
  const deregisterDevice = useMutation(
    api.data.push_tokens.deregisterMyDevice,
  );

  // A picker belongs to a vendor, which is their hub. A rider has no vendor on
  // their user document at all, so there is no hub name to resolve for one.
  const vendorId = doc?.picker_details?.vendor_id;
  const vendor = useQuery(
    api.data.vendors.getVendorById,
    vendorId ? { vendorId } : "skip",
  );

  const role: CrewRole | null = crewRoleFromRoleName(doc?.roleName);

  const gate: CrewGate = useMemo(() => {
    if (!authLoaded) return "loading";
    if (!isSignedIn) return "no_session";
    if (doc === undefined) return "loading";
    if (doc === null) return "no_account";
    if (role === null) return "not_crew";
    const status =
      role === "rider" ? doc.rider_details?.status : doc.picker_details?.status;
    // An absent status is treated as usable. The assign-* mutations set it, but
    // rows predating them have none, and locking those crew members out of the
    // app is worse than letting them work.
    if (status && status !== "Active") return "suspended";
    return "ok";
  }, [authLoaded, isSignedIn, doc, role]);

  const crew = useMemo<Crew | null>(() => {
    if (!doc || !role) return null;
    const name = [doc.first_name, doc.last_name]
      .filter((p) => typeof p === "string" && p.trim().length > 0)
      .join(" ")
      .trim();
    return {
      id: doc._id,
      name: name.length > 0 ? name : doc.email,
      role,
      // Resolved from the picker's vendor. A rider has no vendor link, so there
      // is genuinely no hub to name for one — "Blink" is the honest answer
      // rather than a hub they may not belong to.
      hubName: vendor?.name ?? (vendorId ? "Your hub" : "Blink"),
      avatarUrl: doc.image ?? null,
      onShiftSince: null,
    };
  }, [doc, role, vendor?.name, vendorId]);

  const online =
    role === "rider" ? doc?.rider_details?.status === "Active" : gate === "ok";

  const setOnline = useCallback(
    (next: boolean) => {
      // Riders only. `updateRiderOnlineStatus` reads `rider_details`, which a
      // picker does not have, so calling it for a picker throws.
      if (role !== "rider" || !doc?._id) return;
      void setOnlineStatus({ riderId: doc._id, isOnline: next });
    },
    [role, doc?._id, setOnlineStatus],
  );

  const value = useMemo<CrewContextValue>(
    () => ({
      crew,
      userId: doc?._id ?? null,
      vendorId: vendorId ?? null,
      gate,
      loading: gate === "loading",
      online,
      setOnline,
      signOut: async () => {
        // Order matters. Both of these need the session that signOut destroys,
        // so they run first — and neither is allowed to block the sign-out: a
        // rider who taps it must get out even with no connectivity.
        try {
          await deregisterDevice({ deviceId: await getDeviceId() });
        } catch {
          // The row stays enabled and this device keeps receiving push until it
          // registers again. Worth a retry later, not worth trapping the rider.
        }
        try {
          await stopLocationReporting();
        } catch {
          // LocationProvider stops it again once the gate flips to no_session.
        }
        await signOut();
      },
    }),
    [
      crew,
      doc?._id,
      vendorId,
      gate,
      online,
      setOnline,
      signOut,
      deregisterDevice,
    ],
  );

  return <CrewContext.Provider value={value}>{children}</CrewContext.Provider>;
}

export function useCrew(): CrewContextValue {
  const ctx = useContext(CrewContext);
  if (!ctx) {
    throw new Error("useCrew must be used inside <CrewProvider>");
  }
  return ctx;
}

/**
 * The role, defaulted to rider so tab screens need not branch on null.
 *
 * Screens under (tabs) are only reachable once the gate reads "ok", at which
 * point the role is definite.
 */
export function useCrewRole(): CrewRole {
  const { crew } = useCrew();
  return crew?.role ?? "rider";
}

/** The `users` id, for screens that must have one. Null before sign-in. */
export function useCrewUserId(): Id<"users"> | null {
  return useCrew().userId;
}
