import { describe, expect, it } from "vitest";
import app from "../src/index";
import { homePage } from "../src/routes/home";

describe("GET / (draw screen)", () => {
  it("serves the ask form with quota, Ngern, and header", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    // Ask form: label, 300-char textarea with board counter, Shuffle.
    expect(html).toContain("What would you like to ask today?");
    // The label carries an id so follow-ups can retitle it to
    // "This is a follow-up on ...".
    expect(html).toContain('id="ask-label"');
    // Fresh-question escape hatch under the follow-up label.
    expect(html).toContain('id="fresh-ask-link"');
    expect(html).toContain("Ask a different question instead?");
    expect(html).toContain('maxlength="300"');
    expect(html).toContain('id="q-count"');
    expect(html).toContain('data-suggest');
    expect(html).not.toContain('name="topic"');
    expect(html).toContain("Shuffle");
    // Quota row: loading line (never a wrong count) until home.js
    // paints fresh /api/me/summary numbers.
    expect(html).toContain("One moment please");
    expect(html).toContain('class="wdots"');
    expect(html).not.toContain("pip");
    // Draw stage: three empty slots + Ngern with the idle hint.
    expect((html.match(/<span class="slot"><\/span>/g) || []).length).toBe(3);
    // Ngern is inlined (animated .eyes/.head/.tail), not an <img>.
    expect(html).toContain('class="ngern"');
    expect(html).toContain('class="eyes"');
    expect(html).toContain('class="tail"');
    expect(html).toContain("Hi, I&#39;m Ngern");
    // Header: Ngern mark, streak hook, Day/Night + TH/EN toggles.
    expect(html).toContain('data-logo="ngern"');
    // No streak chip in the header anymore (streak lives in the drawer).
    expect(html).not.toContain("data-streak");
    // Design boards: language and theme live only in the drawer, never
    // in the header or footer.
    expect(html).toContain("data-drawer-lang");
    expect(html).toContain("data-theme-choice");
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(header).not.toContain("data-theme-toggle");
    expect(header).not.toContain("ui=th");
    const footer = html.slice(html.indexOf("<footer"), html.indexOf("</footer>"));
    expect(footer).not.toContain("data-theme-toggle");
    expect(footer).not.toContain("ui=th");
    expect(footer).not.toContain("foot-opts");
    // Account drawer (design update): header menu button opens it;
    // profile, tokens/streak, menu, preferences, settings sub-view.
    expect(html).toContain("data-drawer-open");
    expect(html).toContain("data-drawer");
    expect(html).toContain("data-drawer-tokens");
    expect(html).toContain("data-drawer-settings");
    expect(html).not.toContain("data-auth-link");
    // Token amount chip at the top of the screen (count filled client-side).
    expect(html).toContain("data-token-chip");
    // Gem click: signed-in -> /billing, guest -> sign-in then billing.
    expect(html).toContain("/sign-in?return=%2Fbilling");
    expect(html).toContain("data-token-count");
    // Tokens are shown with a moonstone next to the number.
    expect(html).toContain('class="moonstone"');
    // Header chip is just the moonstone and the count (no unit word).
    expect(html).not.toContain("data-token-unit");
    expect(html).toContain("data-quota-gem");
    expect(html).toContain('href="/sign-in"');
    // Footer legal links (no entertainment line).
    expect(html).not.toContain("For reflection and entertainment.");
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/contact"');
    // Drawer links the wallet (billing) by design; no curriculum/parrot.
    expect(html).toContain('href="/billing"');
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

  it("shuffle button sits above the suggested questions", () => {
    const html = homePage({ origin: "https://tarotnice.com", uiLang: "en" });
    const shuffleAt = html.indexOf('type="submit"');
    const chipsAt = html.indexOf("suggest-chips");
    expect(shuffleAt).toBeGreaterThanOrEqual(0);
    expect(chipsAt).toBeGreaterThanOrEqual(0);
    expect(shuffleAt).toBeLessThan(chipsAt);
  });

  it("shuffle button shows the 5-token cost with the gem, not an arrow", () => {
    const en = homePage({ uiLang: "en" });
    expect(en).toContain("Shuffle the cards");
    expect(en).toContain('class="shuffle-cost"');
    expect(en).toContain('class="moonstone"');
    expect(en).toContain('class="shuffle-price">5 tokens</span>');
    expect(en).toContain("5 tokens");
    expect(en).not.toContain("\u2192</button>");
    const th = homePage({ uiLang: "th" });
    expect(th).toContain("5 \u0e42\u0e17\u0e40\u0e04\u0e19");
  });

  it("uses tokens wording, not credits", () => {
    const en = homePage({ uiLang: "en" });
    expect(en).toContain(">Tokens</small>");
    expect(en).not.toContain("Credits");
    expect(en).not.toContain("free credit");
    const th = homePage({ uiLang: "th" });
    expect(th).not.toContain("\u0e40\u0e04\u0e23\u0e14\u0e34\u0e15");
  });

  it("homePage() renders both languages directly", () => {
    expect(homePage({ uiLang: "en" })).toContain("What would you like to ask today?");
    expect(homePage({ uiLang: "th" })).toContain("\u0e2d\u0e22\u0e32\u0e01\u0e16\u0e32\u0e21\u0e2d\u0e30\u0e44\u0e23\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49?");
  });

  it("has no standalone follow-up input box (Follow up button covers it)", () => {
    for (const ui of ["en", "th"] as const) {
      const html = homePage({ uiLang: ui });
      expect(html).not.toContain("followup-box");
      expect(html).not.toContain('id="followup-q"');
      expect(html).not.toContain('id="followup-ask"');
    }
  });
});
