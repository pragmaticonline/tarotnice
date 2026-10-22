import { describe, expect, it } from "vitest";
import app from "../src/index";
import { contactPage, privacyPage, termsPage } from "../src/routes/legal";

describe("GET /terms, /privacy, /contact", () => {
  it("serves all three pages with content", async () => {
    for (const [path, heading] of [
      ["/terms", "Terms"],
      ["/privacy", "Privacy"],
      ["/contact", "Contact"],
    ]) {
      const res = await app.request(path);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain(`<h1>${heading}</h1>`);
      expect(html).toContain("TarotNice");
    }
  });

  it("has no refunds page (nothing to refund)", async () => {
    expect((await app.request("/refunds")).status).toBe(404);
  });

  it("privacy states questions are stored and how to delete them", async () => {
    const html = await (await app.request("/privacy")).text();
    expect(html).toContain("delete");
    expect(html).toContain("/account");
  });

  it("renders Thai legal pages", () => {
    expect(termsPage("th")).toContain("\u0e44\u0e1e\u0e48\u0e17\u0e32\u0e42\u0e23\u0e15\u0e4c");
    expect(privacyPage("th")).toContain("\u0e25\u0e1a\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25");
    expect(contactPage("th")).toContain("support@tarotnice.com");
  });
});
