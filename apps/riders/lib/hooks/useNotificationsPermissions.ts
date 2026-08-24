import { useCallback, useEffect, useState } from "react";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

export interface UseNotificationsPermissionsOptions {
  request?: boolean;
}

export function useNotificationsPermissions(
  opts: UseNotificationsPermissionsOptions = {}
) {
  const { request = true } = opts;
  const [status, setStatus] = useState<Notifications.PermissionStatus | null>(
    null
  );
  const [canAskAgain, setCanAskAgain] = useState<boolean>(false);
  const [isDevice, setIsDevice] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      const settings = await Notifications.getPermissionsAsync();
      setStatus(settings.status);
      setCanAskAgain((settings as any).canAskAgain ?? false);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    setIsDevice(Device.isDevice);
    refresh();
  }, [refresh]);

  useEffect(() => {
    (async () => {
      if (!request) return;
      if (status === null) return;
      if (status !== Notifications.PermissionStatus.GRANTED && isDevice) {
        try {
          const settings = await Notifications.requestPermissionsAsync();
          setStatus(settings.status);
          setCanAskAgain((settings as any).canAskAgain ?? false);
        } catch (err: any) {
          setError(err.message);
        }
      }
    })();
  }, [request, status, canAskAgain]);

  return { status, canAskAgain, isDevice, error, refresh };
}

export async function getExpoPushTokenSafe() {
  try {
    const projectId =
      (Constants as any)?.expoConfig?.extra?.eas?.projectId ||
      (Constants as any)?.easConfig?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return token.data;
  } catch (error) {
    console.warn("Error getting Expo push token:", error);
    return null;
  }
}
