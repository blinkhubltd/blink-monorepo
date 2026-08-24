import { UploadPoint } from './types';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_CONVEX_SITE_URL || process.env.EXPO_PUBLIC_CONVEX_URL;
const INGEST_PATH = '/rider/location';

async function getApiKey() {
  // Store the key in SecureStore after first login or configuration
  return SecureStore.getItemAsync('LOCATION_INGEST_API_KEY');
}

async function getIdentity() {
  const clerkId = await SecureStore.getItemAsync('LOCATION_CLERK_ID');
  const riderId = await SecureStore.getItemAsync('LOCATION_RIDER_ID');
  return { clerkId, riderId };
}

export async function uploadBatch(points: UploadPoint[]) {
  if (!BASE_URL) throw new Error('Missing EXPO_PUBLIC_CONVEX_SITE_URL or EXPO_PUBLIC_CONVEX_URL');
  const apiKey = await getApiKey();
  const { clerkId, riderId } = await getIdentity();
  const url = `${BASE_URL}${INGEST_PATH}`;
  const body = JSON.stringify({ points, clerkId, riderId });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey || '',
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${res.status} ${text}`);
  }

  return res.json();
}

