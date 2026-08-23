import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.blink.app";
const APP_STORE_URL = "https://apps.apple.com/app/blink/id6740044279";

/**
 * GET /http/agent/scan?code=AGENT_001
 *
 * Standalone HTML landing page served by Convex.
 * 1. Increments the agent's scan count server-side.
 * 2. Detects the visitor's platform from User-Agent.
 * 3. Auto-redirects to the correct app store after a short delay.
 * 4. Shows Play Store / App Store buttons as a fallback.
 */
export const handleAgentScan = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const agentCode = url.searchParams.get("code");

  if (!agentCode) {
    return new Response(errorPage("Missing referral code."), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  // Increment scan count (non-blocking error – still show page)
  try {
    await ctx.runMutation(api.marketing.incrementScanCount, { agentCode });
  } catch (e) {
    console.warn("Failed to increment scan count:", e);
  }

  // Detect platform from User-Agent header
  const ua = (request.headers.get("user-agent") || "").toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);

  const html = landingPage({ agentCode, isIOS, isAndroid });
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
});

// ── HTML builders ────────────────────────────────────────────────────

function landingPage({
  agentCode,
  isIOS,
  isAndroid,
}: {
  agentCode: string;
  isIOS: boolean;
  isAndroid: boolean;
}): string {
  // Decide auto-redirect target (empty string = no redirect)
  const autoRedirectUrl = isIOS
    ? APP_STORE_URL
    : isAndroid
      ? PLAY_STORE_URL
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Download Blink</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: #ffffff;
      color: #111827;
      padding: 24px;
    }
    .container { text-align: center; max-width: 420px; width: 100%; }
    .logo {
      font-size: 48px; font-weight: 800; letter-spacing: -1px;
      margin-bottom: 4px;
    }
    .tagline { font-size: 16px; color: #6B7280; margin-bottom: 32px; }
    .redirect-msg {
      font-size: 15px; color: #6B7280; margin-bottom: 24px;
    }
    .spinner {
      width: 32px; height: 32px;
      border: 4px solid #FDE68A; border-top-color: #D97706;
      border-radius: 50%; margin: 0 auto 28px;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .buttons { display: flex; flex-direction: column; gap: 14px; margin-bottom: 28px; }
    .btn {
      display: flex; align-items: center; justify-content: center;
      gap: 12px; padding: 16px 24px; border-radius: 14px;
      text-decoration: none; color: #fff; background: #000;
      transition: transform 0.15s;
    }
    .btn:active { transform: scale(0.97); }
    .btn-label-small { font-size: 11px; color: #D1D5DB; }
    .btn-label-large { font-size: 17px; font-weight: 700; }
    .btn-icon { font-size: 24px; }
    .ref-badge {
      background: #FEF9C3; border-radius: 12px; padding: 10px 16px;
      font-size: 13px; color: #92400E;
    }
    .ref-badge strong { color: #78350F; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">Blink</div>
    <div class="tagline">Your everyday delivery app</div>

    ${autoRedirectUrl ? `
    <div class="spinner"></div>
    <p class="redirect-msg">Redirecting you to the store…</p>
    ` : ""}

    <div class="buttons">
      <a href="${PLAY_STORE_URL}" class="btn">
        <span class="btn-icon">▶</span>
        <span>
          <span class="btn-label-small">GET IT ON</span><br/>
          <span class="btn-label-large">Google Play</span>
        </span>
      </a>
      <a href="${APP_STORE_URL}" class="btn">
        <span class="btn-icon">&#63743;</span>
        <span>
          <span class="btn-label-small">Download on the</span><br/>
          <span class="btn-label-large">App Store</span>
        </span>
      </a>
    </div>

    <div class="ref-badge">
      Referred by agent <strong>${escapeHtml(agentCode)}</strong>
    </div>
  </div>

  <script>
    // Store agentCode so it can survive across the install flow on web/PWA contexts
    try { localStorage.setItem('agentCode', '${escapeJs(agentCode)}'); } catch(e) {}

    ${autoRedirectUrl ? `
    // Auto-redirect after a short delay so the user sees the page
    setTimeout(function() {
      window.location.href = '${autoRedirectUrl}';
    }, 1500);
    ` : ""}
  </script>
</body>
</html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Blink</title>
  <style>
    body {
      font-family: -apple-system, sans-serif; display: flex;
      justify-content: center; align-items: center; min-height: 100vh;
      background: #fff; color: #111;
    }
    .msg { text-align: center; }
    h1 { font-size: 36px; margin-bottom: 8px; }
    p { color: #EF4444; font-size: 16px; }
  </style>
</head>
<body>
  <div class="msg">
    <h1>Blink</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
}

// ── Helpers ──────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeJs(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
