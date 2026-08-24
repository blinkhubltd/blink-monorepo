import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as TaskManager from 'expo-task-manager';
import { useUser } from '@clerk/clerk-expo';
import { initLocationPermissions, initBatteryObservers, goOnlineIdle, goOffline, startActiveDelivery, startNavigating, getRiderState } from './service';
import { RiderState } from './types';
import './backgroundTask'; // ensure task is registered
import * as SecureStore from 'expo-secure-store';

interface LocationContextValue {
  state: RiderState;
  goOnlineIdle: () => Promise<void>;
  startActiveDelivery: () => Promise<void>;
  startNavigating: () => Promise<void>;
  goOffline: () => Promise<void>;
}

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const [state, setState] = useState<RiderState>('OFFLINE');

  useEffect(() => {
    // Initialize only for signed-in riders (role check can be added if user metadata available)
    (async () => {
      try {
        if (user?.id) {
          await SecureStore.setItemAsync('LOCATION_CLERK_ID', user.id);
        }
        await initLocationPermissions();
        await initBatteryObservers();
        setState(getRiderState());
      } catch (e) {
        console.warn('Location init failed', e);
      }
    })();
  }, [user?.id]);

  const value = useMemo<LocationContextValue>(() => ({
    state,
    async goOnlineIdle() {
      await goOnlineIdle();
      setState('IDLE');
    },
    async startActiveDelivery() {
      await startActiveDelivery();
      setState('ACTIVE');
    },
    async startNavigating() {
      await startNavigating();
      setState('NAVIGATING');
    },
    async goOffline() {
      await goOffline();
      setState('OFFLINE');
    },
  }), [state]);

  return (
    <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
  );
}

export function useLocationService() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocationService must be used within LocationProvider');
  return ctx;
}

