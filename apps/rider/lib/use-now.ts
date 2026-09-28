import { useEffect, useState } from "react";

/**
 * The current time, re-read every `intervalMs`.
 *
 * For the drop-by clocks. One interval per screen that shows a clock, cleared
 * on unmount — a countdown that keeps a timer running on a screen nobody is
 * looking at is a battery cost with nothing to show for it.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
