"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon as Loader2 } from "@hugeicons/core-free-icons";
import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { getConvexErrorMessage } from "@/lib/utils";
import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Textarea } from "@repo/ui/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Checkbox } from "@repo/ui/components/ui/checkbox";

type EarningType = "fixed" | "per_conversion" | "both";

export interface ZoneFormValues {
  name: string;
  description?: string;
  earning_type: EarningType;
  fixed_amount?: number;
  min_installs?: number;
  min_registrations?: number;
  install_commission_enabled?: boolean;
  install_commission_rate?: number;
  registration_commission_enabled?: boolean;
  registration_commission_rate?: number;
}

interface ZoneFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues?: Partial<ZoneFormValues>;
  onSubmit: (values: ZoneFormValues) => Promise<void>;
  mode?: "create" | "edit";
}

const defaultValues: ZoneFormValues = {
  name: "",
  description: "",
  earning_type: "per_conversion",
  fixed_amount: undefined,
  min_installs: undefined,
  min_registrations: undefined,
  install_commission_enabled: true,
  install_commission_rate: undefined,
  registration_commission_enabled: true,
  registration_commission_rate: undefined,
};

export function ZoneForm({
  open,
  onOpenChange,
  initialValues,
  onSubmit,
  mode = "create",
}: ZoneFormProps) {
  const [values, setValues] = useState<ZoneFormValues>({
    ...defaultValues,
    ...initialValues,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setValues({ ...defaultValues, ...initialValues });
    }
  }, [open, initialValues]);

  const showFixed =
    values.earning_type === "fixed" || values.earning_type === "both";
  const showConversion =
    values.earning_type === "per_conversion" || values.earning_type === "both";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.name.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (error) {
      console.error("Zone form error:", error);
      toast.error(getConvexErrorMessage(error, "Failed to save zone"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const set = (field: keyof ZoneFormValues, value: unknown) =>
    setValues((prev) => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create Zone" : "Edit Zone"}
          </DialogTitle>
          <DialogDescription>
            Zones group agents under a shared commission configuration.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="zone-name">Zone Name *</Label>
            <Input
              id="zone-name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Nairobi West"
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="zone-description">Description</Label>
            <Textarea
              id="zone-description"
              value={values.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Optional description..."
              rows={2}
            />
          </div>

          {/* Earning Type */}
          <div className="space-y-2">
            <Label htmlFor="earning-type">Commission Type *</Label>
            <Select
              value={values.earning_type}
              onValueChange={(v) => set("earning_type", v as EarningType)}
            >
              <SelectTrigger id="earning-type">
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">
                  Fixed (flat amount per payout cycle)
                </SelectItem>
                <SelectItem value="per_conversion">
                  Per Conversion (per install / registration)
                </SelectItem>
                <SelectItem value="both">
                  Both (fixed + per conversion)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Fixed amount */}
          {showFixed && (
            <div className="space-y-2">
              <Label htmlFor="fixed-amount">Fixed Amount (KES)</Label>
              <Input
                id="fixed-amount"
                type="number"
                min={0}
                step={0.01}
                value={values.fixed_amount ?? ""}
                onChange={(e) =>
                  set(
                    "fixed_amount",
                    e.target.value === ""
                      ? undefined
                      : parseFloat(e.target.value),
                  )
                }
                placeholder="0.00"
              />
            </div>
          )}

          {/* Per-conversion commissions */}
          {showConversion && (
            <div className="space-y-4 rounded-md border p-4">
              <p className="text-sm font-medium">Per-Conversion Rates</p>

              {/* Install commission */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="install-enabled"
                    checked={values.install_commission_enabled ?? false}
                    onCheckedChange={(checked) =>
                      set("install_commission_enabled", !!checked)
                    }
                  />
                  <Label htmlFor="install-enabled">
                    Enable install commission
                  </Label>
                </div>
                {values.install_commission_enabled && (
                  <div className="space-y-2 pl-6">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={values.install_commission_rate ?? ""}
                      onChange={(e) =>
                        set(
                          "install_commission_rate",
                          e.target.value === ""
                            ? undefined
                            : parseFloat(e.target.value),
                        )
                      }
                      placeholder="KES per install"
                    />
                    {values.earning_type === "both" && (
                      <div className="space-y-1">
                        <Label
                          htmlFor="min-installs-both"
                          className="text-xs text-muted-foreground"
                        >
                          Min. installs for fixed amount (rate applies to
                          extras)
                        </Label>
                        <Input
                          id="min-installs-both"
                          type="number"
                          min={0}
                          step={1}
                          value={values.min_installs ?? ""}
                          onChange={(e) =>
                            set(
                              "min_installs",
                              e.target.value === ""
                                ? undefined
                                : parseInt(e.target.value, 10),
                            )
                          }
                          placeholder="e.g. 10"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Registration commission */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="reg-enabled"
                    checked={values.registration_commission_enabled ?? false}
                    onCheckedChange={(checked) =>
                      set("registration_commission_enabled", !!checked)
                    }
                  />
                  <Label htmlFor="reg-enabled">
                    Enable registration commission
                  </Label>
                </div>
                {values.registration_commission_enabled && (
                  <div className="space-y-2 pl-6">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={values.registration_commission_rate ?? ""}
                      onChange={(e) =>
                        set(
                          "registration_commission_rate",
                          e.target.value === ""
                            ? undefined
                            : parseFloat(e.target.value),
                        )
                      }
                      placeholder="KES per registration"
                    />
                    {values.earning_type === "both" && (
                      <div className="space-y-1">
                        <Label
                          htmlFor="min-registrations-both"
                          className="text-xs text-muted-foreground"
                        >
                          Min. registrations for fixed amount (rate applies to
                          extras)
                        </Label>
                        <Input
                          id="min-registrations-both"
                          type="number"
                          min={0}
                          step={1}
                          value={values.min_registrations ?? ""}
                          onChange={(e) =>
                            set(
                              "min_registrations",
                              e.target.value === ""
                                ? undefined
                                : parseInt(e.target.value, 10),
                            )
                          }
                          placeholder="e.g. 5"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!values.name.trim() || isSubmitting}
            >
              {isSubmitting && (
                <HugeiconsIcon icon={Loader2} className="mr-2 h-4 w-4 animate-spin" />
              )}
              {mode === "create" ? "Create Zone" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
