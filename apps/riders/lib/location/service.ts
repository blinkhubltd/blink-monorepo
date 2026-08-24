import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import { buildLocationOptions } from './options';
import { LOCATION_TASK } from './backgroundTask';
import { RiderState } from './types';

let riderState: RiderState = 'OFFLINE';
let batteryLevel: number | null = null;
let charging = false;

export async function initLocationPermissions() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') throw new Error('Foreground location not granted');
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') throw new Error('Background location not granted');
}

export async function initBatteryObservers() {
  batteryLevel = await Battery.getBatteryLevelAsync();
  const power = await Battery.getPowerStateAsync();
  charging = power.batteryState === Battery.BatteryState.CHARGING || power.batteryState === Battery.BatteryState.FULL;
  Battery.addBatteryLevelListener(({ batteryLevel: lvl }) => (batteryLevel = lvl));
  Battery.addPowerStateListener(({ batteryState }) => {
    charging = batteryState === Battery.BatteryState.CHARGING || batteryState === Battery.BatteryState.FULL;
  });
}

async function startOrUpdate() {
  const options = buildLocationOptions(riderState, batteryLevel, charging);
  const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  await Location.startLocationUpdatesAsync(LOCATION_TASK, options);
}

export async function goOnlineIdle() {
  riderState = 'IDLE';
  await startOrUpdate();
}

export async function startActiveDelivery() {
  riderState = 'ACTIVE';
  await startOrUpdate();
}

export async function startNavigating() {
  riderState = 'NAVIGATING';
  await startOrUpdate();
}

export async function goOffline() {
  riderState = 'OFFLINE';
  const has = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  if (has) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}

export function getRiderState() {
  return riderState;
}

