import { describe, expect, it } from "vitest";
import app from "../src/index";
import { checkoutReturnUrls, safeReturnPath } from "../src/routes/billing";

describe("safeReturnPath", () => {
  it("keeps same-origin paths and rejects open redirects", () => {
    expect(safeReturnPath("/billing")).toBe("/billing");
    expect(safeReturnPath("/history?x=1")).toBe("/history?x=1");
    expect(safeReturnPath("https://evil.example/phish")).toBe("/");
    expect(safeReturnPath("//evil.example/phish")).toBe("/");
    expect(safeReturnPath("/\\evil.example")).toBe("/");
    expect(safeReturnPath(undefined)).toBe("/");
    expect(safeReturnPath(null)).toBe("/");
  });
});

describe("checkoutReturnUrls", () => {
  it("carries the session id placeholder and the sanitized return target", () => {
    const urls = checkoutReturnUrls("https://tarotnice.com", "/history");
    expect(urls.successUrl).toBe(
      "https://tarotnice.com/billing/success?session_id={CHECKOUT_SESSION_ID}&return=%2Fhistory",
    );
    expect(urls.cancelUrl).toBe("https://tarotnice.com/billing/cancel?return=%2Fhistory");
  });

  it("falls back to home for a hostile return target", () => {
    const urls = checkoutReturnUrls("https://tarotnice.com", "https://evil.example");
    expect(urls.successUrl).toContain("return=%2F");
  });
});

describe("billing endpoints (gates)", () => {
  it("requires a session for checkout", async () => {
    const res = await app.request("/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pack: "starter" }),
    }, {});
    expect(res.status).toBe(401);
  });

  it("rejects webhooks with bad signatures before touching the DB", async () => {
    const res = await app.request("/api/billing/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=bad" },
      body: JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_test_1" } } }),
    }, {});
    expect(res.status).toBe(401);
  });
});
