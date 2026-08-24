/**
 * One crew app, two roles. The reference app shipped two parallel tab groups
 * — (tabs) and (picker-tabs) — with near-duplicate screens; per the design this
 * is a single navigator whose labels, icons and content switch on the role.
 */
export type CrewRole = "rider" | "picker";

export const CREW_ROLES = ["rider", "picker"] as const;

/** Role names as they exist in the backend `roles` table. */
export const BACKEND_ROLE_NAMES: Record<CrewRole, string> = {
  rider: "Rider",
  picker: "Picker",
};

export function crewRoleFromRoleName(
  roleName: string | null | undefined,
): CrewRole | null {
  if (!roleName) return null;
  const n = roleName.trim().toLowerCase();
  if (n === "rider") return "rider";
  if (n === "picker") return "picker";
  return null;
}

export function roleLabel(role: CrewRole): string {
  return role === "rider" ? "Rider" : "Picker";
}

/** The queue tab is "Deliveries" for a rider and "Orders" for a picker. */
export function queueTabLabel(role: CrewRole): string {
  return role === "rider" ? "Deliveries" : "Orders";
}
