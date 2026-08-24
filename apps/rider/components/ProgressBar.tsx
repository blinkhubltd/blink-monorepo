import { View } from "react-native";
import { cn } from "@repo/mobile-ui/lib/utils";

interface ProgressBarProps {
  /** 0–100. Clamped, so a bad input cannot overflow the track. */
  pct: number;
  /** Use on the ink cards, where the default track is invisible. */
  onInverse?: boolean;
  className?: string;
}

export function ProgressBar({ pct, onInverse, className }: ProgressBarProps) {
  const safe = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: safe }}
      className={cn(
        "h-space-3 overflow-hidden rounded-pill",
        onInverse ? "bg-ink-700" : "bg-secondary",
        className,
      )}
    >
      <View
        className="h-full rounded-pill bg-primary"
        style={{ width: `${safe}%` }}
      />
    </View>
  );
}
