import { httpRouter } from "convex/server";
import { handleClerkWebhook } from "./clerk";
import { ingestRiderLocation } from "./location";
import { handleAgentScan } from "./agentScan";

const http = httpRouter();

// Clerk webhooks
http.route({
  path: "/clerk",
  method: "POST",
  handler: handleClerkWebhook,
});

// Rider location ingest
http.route({
  path: "/rider/location",
  method: "POST",
  handler: ingestRiderLocation,
});

// Agent referral landing page (QR code target)
http.route({
  path: "/agent/scan",
  method: "GET",
  handler: handleAgentScan,
});

export default http;
