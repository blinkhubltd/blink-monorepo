import { action } from "../_generated/server";
import { v } from "convex/values";

// Fetch driving directions between origin and destination using Google Directions API.
// Returns distance (meters), duration (seconds), polyline (encoded), and waypoints if any.
// Requires SERVER_GOOGLE_MAPS_API_KEY in Convex environment variables.
// This action is useful as a fallback when client-side SDK can't fetch directions (e.g., permission issues) or to pre-compute ETA.
export const fetchRoute = action({
  args: {
    origin: v.object({ lat: v.float64(), lng: v.float64() }),
    destination: v.object({ lat: v.float64(), lng: v.float64() }),
    mode: v.optional(
      v.union(
        v.literal("driving"),
        v.literal("walking"),
        v.literal("bicycling"),
        v.literal("transit"),
        v.literal("two_wheeler") // Google experimental mode sometimes available
      )
    ),
  },
  handler: async (ctx, args) => {
    const key = process.env.SERVER_GOOGLE_MAPS_API_KEY;
    if (!key) {
      throw new Error("Missing SERVER_GOOGLE_MAPS_API_KEY env var");
    }

    // Build request URL
    const base = "https://maps.googleapis.com/maps/api/directions/json";
    const params = new URLSearchParams({
      origin: `${args.origin.lat},${args.origin.lng}`,
      destination: `${args.destination.lat},${args.destination.lng}`,
      key,
      mode: args.mode || "driving",
    });
    // Request optimized waypoints only for potential future multi-stop extension (currently none)
    // params.append("optimize", "true"); // Not a valid parameter by itself, keep commented.

    const url = `${base}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      return {
        ok: false,
        error: `Request failed status ${res.status}`,
      };
    }
    const data: any = await res.json();
    if (data.status !== "OK" || !data.routes?.length) {
      return {
        ok: false,
        error: data.status || "NO_ROUTES",
        raw_status: data.status,
      };
    }

    const route = data.routes[0];
    const leg = route.legs?.[0];
    if (!leg) {
      return { ok: false, error: "NO_LEGS" };
    }

    return {
      ok: true,
      distance_meters: leg.distance?.value,
      duration_seconds: leg.duration?.value,
      distance_text: leg.distance?.text,
      duration_text: leg.duration?.text,
      start_address: leg.start_address,
      end_address: leg.end_address,
      polyline: route.overview_polyline?.points,
      waypoint_order: route.waypoint_order || [],
      warnings: route.warnings || [],
      summary: route.summary,
    };
  },
});
