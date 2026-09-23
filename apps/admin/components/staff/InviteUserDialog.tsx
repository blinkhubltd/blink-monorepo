"use client";

import React, { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@repo/backend";
import { Id } from "@repo/backend/dataModel";
import { toast } from "sonner";
import { getConvexErrorMessage } from "@/lib/utils";
import { WILDCARD_PERMISSION } from "@repo/lib/utils";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon as Loader2 } from "@hugeicons/core-free-icons";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";

/**
 * Invite someone who does not have an account yet, as a chosen role.
 *
 * Fires `user/invitations.ts`'s `inviteUser` action — the email address is
 * the only field Clerk actually pins for the person; first and last name go
 * along for the ride (see that module's comment) and the role is applied
 * server-side once they accept, never something this dialog does itself.
 *
 * Roles holding the wildcard permission are left out of the picker entirely
 * for anyone who is not already a super admin — not just refused on submit.
 * The backend enforces the same rule (`validateInvite`); this is so a
 * non-super-admin never sees an option they would be denied, rather than
 * finding out after filling in a name and an email.
 */
export function InviteUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { isSuperAdmin } = useCurrentUserPermissions();
  const allRoles = useQuery(api.user.roles.getAllRoles);
  const inviteUser = useAction(api.user.invitations.inviteUser);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Reset happens on the CLOSE transition itself, not in an effect watching
  // `open` — synchronising local state from a prop this way is one extra
  // render on every close for no benefit, since the close is already the one
  // event that needs to trigger it.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setFirstName("");
      setLastName("");
      setEmail("");
      setRoleId("");
    }
    onOpenChange(next);
  }

  const roleOptions = (allRoles ?? []).filter(
    (role) => isSuperAdmin || !role.permissions.includes(WILDCARD_PERMISSION),
  );

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    emailValid &&
    roleId.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      await inviteUser({
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        roleId: roleId as Id<"roles">,
      });
      toast.success(`Invitation sent to ${email.trim()}`);
      handleOpenChange(false);
    } catch (error) {
      console.error("Error sending invitation:", error);
      toast.error(getConvexErrorMessage(error, "Could not send the invitation"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Invite a user</DialogTitle>
          <DialogDescription>
            Sends an email with a sign-up link. They set their own password
            (and phone, if this Clerk instance asks for it) when they accept
            — the role below is applied the moment they do.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="invite-first-name">First name</Label>
              <Input
                id="invite-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Jane"
                disabled={submitting}
                autoComplete="given-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-last-name">Last name</Label>
              <Input
                id="invite-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Mwangi"
                disabled={submitting}
                autoComplete="family-name"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@blink.app"
              disabled={submitting}
              autoComplete="email"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={roleId} onValueChange={setRoleId} disabled={submitting}>
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue placeholder="Choose a role" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((role) => (
                  <SelectItem key={role._id} value={role._id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isSuperAdmin ? (
              <p className="text-muted-foreground text-xs">
                Roles with full access are only offered to super admins.
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? (
                <HugeiconsIcon icon={Loader2} className="size-4 animate-spin" />
              ) : null}
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
