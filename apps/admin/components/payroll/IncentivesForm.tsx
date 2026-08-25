"use client";

import { useState, useEffect, useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "@repo/backend";
import { Button } from "@repo/ui/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/ui/form";
import { Input } from "@repo/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Separator } from "@repo/ui/components/ui/separator";
import { toast } from "sonner";

interface IncentivesFormProps {
  existingRiderIncentives?: any;
  existingPickerIncentives?: any;
}

interface IncentivesFormProps {
  existingRiderConfig?: any;
  existingPickerConfig?: any;
}

export default function IncentivesForm({
  existingRiderConfig,
  existingPickerConfig,
}: IncentivesFormProps) {
  const createIncentiveConfig = useMutation(
    api.data.incentives.createIncentiveConfigNew
  );
  const updateIncentiveConfig = useMutation(
    api.data.incentives.updateIncentiveConfigNew
  );

  const [role, setRole] = useState<"RIDER" | "PICKER">("RIDER");
  const [thresholdDaily, setThresholdDaily] = useState("0");
  const [bonusDaily, setBonusDaily] = useState("0");
  // Only daily bonus supported
  const [effectiveFrom, setEffectiveFrom] = useState<string>(() =>
    new Date().toISOString().slice(0, 16)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const existing =
      role === "RIDER" ? existingRiderConfig : existingPickerConfig;
    if (existing) {
      setThresholdDaily(String(existing.threshold_daily));
      setBonusDaily(String(existing.bonus_per_extra_daily));
      setEffectiveFrom(
        new Date(existing.effective_from).toISOString().slice(0, 16)
      );
    } else {
      setThresholdDaily("0");
      setBonusDaily("0");
      setEffectiveFrom(new Date().toISOString().slice(0, 16));
    }
  }, [role, existingRiderConfig, existingPickerConfig]);

  const toTimestamp = (local: string) =>
    local ? new Date(local).getTime() : Date.now();

  const parsePositive = (val: string) => {
    const num = parseFloat(val);
    return isNaN(num) || num < 0 ? undefined : num;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const dataNums = {
        threshold_daily: parsePositive(thresholdDaily),
        bonus_per_extra_daily: parsePositive(bonusDaily),
      };
      const invalid = Object.entries(dataNums).filter(
        ([, v]) => v === undefined
      );
      if (invalid.length) {
        toast.error("All numeric fields must be non-negative numbers");
        return;
      }
      const effectiveTs = toTimestamp(effectiveFrom);
      const existing =
        role === "RIDER" ? existingRiderConfig : existingPickerConfig;
      if (existing) {
        await updateIncentiveConfig({
          id: existing._id,
          threshold_daily: dataNums.threshold_daily!,
          bonus_per_extra_daily: dataNums.bonus_per_extra_daily!,
          effective_from: effectiveTs,
        });
        toast.success(`Updated incentives for ${role.toLowerCase()}s`);
      } else {
        await createIncentiveConfig({
          role,
          threshold_daily: dataNums.threshold_daily!,
          bonus_per_extra_daily: dataNums.bonus_per_extra_daily!,
          effective_from: effectiveTs,
        });
        toast.success(`Created incentives for ${role.toLowerCase()}s`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to save incentive configuration");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium">Role</label>
        <Select
          value={role}
          onValueChange={(v) => setRole(v as "RIDER" | "PICKER")}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="RIDER">Rider</SelectItem>
            <SelectItem value="PICKER">Picker</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Choose which role these incentives apply to.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Daily Threshold</label>
          <Input
            type="number"
            min={0}
            value={thresholdDaily}
            onChange={(e) => setThresholdDaily(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Minimum tasks per day before bonuses start.
          </p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Daily Bonus (per extra task)
          </label>
          <Input
            type="number"
            step="0.01"
            min={0}
            value={bonusDaily}
            onChange={(e) => setBonusDaily(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Amount paid for each task above the daily threshold.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Effective From</label>
        <Input
          type="datetime-local"
          value={effectiveFrom}
          onChange={(e) => setEffectiveFrom(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Date/time when this configuration becomes active.
        </p>
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting
          ? "Saving..."
          : existingRiderConfig || existingPickerConfig
            ? "Update"
            : "Create"}{" "}
        Incentives
      </Button>
    </form>
  );
}
