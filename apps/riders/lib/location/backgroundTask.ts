import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { UploadPoint } from './types';
import { uploadBatch } from './uploader';

export const LOCATION_TASK = 'rider-location-task';

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('LOCATION_TASK error', error);
    return;
  }
  const { locations } = data as { locations: Array<Location.LocationObject> };
  if (!locations || !locations.length) return;

  const points: UploadPoint[] = locations.map((l) => ({
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    accuracy: l.coords.accuracy ?? null,
    speed: l.coords.speed ?? null,
    heading: l.coords.heading ?? null,
    ts: l.timestamp,
  }));

  try {
    await uploadBatch(points);
  } catch (e) {
    // TODO: implement offline queue (SQLite or file)
    console.warn('Failed to upload locations; will rely on retry policies', e);
  }
});

