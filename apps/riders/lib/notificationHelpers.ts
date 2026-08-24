/**
 * Role-specific notification helpers for riders and pickers
 * Provides icons, colors, and formatting functions
 */

export const getRoleSpecificNotificationIcon = (
  type: string,
  role: string,
): string => {
  const key = role.trim().toUpperCase();
  const iconMap: Record<string, Record<string, string>> = {
    RIDER: {
      delivery_assigned: "🚚",
      order_ready: "📦",
      route_update: "🗺️",
      delivery_complete: "✅",
      status_update: "📬",
      delivery: "🚛",
      default: "🔔",
    },
    PICKER: {
      order_assigned: "📋",
      order_priority: "⚡",
      stock_alert: "📦",
      target_reminder: "🎯",
      order_update: "📝",
      system: "⚙️",
      default: "🔔",
    },
    CUSTOMER: {
      order_update: "📋",
      delivery: "🚚",
      promotion: "🎁",
      system: "⚙️",
      default: "🔔",
    },
  };

  return iconMap[key]?.[type] || iconMap[key]?.default || "🔔";
};

export const getRoleSpecificNotificationColor = (
  type: string,
  role: string,
): string => {
  const key = role.trim().toUpperCase();
  const colorMap: Record<string, Record<string, string>> = {
    RIDER: {
      delivery_assigned: "#10B981", // green
      order_ready: "#F59E0B", // amber
      route_update: "#3B82F6", // blue
      delivery_complete: "#059669", // emerald
      status_update: "#6366F1", // indigo
      delivery: "#10B981", // green
      default: "#6B7280", // gray
    },
    PICKER: {
      order_assigned: "#8B5CF6", // violet
      order_priority: "#EF4444", // red
      stock_alert: "#F59E0B", // amber
      target_reminder: "#06B6D4", // cyan
      order_update: "#8B5CF6", // violet
      system: "#6B7280", // gray
      default: "#6B7280", // gray
    },
    CUSTOMER: {
      order_update: "#3B82F6", // blue
      delivery: "#10B981", // green
      promotion: "#F59E0B", // amber
      system: "#6B7280", // gray
      default: "#6B7280", // gray
    },
  };

  return colorMap[key]?.[type] || colorMap[key]?.default || "#6B7280";
};

export const formatNotificationTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
};

export const getRoleSpecificEmptyMessage = (role: string): string => {
  const key = role.trim().toUpperCase();
  switch (key) {
    case "RIDER":
      return "No delivery notifications yet. You'll see assignment and pickup alerts here.";
    case "PICKER":
      return "No order notifications yet. You'll see new orders and assignments here.";
    default:
      return "No notifications yet.";
  }
};

export const getRoleSpecificFilterOptions = (role: string) => {
  const key = role.trim().toUpperCase();
  const commonFilters = [
    { id: "all", label: "All", icon: "📋" },
    { id: "unread", label: "Unread", icon: "🔴" },
  ];

  const roleSpecificFilters: Record<string, any[]> = {
    RIDER: [
      ...commonFilters,
      { id: "delivery", label: "Deliveries", icon: "🚚" },
    ],
    PICKER: [...commonFilters, { id: "orders", label: "Orders", icon: "📦" }],
  };

  return roleSpecificFilters[key] || commonFilters;
};

export const getNotificationPriority = (
  type: string,
  role: string,
): "high" | "normal" | "low" => {
  const key = role.trim().toUpperCase();
  const priorityMap: Record<
    string,
    Record<string, "high" | "normal" | "low">
  > = {
    RIDER: {
      delivery_assigned: "high",
      order_ready: "high",
      route_update: "normal",
      delivery_complete: "normal",
      status_update: "normal",
      delivery: "high",
    },
    PICKER: {
      order_assigned: "high",
      order_priority: "high",
      stock_alert: "normal",
      target_reminder: "low",
      order_update: "normal",
      system: "low",
    },
  };

  return priorityMap[key]?.[type] || "normal";
};

export const formatNotificationMessage = (
  title: string,
  message: string,
  role: string,
): { title: string; message: string } => {
  const key = role.trim().toUpperCase();
  // Role-specific message enhancement
  const rolePrefix: Record<string, string> = {
    RIDER: "🚚 ",
    PICKER: "📋 ",
  };

  // Don't add prefix if title already has an emoji
  const hasEmoji =
    /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(
      title,
    );

  const enhancedTitle = hasEmoji ? title : `${rolePrefix[key] || ""}${title}`;

  return {
    title: enhancedTitle,
    message: message,
  };
};

export const shouldPlaySound = (type: string, role: string): boolean => {
  // Always play sound for critical notifications
  const criticalTypes = [
    "delivery_assigned",
    "order_assigned",
    "order_ready",
    "order_priority",
  ];
  return criticalTypes.includes(type);
};

export const getNotificationSound = (type: string, role: string): string => {
  // Different sounds for different priorities
  const priority = getNotificationPriority(type, role);

  switch (priority) {
    case "high":
      return "default"; // Could be customized to different sound files
    case "normal":
      return "default";
    case "low":
      return "default";
    default:
      return "default";
  }
};
