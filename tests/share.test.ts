import { describe, expect, it } from "vitest";
import app from "../src/index";
import { wrapText } from "../src/lib/share-images";
import { shareLandingPage, unsharedPage } from "../src/routes/share";

describe("wrapText", () => {
  it("wraps English by words", () => {
    expect(wrapText("My cards today get your own", 10)).toEqual([
      "My cards",
      "today get",
      "your own",
    ]);
  });

  it("wraps Thai by graphemes without splitting marks", () => {
    const lines = wrapText("สวัสดีชาวโลก", 5);
    expect(lines.join("")).toBe("สวัสดีชาวโลก");
    expect(lines.length).toBeGreaterThan(1);
    // No combining mark (Thai vowel/tone signs) may start a line.
    for (const line of lines) {
      expect(/[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]/.test(line[0] ?? "")).toBe(false);
    }
  });

  it("collapses whitespace and handles empties", () => {
    expect(wrapText("  a   b  ", 10)).toEqual(["a b"]);
    expect(wrapText("", 10)).toEqual([]);
  });
});

describe("share landing pages", () => {
  const cards = [
    { image: "/static/cards/major-06.webp", image2x: "/static/cards/major-06@2x.webp", name: "The Lovers", reversed: false, reversedLabel: "reversed" },
  ];

  it("shows cards + summary, question only when opted in", () => {
    const priv = shareLandingPage({
      kind: "reading", origin: "https://tarotnice.com", shareId: "AbC123XyZ9",
      ui: "en", cards, summary: "Trust the slow build.", question: null,
      ogImage: "https://tarotnice.com/r/AbC123XyZ9/og.png",
    });
    expect(priv).toContain("Trust the slow build.");
    expect(priv).toContain("The Lovers");
    expect(priv).not.toContain("Should we move");
    expect(priv).toContain("noindex");
    expect(priv).toContain("/r/AbC123XyZ9/og.png");
    expect(priv).toContain("/?ref=AbC123XyZ9");
    expect(priv).toContain('og:locale" content="en_US"');

    const shown = shareLandingPage({
      kind: "reading", origin: "https://tarotnice.com", shareId: "AbC123XyZ9",
      ui: "en", cards, summary: "Trust.", question: "Should we move in?",
      ogImage: "https://tarotnice.com/r/AbC123XyZ9/og.png",
    });
    expect(shown).toContain("Should we move in?");
  });

  it("escapes question HTML and never leaks the full reading", () => {
    const html = shareLandingPage({
      kind: "reading", origin: "https://tarotnice.com", shareId: "AbC123XyZ9",
      ui: "th", cards, summary: "ใจเย็นๆ",
      question: "<script>alert(1)</script>",
      ogImage: "https://tarotnice.com/r/AbC123XyZ9/og.png",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('og:locale" content="th_TH"');
  });

  it("unshared page is friendly and points home", () => {
    const html = unsharedPage("https://tarotnice.com", "en");
    expect(html).toContain("share was removed");
    expect(html).toContain('href="/"');
  });
});

describe("share API guards (no session)", () => {
  it("requires auth for share endpoints", async () => {
    expect((await app.request("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(401);
    expect((await app.request("/api/shares", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(401);
    expect((await app.request("/api/share/AbC123XyZ9", { method: "DELETE" })).status).toBe(401);
  });

  it("410s unknown shares, 503s images without bindings", async () => {
    expect((await app.request("/r/AbC123XyZ9")).status).toBe(410);
    expect((await app.request("/d/AbC123XyZ9")).status).toBe(410);
    expect((await app.request("/r/nope")).status).toBe(410);
    expect((await app.request("/r/AbC123XyZ9/og.png")).status).toBe(503);
  });
});
