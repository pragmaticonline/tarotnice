import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { fixThai, wrapText } from "../src/lib/share-images";
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
    const lines = wrapText("\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35\u0e0a\u0e32\u0e27\u0e42\u0e25\u0e01", 5);
    expect(lines.join("")).toBe("\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35\u0e0a\u0e32\u0e27\u0e42\u0e25\u0e01");
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

  it("hard-breaks a long Thai segment between spaces so no line exceeds the limit", () => {
    const seg = new Intl.Segmenter("th", { granularity: "grapheme" });
    const glen = (s: string) => [...seg.segment(s)].length;
    const text = "summary " +
      "\u0e40\u0e14\u0e37\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e04\u0e27\u0e23\u0e40\u0e19\u0e49\u0e19\u0e01\u0e32\u0e23\u0e08\u0e31\u0e14\u0e01\u0e32\u0e23\u0e2a\u0e34\u0e48\u0e07\u0e17\u0e35\u0e48\u0e04\u0e49\u0e32\u0e07\u0e04\u0e32\u0e43\u0e2b\u0e49\u0e2a\u0e21\u0e14\u0e38\u0e25\u0e41\u0e25\u0e30\u0e2b\u0e32\u0e08\u0e31\u0e07\u0e2b\u0e27\u0e30\u0e2b\u0e22\u0e38\u0e14\u0e1e\u0e31\u0e01";
    const lines = wrapText(text, 30);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(glen(line)).toBeLessThanOrEqual(30);
    // No combining mark may start a hard-broken line either.
    for (const line of lines) {
      expect(/[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]/.test(line[0] ?? "")).toBe(false);
    }
  });
});

describe("fixThai (resvg SARA AM advance bug)", () => {
  it("decomposes SARA AM into NIKHAHIT + SARA AA", () => {
    expect(fixThai("\u0e04\u0e33\u0e16\u0e32\u0e21")).toBe("\u0e04\u0e4d\u0e32\u0e16\u0e32\u0e21");
    expect(fixThai("\u0e19\u0e33\u0e40\u0e2a\u0e19\u0e2d")).toBe("\u0e19\u0e4d\u0e32\u0e40\u0e2a\u0e19\u0e2d");
    expect(fixThai("\u0e17\u0e33")).toBe("\u0e17\u0e4d\u0e32");
    expect(fixThai("\u0e01\u0e33\u0e25\u0e31\u0e07")).toBe("\u0e01\u0e4d\u0e32\u0e25\u0e31\u0e07");
  });

  it("keeps a tone mark between NIKHAHIT and SARA AA", () => {
    expect(fixThai("\u0e04\u0e48\u0e33")).toBe("\u0e04\u0e4d\u0e48\u0e32");
    expect(fixThai("\u0e19\u0e49\u0e33")).toBe("\u0e19\u0e4d\u0e49\u0e32");
  });

  it("leaves English and AM-free Thai untouched", () => {
    expect(fixThai("Question kept private")).toBe("Question kept private");
    expect(fixThai("\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35")).toBe("\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35");
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
      ui: "th", cards, summary: "\u0e43\u0e08\u0e40\u0e22\u0e47\u0e19\u0e46",
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

describe("share image language follows the sharer, not the reading", () => {
  it("client sends its UI language and the server prefers it for the frame", () => {
    const client = readFileSync(new URL("../public/app/share.js", import.meta.url), "utf8");
    expect(client).toContain("lang: uiLang()");
    const server = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    expect(server).toContain("bodyLang ?? (row.lang");
    expect(server).toContain("bodyLang ?? (draw.lang");
  });

  it("Thai hidden-question line in share images is the agreed wording", () => {
    const images = readFileSync(new URL("../src/lib/share-images.ts", import.meta.url), "utf8");
    // The hidden-question wording, as \u escapes in source.
    expect(images).toContain("\\u0e04\\u0e33\\u0e16\\u0e32\\u0e21\\u0e16\\u0e39\\u0e01\\u0e0b\\u0e48\\u0e2d\\u0e19\\u0e44\\u0e27\\u0e49");
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
