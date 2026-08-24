import React from "react";
import { useRegisterPushToken } from "@/lib/hooks/useRegisterPushToken";
import { useNotificationResponse } from "@/lib/hooks/useNotificationResponse";

interface NotificationProviderProps {
  children: React.ReactNode;
}

export default function NotificationProvider({
  children,
}: NotificationProviderProps) {
  // Register push tokens on app startup
  useRegisterPushToken();

  // Handle notification taps and navigation
  useNotificationResponse();

  return <>{children}</>;
}
