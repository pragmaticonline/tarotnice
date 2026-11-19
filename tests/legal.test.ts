import { describe, expect, it } from "vitest";
import app from "../src/index";
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
