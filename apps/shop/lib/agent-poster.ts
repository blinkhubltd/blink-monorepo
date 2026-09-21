/**
 * The printable referral poster, as HTML for `expo-print`.
 *
 * ── Why the QR points at the Play Store, not the deep link ───────────────
 *
 * A poster is scanned by people who do NOT have the app — that is the whole
 * point of printing one. `referralDeepLink` is a `blink://` URL, which does
 * nothing at all on a phone without Blink installed, so the poster in the
 * app this replaces was scannable by precisely the audience that did not
 * need it. This encodes the Play Store link with the agent's referrer
 * attached, which installs the app AND credits the install.
 *
 * ── The code is printed as text as well, and that is not redundant ───────
 *
 * There is no install-referrer API on iOS, so an iPhone scan cannot credit
 * anything automatically. Printing the code lets that customer type it into
 * Settings -> Referral code after installing, which is the one path that
 * credits a registration on either platform.
 *
 * Kept as a pure string builder, separate from the screen, so the escaping
 * below is testable: an agent's name is user data and goes into markup.
 */

/**
 * Minimal HTML escaping for the three characters that can break out of the
 * text nodes this interpolates into.
 *
 * An agent's display name comes from Clerk and is not trusted markup. The
 * old poster interpolated it raw, so a name containing `<` produced a
 * corrupt PDF at best.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function referralPosterHtml(input: {
  /** A `data:image/png;base64,...` URI produced by the QR component. */
  qrDataUrl: string;
  agentCode: string;
  /** Blank when the agent has no name set; the block is then omitted. */
  agentName?: string;
}): string {
  const name = (input.agentName ?? "").trim();

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #ffffff;
        color: #0A0E16;
      }
      .sheet {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 48px 40px;
      }
      .wordmark {
        font-size: 56px;
        font-weight: 800;
        letter-spacing: -1.5px;
        color: #0A0E16;
      }
      .rule {
        width: 64px;
        height: 6px;
        border-radius: 999px;
        background: #FFC50B;
        margin: 14px auto 28px;
      }
      .headline { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
      .sub { font-size: 15px; color: #5A6372; margin-bottom: 32px; }
      .qr-frame {
        background: #FFFAE8;
        border: 3px solid #FFC50B;
        border-radius: 24px;
        padding: 28px;
        display: inline-block;
      }
      .qr-frame img { width: 260px; height: 260px; display: block; }
      .code-label {
        margin-top: 34px;
        font-size: 12px;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: #818A99;
      }
      .code {
        margin-top: 6px;
        font-size: 34px;
        font-weight: 800;
        letter-spacing: 2px;
        font-family: 'Courier New', monospace;
      }
      .agent { margin-top: 10px; font-size: 16px; color: #5A6372; }
      .steps {
        margin-top: 36px;
        font-size: 13px;
        line-height: 1.7;
        color: #5A6372;
        max-width: 380px;
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="wordmark">Blink</div>
      <div class="rule"></div>

      <div class="headline">Groceries in 10 minutes</div>
      <div class="sub">Scan to install the app</div>

      <div class="qr-frame">
        <img src="${input.qrDataUrl}" alt="Scan to install Blink" />
      </div>

      <div class="code-label">Referral code</div>
      <div class="code">${escapeHtml(input.agentCode)}</div>
      ${name ? `<div class="agent">Referred by ${escapeHtml(name)}</div>` : ""}

      <div class="steps">
        Scanning installs the app and credits this code automatically on
        Android. On iPhone, install Blink and enter the code above under
        Profile &rarr; Settings &rarr; Referral code.
      </div>
    </div>
  </body>
</html>`;
}
