import { describe, expect, it } from "vitest";

import { escapeHtml, referralPosterHtml } from "../lib/agent-poster";

const QR = "data:image/png;base64,AAAA";

describe("escapeHtml", () => {
  it("neutralises the characters that can break out of a text node", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(\"x\")&lt;/script&gt;",
    );
  });

  it("escapes ampersands first, so an entity is not double-encoded wrongly", () => {
    // "&lt;" must come out as "&amp;lt;" — escaping `<` before `&` would
    // produce "&lt;" from the ampersand's own replacement and corrupt it.
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("leaves ordinary names alone", () => {
    expect(escapeHtml("Charles Nderitu")).toBe("Charles Nderitu");
  });
});

describe("referralPosterHtml", () => {
  it("embeds the QR image and the code", () => {
    const html = referralPosterHtml({ qrDataUrl: QR, agentCode: "BLK-1234" });
    expect(html).toContain(`src="${QR}"`);
    expect(html).toContain("BLK-1234");
  });

  it("names the agent when there is a name", () => {
    const html = referralPosterHtml({
      qrDataUrl: QR,
      agentCode: "BLK-1234",
      agentName: "Charles Nderitu",
    });
    expect(html).toContain("Referred by Charles Nderitu");
  });

  it("omits the referred-by line rather than printing a dangling label", () => {
    const blank = referralPosterHtml({
      qrDataUrl: QR,
      agentCode: "BLK-1234",
      agentName: "   ",
    });
    expect(blank).not.toContain("Referred by");

    const absent = referralPosterHtml({ qrDataUrl: QR, agentCode: "BLK-1234" });
    expect(absent).not.toContain("Referred by");
  });

  it("escapes the agent name, which is user data going into markup", () => {
    const html = referralPosterHtml({
      qrDataUrl: QR,
      agentCode: "BLK-1234",
      agentName: "<b>Mal</b>",
    });
    expect(html).not.toContain("<b>Mal</b>");
    expect(html).toContain("&lt;b&gt;Mal&lt;/b&gt;");
  });

  it("escapes the code too — it is admin-entered, not generated", () => {
    const html = referralPosterHtml({
      qrDataUrl: QR,
      agentCode: "A<B",
    });
    expect(html).toContain("A&lt;B");
  });

  it("tells an iPhone reader how to credit the code manually", () => {
    // There is no install-referrer API on iOS, so a scan there cannot
    // credit anything. The poster has to say what to do instead.
    const html = referralPosterHtml({ qrDataUrl: QR, agentCode: "BLK-1234" });
    expect(html).toContain("iPhone");
  });
});
