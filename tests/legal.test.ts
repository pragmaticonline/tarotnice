import { describe, expect, it } from "vitest";
import app from "../src/index";
import { billingPage } from "../src/routes/billing";
import { contactPage, privacyPage, termsPage } from "../src/routes/legal";

describe("GET /terms, /privacy, /contact", () => {
  it("serves all three pages with content", async () => {
    for (const [path, heading] of [
      ["/terms", "Terms"],
      ["/privacy", "Privacy"],
      ["/contact", "Help &amp; contact"],
    ]) {
      const res = await app.request(path);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain(heading);
      expect(html).toContain("TarotNice");
    }
    const contact = await (await app.request("/contact")).text();
    expect(contact).toContain("Common questions");
    expect(contact).toContain("How does a reading work?");
    expect(contact).toContain("contact-card");
    expect(contact.match(/<details class="faq"/g)).toHaveLength(6);
  });

  it("has no refunds page (nothing to refund)", async () => {
    expect((await app.request("/refunds")).status).toBe(404);
  });

  it("privacy states questions are stored and how to delete them", async () => {
    const html = await (await app.request("/privacy")).text();
    expect(html).toContain("delete");
    expect(html).toContain("/account");
  });

  it("names the operator, age rule, and contact mailboxes", async () => {
    const thHeaders = { headers: { cookie: "nl_ui=th" } };
    for (const init of [undefined, thHeaders]) {
      const terms = await (await app.request("/terms", init)).text();
      expect(terms).toContain("Pragmatic Online Co., Ltd.");
      expect(terms).toContain("Prego Mall");
      expect(terms).toContain("13");
      expect(terms).toContain("20");
      expect(terms).toContain("legal@tarotnice.com");
      const privacy = await (await app.request("/privacy", init)).text();
      expect(privacy).toContain("Pragmatic Online Co., Ltd.");
      expect(privacy).toContain("privacy@tarotnice.com");
      expect(privacy).toContain("security@tarotnice.com");
      const contact = await (await app.request("/contact", init)).text();
      for (const email of [
        "support@tarotnice.com",
        "legal@tarotnice.com",
        "privacy@tarotnice.com",
        "security@tarotnice.com",
        "affiliates@tarotnice.com",
      ]) {
        expect(contact).toContain(email);
      }
    }
    expect(await (await app.request("/privacy")).text()).toContain("opt in");
    expect(await (await app.request("/privacy", thHeaders)).text()).toContain(
      "\u0e2d\u0e35\u0e40\u0e21\u0e25\u0e02\u0e48\u0e32\u0e27\u0e2a\u0e32\u0e23",
    );
  });

  it("states an effective date on Terms and Privacy", async () => {
    expect(await (await app.request("/terms")).text()).toContain("19 November 2026");
    expect(await (await app.request("/privacy")).text()).toContain("19 November 2026");
    expect(termsPage("th")).toContain("19 \u0e1e\u0e24\u0e28\u0e08\u0e34\u0e01\u0e32\u0e22\u0e19 2026");
    expect(privacyPage("th")).toContain("19 \u0e1e\u0e24\u0e28\u0e08\u0e34\u0e01\u0e32\u0e22\u0e19 2026");
  });

  it("renders Thai legal pages", () => {
    expect(termsPage("th")).toContain("\u0e44\u0e1e\u0e48\u0e17\u0e32\u0e42\u0e23\u0e15\u0e4c");
    expect(privacyPage("th")).toContain("\u0e25\u0e1a\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25");
    expect(contactPage("th")).toContain("support@tarotnice.com");
    expect(contactPage("th")).toContain("affiliates@tarotnice.com");
    expect(termsPage("th")).toContain("legal@tarotnice.com");
    expect(privacyPage("th")).toContain("privacy@tarotnice.com");
  });
});

describe("GET /policies, /cookies, /security", () => {
  it("serves all three pages with nav tabs and contact paths", async () => {
    for (const path of ["/policies", "/cookies", "/security"]) {
      const res = await app.request(path);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("TarotNice");
      for (const tab of ["/terms", "/privacy", "/cookies", "/security", "/policies"]) {
        expect(html).toContain(`href="${tab}"`);
      }
    }
    const cookies = await (await app.request("/cookies")).text();
    expect(cookies).toContain("tarotnice_ref");
    expect(cookies).toContain("nl_ui");
    expect(cookies).toContain("Stripe");
    const security = await (await app.request("/security")).text();
    expect(security).toContain("scrypt");
    expect(security).toContain("security@tarotnice.com");
    expect(security).not.toMatch(/credit card/i);
    const policies = await (await app.request("/policies")).text();
    expect(policies).toContain("/terms");
    const th = { headers: { cookie: "nl_ui=th" } };
    const thCookies = await (await app.request("/cookies", th)).text();
    expect(thCookies).toContain("tarotnice_ref");
  });

  it("footer links every policy page", async () => {
    const html = await (await app.request("/")).text();
    for (const path of ["/terms", "/privacy", "/cookies", "/security", "/policies", "/contact"]) {
      expect(html).toContain(`href="${path}"`);
    }
    expect(html).not.toContain("foot-pay");
    expect(html).not.toContain("/pay-visa.svg");
  });

  it("home head carries the exact meta title and descriptions", async () => {
    const html = await (await app.request("/")).text();
    expect(html).toContain("<title>TarotNice \u00b7 \u0e14\u0e39\u0e14\u0e27\u0e07\u0e44\u0e1e\u0e48\u0e17\u0e32\u0e42\u0e23\u0e15\u0e4c \u0e40\u0e25\u0e37\u0e2d\u0e01\u0e44\u0e1e\u0e48 3 \u0e43\u0e1a\u0e40\u0e2d\u0e07 \u0e16\u0e32\u0e21\u0e44\u0e14\u0e49\u0e17\u0e38\u0e01\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07</title>");
    expect(html).toContain("Online tarot readings. Pick 3 cards yourself and ask about anything. Sign up today for 10 free tokens.");
    const th = await (await app.request("/", { headers: { cookie: "nl_ui=th" } })).text();
    expect(th).toContain("\u0e14\u0e39\u0e14\u0e27\u0e07\u0e44\u0e1e\u0e48\u0e17\u0e32\u0e42\u0e23\u0e15\u0e4c\u0e2d\u0e2d\u0e19\u0e44\u0e25\u0e19\u0e4c \u0e40\u0e25\u0e37\u0e2d\u0e01\u0e44\u0e1e\u0e48 3 \u0e43\u0e1a\u0e14\u0e49\u0e27\u0e22\u0e15\u0e31\u0e27\u0e40\u0e2d\u0e07");
  });

  it("billing shows the Stripe line with official brand marks when packs are on", async () => {
    const stripeEnv = {
      STRIPE_SECRET_KEY: "sk_test_x",
      STRIPE_PACK_STARTER_PRICE_ID: "price_starter",
      STRIPE_PACK_STANDARD_PRICE_ID: "price_standard",
      STRIPE_PACK_PREMIUM_PRICE_ID: "price_premium",
    } as never;
    for (const ui of ["en", "th"] as const) {
      const html = billingPage({ ui, origin: "", env: stripeEnv, balance: 10, freeLeft: 5 });
      expect(html).toContain("/pay-visa.svg");
      expect(html).toContain("/pay-mastercard.svg");
      expect(html).toContain("/pay-promptpay.png");
    }
    expect(billingPage({ ui: "en", origin: "", env: stripeEnv, balance: 0, freeLeft: 0 })).toContain("Secure payments by Stripe");
  });

  it("sitemap lists the public policy pages", async () => {
    const xml = await (await app.request("/sitemap.xml")).text();
    for (const path of ["/terms", "/privacy", "/contact", "/policies", "/cookies", "/security"]) {
      expect(xml).toContain(path);
    }
  });
});
