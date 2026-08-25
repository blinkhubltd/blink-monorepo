"use client";

// Simplified controlled form (removed react-hook-form and zod to avoid TS typing conflicts)
import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@repo/backend";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { toast } from "sonner";

interface BaseEarningsFormProps {
  existingRiderEarnings?: any;
  existingPickerEarnings?: any;
}

export default function BaseEarningsForm({
  existingRiderEarnings,
  existingPickerEarnings,
}: BaseEarningsFormProps) {
  const createBaseEarnings = useMutation(api.data.incentives.createBaseEarnings);
  const updateBaseEarnings = useMutation(api.data.incentives.updateBaseEarnings);

  const [role, setRole] = useState<"RIDER" | "PICKER">("RIDER");
  const [monthlyBaseAmount, setMonthlyBaseAmount] = useState<string>("0");
  const [effectiveFrom, setEffectiveFrom] = useState<string>(() =>
    new Date().toISOString().slice(0, 16)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Populate when switching role
  useEffect(() => {
    const existing =
      role === "RIDER" ? existingRiderEarnings : existingPickerEarnings;
    if (existing) {
      setMonthlyBaseAmount(String(existing.monthly_base_amount));
      setEffectiveFrom(
        new Date(existing.effective_from).toISOString().slice(0, 16)
      );
    } else {
      setMonthlyBaseAmount("0");
      setEffectiveFrom(new Date().toISOString().slice(0, 16));
    }
  }, [role, existingRiderEarnings, existingPickerEarnings]);

  const toTimestamp = (dtLocal: string) => {
    // dtLocal expected format YYYY-MM-DDTHH:mm
    return dtLocal ? new Date(dtLocal).getTime() : Date.now();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const amountNum = parseFloat(monthlyBaseAmount);
      if (isNaN(amountNum) || amountNum < 0) {
        toast.error("Monthly base amount must be a positive number");
        return;
      }
      const effectiveTs = toTimestamp(effectiveFrom);
      const existing =
        role === "RIDER" ? existingRiderEarnings : existingPickerEarnings;
      if (existing) {
        await updateBaseEarnings({
          id: existing._id,
          monthly_base_amount: amountNum,
          effective_from: effectiveTs,
        });
        toast.success(`Updated base earnings for ${role.toLowerCase()}s`);
      } else {
        await createBaseEarnings({
          role,
          monthly_base_amount: amountNum,
          effective_from: effectiveTs,
        });
        toast.success(`Created base earnings for ${role.toLowerCase()}s`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to save base earnings");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
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
          Choose which role this applies to.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Monthly Base Amount</label>
        <Input
          type="number"
          min={0}
          step="0.01"
          value={monthlyBaseAmount}
          onChange={(e) => setMonthlyBaseAmount(e.target.value)}
          placeholder="e.g. 1500.00"
        />
        <p className="text-xs text-muted-foreground">
          Fixed monthly amount paid regardless of performance.
        </p>
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
          : existingRiderEarnings || existingPickerEarnings
            ? "Update"
            : "Create"}{" "}
        Base Earnings
      </Button>
    </form>
  );
}
