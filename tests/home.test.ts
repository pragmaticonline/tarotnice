import { describe, expect, it } from "vitest";
import app from "../src/index";
import { homePage } from "../src/routes/home";

describe("GET / (draw screen)", () => {
  it("serves the ask form with quota, Ngern, and header", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    // Ask form: label, 200-char textarea, Shuffle. No topic chips.
    expect(html).toContain("What would you like to ask today?");
    expect(html).toContain('maxlength="200"');
    expect(html).not.toContain('name="topic"');
    expect(html).toContain("Shuffle");
    // Quota row: three pips + remaining text, shimmering from first
    // paint until home.js paints fresh /api/me/summary numbers.
    expect(html).toContain("3 of 3 questions left today");
    expect(html).toContain('class="quota is-loading"');
    expect((html.match(/class="pip on"/g) || []).length).toBe(3);
    // No-JS fallback restores the server text under the shimmer.
    expect(html).toContain(".quota.is-loading [data-quota-label]::after{display:none}");
    // Draw stage: three empty slots + Ngern with the idle hint.
    expect((html.match(/<span class="slot"><\/span>/g) || []).length).toBe(3);
    // Ngern is inlined (animated .eyes/.head/.tail), not an <img>.
    expect(html).toContain('class="ngern"');
    expect(html).toContain('class="eyes"');
    expect(html).toContain('class="tail"');
    expect(html).toContain("Hi, I&#39;m Ngern");
    // Header: Ngern mark, streak hook, Day/Night + TH/EN toggles.
    expect(html).toContain('data-logo="ngern"');
    expect(html).toContain("data-streak");
    expect(html).toContain("data-theme-toggle");
    expect(html).toContain("?ui=th");
    // Footer legal links (no entertainment line).
    expect(html).not.toContain("For reflection and entertainment.");
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/contact"');
    // No billing, no curriculum, no parrot.
    expect(html).not.toContain("/billing");
    expect(html).not.toContain("parrot");
    expect(html).not.toContain("Premium");
  });

  it("renders Thai when asked and sets no horizontal overflow hooks", async () => {
    // ?ui=th itself redirects (tested above); the page reads the cookie.
    const html = await (await app.request("/", { headers: { cookie: "nl_ui=th" } })).text();
    expect(html).toContain("\u0e2d\u0e22\u0e32\u0e01\u0e16\u0e32\u0e21\u0e2d\u0e30\u0e44\u0e23\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49?");
    expect(html).toContain("\u0e2a\u0e31\u0e1a\u0e44\u0e1e\u0e48");
    expect(html).toContain('lang="th"');
  });

  it("?ui= sets the cookie and strips the param", async () => {
    const res = await app.request("/?ui=th");
    expect(res.status).toBe(302);
    expect(res.headers.get("set-cookie")).toContain("nl_ui=th");
    expect(res.headers.get("location")).toBe("/");
  });

  it("defaults Thailand to Thai, others to English", async () => {
    const th = await (await app.request("/", { headers: { "cf-ipcountry": "TH" } })).text();
    expect(th).toContain("\u0e2d\u0e22\u0e32\u0e01\u0e16\u0e32\u0e21\u0e2d\u0e30\u0e44\u0e23\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49?");
    const us = await (await app.request("/", { headers: { "cf-ipcountry": "US" } })).text();
    expect(us).toContain("What would you like to ask today?");
  });

  it("renders the Turnstile widget only with a site key", () => {
    expect(homePage({ uiLang: "en" })).not.toContain("cf-turnstile");
    const withKey = homePage({ uiLang: "en", turnstileSiteKey: "0xTESTKEY" });
    expect(withKey).toContain("cf-turnstile");
    expect(withKey).toContain('data-sitekey="0xTESTKEY"');
    expect(withKey).toContain("challenges.cloudflare.com/turnstile");
  });

  it("homePage() renders both languages directly", () => {
    expect(homePage({ uiLang: "en" })).toContain("What would you like to ask today?");
    expect(homePage({ uiLang: "th" })).toContain("\u0e2d\u0e22\u0e32\u0e01\u0e16\u0e32\u0e21\u0e2d\u0e30\u0e44\u0e23\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49?");
  });
});
