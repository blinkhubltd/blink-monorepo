"use client";

import { useState, useEffect } from "react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { Switch } from "@repo/ui/components/ui/switch";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  permissionResources,
  permissionActions,
  type PermissionResource,
  type PermissionAction,
} from "@repo/lib/utils";

// ── PermissionResource groups for the permission picker ──────────────────
const RESOURCE_GROUPS = [
  {
    label: "System Access",
    resources: ["users", "roles"] as PermissionResource[],
  },
  {
    label: "Inventory & Content",
    resources: [
      "products",
      "categories",
      "industries",
      "clearance",
      "banners",
    ] as PermissionResource[],
  },
  {
    label: "Marketing",
    resources: ["agents"] as PermissionResource[],
  },
  {
    label: "Operations",
    resources: [
      "orders",
      "shipments",
      "payments",
      "transactions",
      "prescriptions",
      "schedules",
      "payroll",
    ] as PermissionResource[],
  },
  {
    label: "Analytics & Vendors",
    resources: ["insights", "vendors"] as PermissionResource[],
  },
];

interface RoleFormValues {
  name: string;
  description?: string;
  permissions: string[];
  is_default: boolean;
  manages_vendor: boolean;
}

interface RoleFormProps {
  mode: "create" | "edit";
  initialValues?: RoleFormValues;
  onSubmit: (values: RoleFormValues) => Promise<void>;
  onCancel: () => void;
}

export function RoleForm({
  mode,
  initialValues,
  onSubmit,
  onCancel,
}: RoleFormProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(
    initialValues?.description ?? "",
  );
  const [permissions, setPermissions] = useState<Set<string>>(
    new Set(initialValues?.permissions ?? []),
  );
  const [isDefault, setIsDefault] = useState(
    initialValues?.is_default ?? false,
  );
  const [managesVendor, setManagesVendor] = useState(
    initialValues?.manages_vendor ?? false,
  );

  // Sync when initialValues changes (edit mode)
  useEffect(() => {
    if (initialValues) {
      setName(initialValues.name);
      setDescription(initialValues.description ?? "");
      setPermissions(new Set(initialValues.permissions));
      setIsDefault(initialValues.is_default);
      setManagesVendor(initialValues.manages_vendor);
    }
  }, [initialValues]);

  // ── Permission toggle helpers ──────────────────────────────
  const togglePermission = (perm: string) => {
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  };

  const toggleResourceRow = (resource: PermissionResource) => {
    const all = permissionActions.map((a) => `${resource}:${a}`);
    const allChecked = all.every((p) => permissions.has(p));
    setPermissions((prev) => {
      const next = new Set(prev);
      all.forEach((p) => (allChecked ? next.delete(p) : next.add(p)));
      return next;
    });
  };

  const toggleActionColumn = (resources: PermissionResource[], action: PermissionAction) => {
    const perms = resources.map((r) => `${r}:${action}`);
    const allChecked = perms.every((p) => permissions.has(p));
    setPermissions((prev) => {
      const next = new Set(prev);
      perms.forEach((p) => (allChecked ? next.delete(p) : next.add(p)));
      return next;
    });
  };

  const toggleGroupAll = (resources: PermissionResource[]) => {
    const all = resources.flatMap((r) => permissionActions.map((a) => `${r}:${a}`));
    const allChecked = all.every((p) => permissions.has(p));
    setPermissions((prev) => {
      const next = new Set(prev);
      all.forEach((p) => (allChecked ? next.delete(p) : next.add(p)));
      return next;
    });
  };

  const toggleAll = () => {
    const all = permissionResources.flatMap((r) => permissionActions.map((a) => `${r}:${a}`));
    const allChecked = all.every((p) => permissions.has(p));
    setPermissions(allChecked ? new Set() : new Set(all));
  };

  // ── Submit ─────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!name.trim()) {
      return;
    }
    setLoading(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        permissions: Array.from(permissions),
        is_default: isDefault,
        manages_vendor: managesVendor,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Basic Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="role-name">Role Name *</Label>
          <Input
            id="role-name"
            placeholder="e.g. Hub Manager"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="role-desc">Description</Label>
          <Textarea
            id="role-desc"
            placeholder="What does this role do?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={1}
          />
        </div>
      </div>

      {/* Flags */}
      <div className="flex flex-wrap gap-6">
        <div className="flex items-center gap-2">
          <Switch
            id="is-default"
            checked={isDefault}
            onCheckedChange={setIsDefault}
          />
          <Label htmlFor="is-default">Default role for new sign-ups</Label>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="manages-vendor"
            checked={managesVendor}
            onCheckedChange={setManagesVendor}
          />
          <Label htmlFor="manages-vendor">Manages a vendor</Label>
        </div>
      </div>

      {managesVendor && (
        <p className="text-sm text-amber-600 bg-amber-50 rounded-md px-3 py-2">
          When assigning this role to a user, you will select which vendor they
          manage.
        </p>
      )}

      {/* Permission Picker */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Permissions</Label>
          <div className="flex items-center gap-3">
            <Badge variant="secondary">{permissions.size} selected</Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleAll}
            >
              {permissions.size === permissionResources.length * permissionActions.length
                ? "Clear All"
                : "Select All"}
            </Button>
          </div>
        </div>

        {RESOURCE_GROUPS.map((group) => {
          const groupPerms = group.resources.flatMap((r) =>
            permissionActions.map((a) => `${r}:${a}`),
          );
          const allGroupChecked = groupPerms.every((p) => permissions.has(p));
          const someGroupChecked =
            !allGroupChecked && groupPerms.some((p) => permissions.has(p));

          return (
            <div
              key={group.label}
              className="border rounded-lg overflow-hidden"
            >
              {/* Group Header */}
              <div className="bg-gray-50 px-4 py-2 flex items-center justify-between border-b">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={allGroupChecked}
                    ref={(el) => {
                      if (el) {
                        (el as unknown as HTMLInputElement).indeterminate =
                          someGroupChecked;
                      }
                    }}
                    onCheckedChange={() => toggleGroupAll(group.resources)}
                  />
                  <span className="text-sm font-semibold text-gray-700">
                    {group.label}
                  </span>
                </div>
                {/* Column toggles */}
                <div className="flex gap-4">
                  {permissionActions.map((action) => {
                    const colPerms = group.resources.map(
                      (r) => `${r}:${action}`,
                    );
                    const allCol = colPerms.every((p) => permissions.has(p));
                    return (
                      <button
                        key={action}
                        type="button"
                        className={`text-xs font-medium px-2 py-0.5 rounded ${
                          allCol
                            ? "bg-yellow-100 text-yellow-800"
                            : "text-gray-500 hover:text-gray-700"
                        }`}
                        onClick={() =>
                          toggleActionColumn(group.resources, action)
                        }
                      >
                        {action}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* PermissionResource Rows */}
              <div className="divide-y">
                {group.resources.map((resource) => {
                  const rowPerms = permissionActions.map((a) => `${resource}:${a}`);
                  const allRow = rowPerms.every((p) => permissions.has(p));
                  const someRow =
                    !allRow && rowPerms.some((p) => permissions.has(p));

                  return (
                    <div
                      key={resource}
                      className="px-4 py-2 flex items-center justify-between hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={allRow}
                          ref={(el) => {
                            if (el) {
                              (
                                el as unknown as HTMLInputElement
                              ).indeterminate = someRow;
                            }
                          }}
                          onCheckedChange={() => toggleResourceRow(resource)}
                        />
                        <span className="text-sm capitalize">
                          {resource.replace(/-/g, " ")}
                        </span>
                      </div>
                      <div className="flex gap-4">
                        {permissionActions.map((action) => {
                          const perm = `${resource}:${action}`;
                          return (
                            <div
                              key={perm}
                              className="w-16 flex justify-center"
                            >
                              <Checkbox
                                checked={permissions.has(perm)}
                                onCheckedChange={() => togglePermission(perm)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={loading || !name.trim()}
          className="bg-black hover:bg-gray-800 text-yellow-400"
        >
          {loading
            ? "Saving..."
            : mode === "create"
              ? "Create Role"
              : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
