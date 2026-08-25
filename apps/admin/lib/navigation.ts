import type { IconSvgElement } from "@hugeicons/react";
import {
  ArrowDataTransferHorizontalIcon as ArrowLeftRight,
  BicycleIcon as Bike,
  BriefcaseDollarIcon as Briefcase,
  Calendar03Icon as Calendar,
  ChartBarLineIcon as BarChart3,
  Coins01Icon as Coins,
  CreditCardIcon as CreditCard,
  DashboardSquare01Icon as LayoutDashboard,
  FileRemoveIcon as FileX,
  FolderLibraryIcon as FolderTree,
  Image01Icon as ImageIcon,
  Location01Icon as MapPin,
  PackageIcon as Package,
  Settings01Icon as Settings,
  ShieldCheckIcon as ShieldCheck,
  ShieldUserIcon as Shield,
  Store01Icon as Store,
  TagIcon as Tag,
  TaskDone01Icon as ClipboardList,
  TruckDeliveryIcon as Truck,
  UserAdd01Icon as UserPlus,
  UserGroupIcon as Users,
} from "@hugeicons/core-free-icons";
import type { PermissionResource } from "@repo/lib/utils";

/**
 * The single source of truth for navigation.
 *
 * Following sydia's convention: one config drives the sidebar, the header
 * breadcrumb and the route guard, so those three cannot disagree. The previous
 * sidebar hardcoded its own list, which is why `/staff` had a page nobody could
 * reach — it was never added to that array.
 *
 * `resource` is typed as `PermissionResource`, so a link cannot name a module the
 * backend does not recognise. The roles form grants against the same vocabulary.
 */
export interface NavLink {
  icon: IconSvgElement;
  title: string;
  url: string;
  /**
   * The module a viewer needs READ on. Omitted only for pages that are
   * genuinely open to any signed-in staff member.
   */
  resource?: PermissionResource;
  /** Drill-downs, shown nested under the parent. */
  children?: Omit<NavLink, "icon" | "children">[];
}

export interface NavGroup {
  title: string;
  links: NavLink[];
}

/**
 * Not in a group: the landing page, which every signed-in user reaches and which
 * shows only the modules they can read.
 */
export const OVERVIEW_LINK: NavLink = {
  icon: LayoutDashboard,
  title: "Overview",
  url: "/",
};

export const navigation: NavGroup[] = [
  {
    title: "Intelligence",
    links: [
      {
        icon: BarChart3,
        title: "Insights",
        url: "/insights",
        resource: "insights",
        // These were pages with no way in but the URL bar. Nested here so a
        // drill-down is reachable from the rail as well as its parent.
        children: [
          { title: "Hub optimization", url: "/insights/hub-optimization", resource: "insights" },
          { title: "Orders", url: "/orders/insights", resource: "insights" },
          { title: "Products", url: "/products/insights", resource: "insights" },
          { title: "Shipments", url: "/shipments/insights", resource: "insights" },
          { title: "Users", url: "/users/insights", resource: "insights" },
          { title: "Industries", url: "/industries/insights", resource: "insights" },
        ],
      },
    ],
  },
  {
    title: "Catalog",
    links: [
      { icon: Package, title: "Products", url: "/products", resource: "products" },
      { icon: FolderTree, title: "Categories", url: "/categories", resource: "categories" },
      { icon: Briefcase, title: "Industries", url: "/industries", resource: "industries" },
      { icon: Tag, title: "Clearance", url: "/clearance", resource: "clearance" },
    ],
  },
  {
    title: "Operations",
    links: [
      { icon: ClipboardList, title: "Orders", url: "/orders", resource: "orders" },
      { icon: Truck, title: "Shipments", url: "/shipments", resource: "shipments" },
      {
        icon: FileX,
        title: "Prescriptions",
        url: "/prescriptions/rejection-reasons",
        resource: "prescriptions",
      },
    ],
  },
  {
    title: "Money",
    links: [
      { icon: CreditCard, title: "Payments", url: "/payments", resource: "payments" },
      { icon: ArrowLeftRight, title: "Transactions", url: "/transactions", resource: "transactions" },
      { icon: Coins, title: "Payroll", url: "/payroll", resource: "payroll" },
    ],
  },
  {
    title: "People",
    links: [
      { icon: Users, title: "Customers", url: "/users", resource: "users" },
      // Had a page and no sidebar entry, so it was unreachable except by URL.
      { icon: Shield, title: "Staff", url: "/staff", resource: "staff" },
      { icon: ShieldCheck, title: "Roles", url: "/roles", resource: "roles" },
      { icon: Calendar, title: "Schedules", url: "/schedules", resource: "schedules" },
    ],
  },
  {
    title: "Network",
    links: [
      { icon: Store, title: "Vendors", url: "/vendors", resource: "vendors" },
      {
        icon: UserPlus,
        title: "Agents",
        url: "/agents",
        resource: "agents",
        children: [
          { title: "Payment requests", url: "/agents/payment-requests", resource: "agents" },
          { title: "Zones", url: "/agents/zones", resource: "agents" },
        ],
      },
      { icon: Bike, title: "Riders", url: "/users?role=rider", resource: "riders" },
    ],
  },
  {
    title: "Marketing",
    links: [
      { icon: ImageIcon, title: "Banners", url: "/banners", resource: "banners" },
      { icon: MapPin, title: "Coverage", url: "/insights/hub-optimization", resource: "insights" },
    ],
  },
];

/**
 * Platform settings, kept out of the groups above.
 *
 * There is no `settings` module in the permission vocabulary — it is gated on
 * being an administrator, which the sidebar checks separately. Leaving it in a
 * group would imply a resource that does not exist.
 */
export const ADMIN_ONLY_LINKS: NavLink[] = [
  { icon: Settings, title: "Platform settings", url: "/settings" },
];

/** Every link, flattened — used for breadcrumb and guard lookups. */
export function allLinks(): { title: string; url: string }[] {
  const out: { title: string; url: string }[] = [
    { title: OVERVIEW_LINK.title, url: OVERVIEW_LINK.url },
  ];
  for (const group of navigation) {
    for (const link of group.links) {
      out.push({ title: link.title, url: link.url });
      for (const child of link.children ?? []) {
        out.push({ title: `${link.title} · ${child.title}`, url: child.url });
      }
    }
  }
  for (const link of ADMIN_ONLY_LINKS) {
    out.push({ title: link.title, url: link.url });
  }
  return out;
}

/**
 * The label for the current path, longest match first.
 *
 * Longest-first matters: `/orders/insights` must not resolve to "Orders" just
 * because that prefix also matches.
 */
export function labelForPath(pathname: string): string {
  const candidates = allLinks()
    .filter((l) => {
      const url = l.url.split("?")[0]!;
      return pathname === url || pathname.startsWith(url + "/");
    })
    .sort((a, b) => b.url.length - a.url.length);
  return candidates[0]?.title ?? "Dashboard";
}
