import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import { RiderState } from './types';

export function buildLocationOptions(
  state: RiderState,
  lvl: number | null,
  charging: boolean
): Location.LocationTaskOptions {
  const lowBattery = (lvl ?? 1) <= 0.15 && !charging;

  // Defaults
  let accuracy = Location.Accuracy.Balanced;
  let distanceInterval = 200; // meters
  let timeInterval = 60_000; // ms
  let pausesUpdatesAutomatically = true; // iOS
  let activityType: Location.ActivityType | undefined = undefined;

  if (state === 'ACTIVE') {
    accuracy = lowBattery ? Location.Accuracy.Balanced : Location.Accuracy.High;
    distanceInterval = lowBattery ? 50 : 25;
    timeInterval = lowBattery ? 10_000 : 5_000;
    pausesUpdatesAutomatically = false;
    activityType = Location.ActivityType.AutomotiveNavigation;
  }

  if (state === 'NAVIGATING') {
    accuracy = lowBattery ? Location.Accuracy.High : Location.Accuracy.BestForNavigation;
    distanceInterval = lowBattery ? 25 : 10;
    timeInterval = lowBattery ? 5_000 : 2_000;
    pausesUpdatesAutomatically = false;
    activityType = Location.ActivityType.AutomotiveNavigation;
  }

  return {
    accuracy,
    distanceInterval,
    timeInterval,
    pausesUpdatesAutomatically,
    activityType,
    showsBackgroundLocationIndicator: state !== 'OFFLINE',
    foregroundService: {
      notificationTitle: 'Blink Riders',
      notificationBody:
        state === 'ACTIVE' || state === 'NAVIGATING'
          ? 'Tracking your delivery in real-time.'
          : 'You’re online. Location is updating intermittently.',
      notificationColor: '#FF5A1F',
    },
    deferredUpdatesInterval: state === 'IDLE' ? 60_000 : 10_000,
    deferredUpdatesDistance: state === 'IDLE' ? 200 : 50,
    mayShowUserSettingsDialog: true,
  };
}

