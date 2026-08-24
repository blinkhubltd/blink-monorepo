export type RiderState = 'OFFLINE' | 'IDLE' | 'ACTIVE' | 'NAVIGATING';

export interface Identity {
  riderId?: string; // Convex users._id as string
  clerkId?: string; // Clerk user id
}

export interface UploadPoint {
  lat: number;
  lng: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  ts: number; // ms
}

