import { describe, expect, it } from "vitest";
import { t } from "../src/lib/i18n";
import { drawerButtonHtml, drawerHtml, headerHtml, tokenChipHtml } from "../src/routes/shell";

const STREAK = { current: 3, longest: 9, activeToday: true };

describe("headerHtml server-rendered account", () => {
  it("renders neutral defaults for guests (client hydrates later)", () => {
    const html = headerHtml({ ui: "en", streak: STREAK, path: "/" });
    expect(html).toContain("data-token-chip hidden");
    expect(html).toContain("<b data-token-count>0</b>");
    expect(html).toContain('data-avatar-initial aria-hidden="true">T</span>');
  });

  it("renders the initial and balance on the first paint when known", () => {
    const html = headerHtml({ ui: "en", streak: STREAK, path: "/progress", account: { initial: "M", tokens: 7 } });
    expect(html).not.toContain("data-token-chip hidden");
    expect(html).toContain("<b data-token-count>7</b>");
    expect(html).toContain('data-avatar-initial aria-hidden="true">M</span>');
  });

  it("shows a zero balance instead of hiding the chip", () => {
    const html = headerHtml({ ui: "en", streak: STREAK, path: "/billing", account: { initial: "A", tokens: 0 } });
    expect(html).not.toContain("data-token-chip hidden");
    expect(html).toContain("<b data-token-count>0</b>");
  });

  it("keeps the chip hidden when only the initial is known", () => {
    const html = headerHtml({ ui: "en", streak: STREAK, path: "/cards", account: { initial: "P", tokens: null } });
    expect(html).toContain("data-token-chip hidden");
    expect(html).toContain('data-avatar-initial aria-hidden="true">P</span>');
  });

  it("offers LINE friends below Invite Friends", () => {
    for (const ui of ["en", "th"] as const) {
      const html = drawerHtml(ui);
      const d = t(ui);
      expect(html).toContain('href="https://line.me/R/add/@677zpuat"');
      expect(html).toContain(d.lineFriends);
      expect(html.indexOf("href=\"/invite\"")).toBeLessThan(html.indexOf("line-friends-link"));
      expect(html.indexOf("line-friends-link")).toBeLessThan(html.indexOf("href=\"/cards\""));
    }
  });

  it("escapes the initial", () => {
    expect(drawerButtonHtml("en", "<b>")).not.toContain("<b>");
    expect(drawerButtonHtml("en", "<b>")).toContain("&lt;b&gt;");
    expect(tokenChipHtml("en", 12)).toContain("<b data-token-count>12</b>");
  });
});
