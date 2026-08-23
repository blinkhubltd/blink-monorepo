// Shared, platform-agnostic utilities. No React, no react-native, no next/*.
//
// Phase B1 lands `./utils/permissions.ts` here: the typed `Permission` template
// union ported from `packages/backend/convex/lib/permissions.ts`, together with
// the inheritance rules currently living in `blink-admin/lib/dashboard-permissions.ts`
// (CREATE grants UPDATE and DELETE). Both the Convex `assertPermission` guard and
// the admin roles form must evaluate against this one module, so that a guard
// string no role could ever be granted becomes a compile error rather than a
// silent denial.
//
// Deliberately kept UPPERCASE (`orders:CREATE`, not `orders:create`): that is the
// vocabulary `blink-admin/components/roles/RoleForm.tsx` writes, so it is what is
// sitting in the production `roles` table today. See §11 of the plan.

export {};
