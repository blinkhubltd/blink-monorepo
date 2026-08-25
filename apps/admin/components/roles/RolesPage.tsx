"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon as Trash2,
  Edit02Icon as Pencil,
  PlusSignIcon as Plus,
  Search01Icon as Search,
  ShieldUserIcon as Shield,
  UserGroupIcon as Users,
} from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@repo/ui/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/ui/alert-dialog";
import { Button } from "@repo/ui/components/ui/button";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@repo/ui/components/ui/card";
import { Input } from "@repo/ui/components/ui/input";
import { toast } from "sonner";
import { RoleForm } from "./RoleForm";

interface RoleRow {
  _id: Id<"roles">;
  name: string;
  description?: string;
  permissions: string[];
  is_default: boolean;
  manages_vendor: boolean;
  user_count: number;
}

export function RolesPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRow | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<RoleRow | null>(null);
  const [search, setSearch] = useState("");

  // Queries
  const rolesData = useQuery(api.user.roles.getRoles, {
    search: search.trim() || undefined,
  });

  // Mutations
  const createRole = useMutation(api.user.roles.createRole);
  const updateRole = useMutation(api.user.roles.updateRole);
  const deleteRole = useMutation(api.user.roles.deleteRole);

  const SYSTEM_ROLE_NAMES = ["rider", "picker", "customer", "super admin"];
  const isSystemRole = (name: string) =>
    SYSTEM_ROLE_NAMES.includes(name.trim().toLowerCase());

  const roles = rolesData?.roles ?? [];

  const handleCreate = async (values: {
    name: string;
    description?: string;
    permissions: string[];
    is_default: boolean;
    manages_vendor: boolean;
  }) => {
    try {
      await createRole(values);
      toast.success(`Role "${values.name}" created`);
      setShowCreateDialog(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to create role");
    }
  };

  const handleUpdate = async (values: {
    name: string;
    description?: string;
    permissions: string[];
    is_default: boolean;
    manages_vendor: boolean;
  }) => {
    if (!editingRole) return;
    try {
      await updateRole({ id: editingRole._id, ...values });
      toast.success(`Role "${values.name}" updated`);
      setEditingRole(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to update role");
    }
  };

  const handleDelete = async () => {
    if (!roleToDelete) return;
    try {
      await deleteRole({ id: roleToDelete._id });
      toast.success(`Role "${roleToDelete.name}" deleted`);
      setRoleToDelete(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete role");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <HugeiconsIcon icon={Shield} className="w-6 h-6 text-yellow-500" />
            Role Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Create and manage roles with custom permissions
          </p>
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
          className="bg-black hover:bg-gray-800 text-yellow-400"
        >
          <HugeiconsIcon icon={Plus} className="w-4 h-4 mr-2" />
          Create Role
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-4">
          <div className="relative">
            <HugeiconsIcon icon={Search} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search roles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Roles Table */}
      <Card>
        <CardHeader>
          <CardTitle>Roles ({roles.length})</CardTitle>
          <CardDescription>
            Manage access control roles and their permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!rolesData ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500" />
            </div>
          ) : roles.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <HugeiconsIcon icon={Shield} className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">No roles found</p>
              <p className="text-sm mt-1">
                Create your first role to get started
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead className="text-center">Users</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role: any) => (
                  <TableRow key={role._id}>
                    <TableCell className="font-medium">{role.name}</TableCell>
                    <TableCell className="text-gray-500 max-w-[200px] truncate">
                      {role.description || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {role.permissions.length} permissions
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex items-center gap-1 text-gray-600">
                        <HugeiconsIcon icon={Users} className="w-3.5 h-3.5" />
                        {role.user_count}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {isSystemRole(role.name) && (
                          <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100">
                            System
                          </Badge>
                        )}
                        {role.is_default && (
                          <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
                            Default
                          </Badge>
                        )}
                        {role.manages_vendor && (
                          <Badge variant="outline">Vendor</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isSystemRole(role.name) ? (
                          <span className="text-xs text-muted-foreground px-2">
                            System role
                          </span>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingRole(role)}
                              className="h-8 w-8"
                            >
                              <HugeiconsIcon icon={Pencil} className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setRoleToDelete(role)}
                              className="h-8 w-8 text-red-500 hover:text-red-600"
                              disabled={role.is_default}
                            >
                              <HugeiconsIcon icon={Trash2} className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Role</DialogTitle>
            <DialogDescription>
              Define a new role with specific permissions
            </DialogDescription>
          </DialogHeader>
          <RoleForm
            mode="create"
            onSubmit={handleCreate}
            onCancel={() => setShowCreateDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={!!editingRole}
        onOpenChange={(open) => !open && setEditingRole(null)}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Role</DialogTitle>
            <DialogDescription>
              Update role settings and permissions
            </DialogDescription>
          </DialogHeader>
          {editingRole && (
            <RoleForm
              mode="edit"
              initialValues={{
                name: editingRole.name,
                description: editingRole.description,
                permissions: editingRole.permissions,
                is_default: editingRole.is_default,
                manages_vendor: editingRole.manages_vendor,
              }}
              onSubmit={handleUpdate}
              onCancel={() => setEditingRole(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!roleToDelete}
        onOpenChange={(open) => !open && setRoleToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the role &quot;
              {roleToDelete?.name}
              &quot;?
              {roleToDelete && roleToDelete.user_count > 0 && (
                <span className="block mt-2 text-amber-600 font-medium">
                  {roleToDelete.user_count} user(s) will be reassigned to the
                  default role.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
