import { View } from "react-native";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { cn } from "@repo/mobile-ui/lib/utils";

import { jobStatus, type JobTone } from "../../lib/job-status";

/**
 * A job's status, as the small uppercase pill on every delivery card.
 *
 * `ink` is the mode-fixed ink pill rather than `inverse`: `inverse` flips to
 * white in dark mode, which would turn the one pill meant to shout "this needs
 * you" into the quietest thing on the card.
 */
const TONE: Record<JobTone, { bg: string; fg: string }> = {
  ink: { bg: "bg-on-brand-pill", fg: "text-primary" },
  neutral: { bg: "bg-secondary", fg: "text-foreground" },
  brand: { bg: "bg-primary", fg: "text-primary-foreground" },
  success: { bg: "bg-success-soft", fg: "text-success" },
  danger: { bg: "bg-destructive-soft", fg: "text-destructive" },
};

export function StatusPill({
  status,
  label,
}: {
  status: string;
  /** Overrides the wording — the picker's "Picking", for instance. */
  label?: string;
}) {
  const s = jobStatus(status);
  const tone = TONE[s.tone];
  return (
    <View className={cn("rounded-pill px-[10px] py-[5px]", tone.bg)}>
      <Text
        size="caption"
        weight="bold"
        className={cn("uppercase tracking-label", tone.fg)}
      >
        {(label ?? s.label).toUpperCase()}
      </Text>
    </View>
  );
}
