import { httpAction } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";

// POST /rider/location
// Headers: x-api-key: <server-ingest-key>
// Body: { points: [{ lat, lng, ts, accuracy?, speed?, heading? }] }
export const ingestRiderLocation = httpAction(async (ctx, request) => {
  const serverKey = process.env.LOCATION_INGEST_API_KEY;
  if (!serverKey) {
    return new Response("Missing server LOCATION_INGEST_API_KEY", {
      status: 500,
    });
  }
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || apiKey !== serverKey) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const auth = await ctx.auth.getUserIdentity();
  const clerkId = auth?.subject || body?.clerkId;
  const riderId = body?.riderId; // optional direct id

  if (!clerkId && !riderId) {
    return new Response("Missing rider identity", { status: 400 });
  }

  const points = Array.isArray(body?.points) ? body.points : [];
  if (!points.length) {
    return new Response("No points provided", { status: 400 });
  }

  // For now, take the latest point as current position; later: store history if needed
  const latest = points.reduce((a: any, b: any) => (a.ts > b.ts ? a : b));

  try {
    // Resolve rider document id
    let riderDocId = riderId;
    if (!riderDocId && clerkId) {
      const user = await ctx.runQuery(api.user.users.getCurrentUser, { clerkId });
      riderDocId = user?._id;
    }

    if (!riderDocId) {
      return new Response("Rider not found", { status: 404 });
    }

    await ctx.runMutation(api.data.riders.updateRiderLocation, {
      riderId: riderDocId,
      lat: latest.lat,
      lng: latest.lng,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("ingestRiderLocation error", e);
    return new Response("Server error", { status: 500 });
  }
});
