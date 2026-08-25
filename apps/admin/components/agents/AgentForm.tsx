"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon as Loader2 } from "@hugeicons/core-free-icons";
import React, { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import { Id } from "@repo/backend/dataModel";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Label } from "@repo/ui/components/ui/label";
import { Input } from "@repo/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";

export interface AgentFormSubmitValues {
  userId: Id<"users">;
  zone_id?: Id<"agent_zones">;
  mpesa_number?: string;
}

interface AgentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit";
  /** Provided in edit mode — user cannot be changed */
  editAgentId?: Id<"agents">;
  initialValues?: {
    zone_id?: Id<"agent_zones">;
    mpesa_number?: string;
  };
  /** Phone from the agent's user profile, used as default M-Pesa number */
  initialUserPhone?: string;
  onSubmit: (values: AgentFormSubmitValues) => Promise<void>;
}

export function AgentForm({
  open,
  onOpenChange,
  mode = "create",
  editAgentId,
  initialValues,
  initialUserPhone,
  onSubmit,
}: AgentFormProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [zoneId, setZoneId] = useState<string>(
    initialValues?.zone_id ?? "none",
  );
  const [mpesaNumber, setMpesaNumber] = useState<string>(
    initialValues?.mpesa_number ?? initialUserPhone ?? "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const users = useQuery(api.user.users.getAllCustomers);
  const zones = useQuery(api.data.agent_zones.getAllZones);

  useEffect(() => {
    if (open) {
      setZoneId(initialValues?.zone_id ?? "none");
      setMpesaNumber(initialValues?.mpesa_number ?? initialUserPhone ?? "");
      if (mode === "create") setSelectedUserId("");
    }
  }, [open, initialValues, initialUserPhone, mode]);

  // In create mode, auto-fill M-Pesa number from the selected user's phone
  useEffect(() => {
    if (mode !== "create" || !selectedUserId || !users) return;
    const user = users.find((u) => u._id === selectedUserId);
    if (user?.phone) setMpesaNumber(user.phone);
  }, [selectedUserId, users, mode]);

  const userOptions =
    users?.map((user) => ({
      value: user._id,
      label: `${user.name || `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim()} (${user.email ?? ""})`,
    })) ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "create" && !selectedUserId) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        userId: selectedUserId as Id<"users">,
        zone_id:
          zoneId && zoneId !== "none"
            ? (zoneId as Id<"agent_zones">)
            : undefined,
        mpesa_number: mpesaNumber.trim() || undefined,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving agent:", error);
      toast.error(getConvexErrorMessage(error, "Failed to save agent"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCreateDisabled = mode === "create" && !selectedUserId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add Agent" : "Edit Agent"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Select a user to register as a marketing agent. An agent code will be automatically generated."
              : "Update the agent's zone assignment and M-Pesa payout details."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* User select — create mode only */}
          {mode === "create" && (
            <div className="space-y-2">
              <Label htmlFor="user-select">User</Label>
              {!users ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <HugeiconsIcon icon={Loader2} className="h-4 w-4 animate-spin" />
                  Loading users...
                </div>
              ) : (
                <SearchableSelect
                  options={userOptions}
                  value={selectedUserId}
                  onValueChange={setSelectedUserId}
                  placeholder="Select a user..."
                  searchPlaceholder="Search by name or email..."
                  emptyText="No users found."
                />
              )}
            </div>
          )}

          {/* Zone select */}
          <div className="space-y-2">
            <Label htmlFor="agent-zone">Zone (optional)</Label>
            {!zones ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <HugeiconsIcon icon={Loader2} className="h-4 w-4 animate-spin" />
                Loading zones...
              </div>
            ) : (
              <Select value={zoneId} onValueChange={setZoneId}>
                <SelectTrigger id="agent-zone">
                  <SelectValue placeholder="No zone assigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No zone</SelectItem>
                  {(zones as any[]).map((z) => (
                    <SelectItem key={z._id} value={z._id}>
                      {z.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* M-Pesa number */}
          <div className="space-y-2">
            <Label htmlFor="mpesa-number">M-Pesa Number (for payouts)</Label>
            <Input
              id="mpesa-number"
              value={mpesaNumber}
              onChange={(e) => setMpesaNumber(e.target.value)}
              placeholder="e.g. 254712345678"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isCreateDisabled || isSubmitting}>
              {isSubmitting && (
                <HugeiconsIcon icon={Loader2} className="mr-2 h-4 w-4 animate-spin" />
              )}
              {mode === "create" ? "Add Agent" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
