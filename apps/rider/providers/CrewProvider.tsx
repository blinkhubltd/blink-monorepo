import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { CrewRole } from "../lib/roles";
import { FIXTURE_CREW } from "../lib/data/fixtures";
import type { Crew } from "../lib/data/types";

interface CrewContextValue {
  crew: Crew | null;
  /** True while the crew identity is still resolving. */
  loading: boolean;
  online: boolean;
  setOnline: (online: boolean) => void;
  /**
   * Dev-only role switch, matching the prototype's Rider/Picker toggle.
   *
   * In production the role comes from the crew member's `roles` document and is
   * not switchable — a picker cannot decide to be a rider. Exposed here so the
   * unified navigator can be reviewed in both modes.
   */
  setRole: (role: CrewRole) => void;
}

const CrewContext = createContext<CrewContextValue | null>(null);

export function CrewProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<CrewRole>("rider");
  const [online, setOnline] = useState(true);

  const crew = useMemo<Crew>(() => {
    const base = FIXTURE_CREW[role];
    return { ...base, onShiftSince: online ? base.onShiftSince ?? Date.now() : null };
  }, [role, online]);

  const value = useMemo<CrewContextValue>(
    () => ({ crew, loading: false, online, setOnline, setRole }),
    [crew, online],
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
 * The role, with a definite value. Screens under (tabs) are only reachable once
 * the crew is resolved, so they can rely on this rather than branching on null.
 */
export function useCrewRole(): CrewRole {
  const { crew } = useCrew();
  return crew?.role ?? "rider";
}

export function useToggleRole(): () => void {
  const { crew, setRole } = useCrew();
  return useCallback(() => {
    setRole(crew?.role === "rider" ? "picker" : "rider");
  }, [crew?.role, setRole]);
}
