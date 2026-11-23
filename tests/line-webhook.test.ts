import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { billingPage } from "../src/routes/billing";
import { t } from "../src/lib/i18n";
import { lineMsgConfigured, lineWelcomeText, newLineWelcomeCode, verifyLineSignature } from "../src/lib/line";
import { LINE_WELCOME_BONUS_TOKENS, TOKENS_PER_QUESTION } from "../src/lib/wallet";

async function signBody(secret: string, raw: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(raw));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

describe("LINE Messaging client", () => {
  it("stays unconfigured without a token", () => {
    expect(lineMsgConfigured({})).toBe(false);
    expect(lineMsgConfigured({ LINE_MSG_ACCESS_TOKEN: "t" })).toBe(true);
  });

  it("verifies X-Line-Signature against the MSG channel secret", async () => {
    const raw = JSON.stringify({ events: [] });
    const sig = await signBody("msg-secret", raw);
    expect(await verifyLineSignature({ LINE_MSG_CHANNEL_SECRET: "msg-secret" }, raw, sig)).toBe(true);
    expect(await verifyLineSignature({ LINE_MSG_CHANNEL_SECRET: "wrong" }, raw, sig)).toBe(false);
    expect(await verifyLineSignature({}, raw, sig)).toBe(false);
    expect(await verifyLineSignature({ LINE_MSG_CHANNEL_SECRET: "msg-secret" }, raw, undefined)).toBe(false);
    // A tampered body must not verify.
    expect(await verifyLineSignature({ LINE_MSG_CHANNEL_SECRET: "msg-secret" }, raw + " ", sig)).toBe(false);
  });

  it("generates one-time welcome codes in the LINE-XXXXXX shape", () => {
    const codes = new Set(Array.from({ length: 20 }, () => newLineWelcomeCode()));
    expect(codes.size).toBe(20);
    for (const c of codes) expect(c).toMatch(/^LINE-[A-Z2-9]{6}$/);
  });

  it("renders the bilingual welcome text with code, link and token count", () => {
    const msg = lineWelcomeText("LINE-ABC123");
    // Code appears twice (TH block + EN block), link carries ?code=.
    expect(msg.split("LINE-ABC123").length - 1).toBe(4);
    expect(msg).toContain("https://tarotnice.com/billing?code=LINE-ABC123");
    expect(msg).toContain(String(LINE_WELCOME_BONUS_TOKENS));
    expect(msg).toContain("Ngern");
    // Thai wording uses the right spelling for tokens.
    expect(msg).toContain("\u0e42\u0e17\u0e40\u0e04\u0e19");
    expect(msg).not.toContain("\u0e42\u0e17\u0e40\u0e04\u0e47\u0e19");
  });

  it("LINE friend gifts show their own ledger label", () => {
    const billing = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/app/billing.js"),
      "utf8",
    );
    expect(billing).toContain("/^promo:LINE-/");
    expect(billing).toContain("txLineGift");
    expect(billing).toContain("LINE friend gift");
    expect(billing).toContain("location.search");
  });

  it("redeem box pre-fills ?code= and /billing keeps it through sign-in", async () => {
    const billing = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/app/billing.js"),
      "utf8",
    );
    expect(billing).toContain("redeem-code");
    // Guests bounce to sign-in with the code preserved for after login.
    const res = await app.request("/billing?code=LINE-ABC123");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/sign-in?return=%2Fbilling%3Fcode%3DLINE-ABC123");
    const junk = await app.request("/billing?code=<evil>");
    expect(junk.headers.get("location")).toBe("/sign-in?return=%2Fbilling");
  });

  it("redeem box invites LINE adds with the live bonus amount", () => {
    expect(t("en").lineRedeemCta).toContain("{n}");
    expect(t("th").lineRedeemCta).toContain("{n}");
    const en = billingPage({ ui: "en", origin: "", env: {} as never, balance: 0, freeLeft: 0 });
    expect(en).toContain("get 5 free tokens right away");
    expect(en).toContain("Add friend on LINE");
    expect(en).toContain("https://line.me/R/ti/p/@677zpuat");
    expect(en).toContain('class="btn line-add-btn"');
    expect(en).toContain("M20 3c-9.4");
    const th = billingPage({ ui: "th", origin: "", env: {} as never, balance: 0, freeLeft: 0 });
    expect(th).toContain("\u0e23\u0e31\u0e1a\u0e1f\u0e23\u0e35\u0e17\u0e31\u0e19\u0e17\u0e35 5 \u0e42\u0e17\u0e40\u0e04\u0e19");
    expect(th).toContain("line-add-btn");
  });

  it("LINE friend gifts read distinctly in the ledger", () => {
    expect(t("en").txLineGift).toBe("LINE friend gift");
    expect(t("th").txLineGift.length).toBeGreaterThan(0);
  });

  it("welcome code grants exactly one free question, once", () => {
    expect(LINE_WELCOME_BONUS_TOKENS).toBe(TOKENS_PER_QUESTION);
    // The follow handler must register the code as a one-use promo,
    // otherwise /api/me/redeem (redeem_codes lookup) can never find it.
    const src = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/index.ts"),
      "utf8",
    );
    expect(src).toContain("schema.redeemCodes");
    expect(src).toContain("LINE_WELCOME_BONUS_TOKENS");
    expect(src).toContain("maxUses: 1");
  });

  it("never sends without a token", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { pushLineText, replyLineText } = await import("../src/lib/line");
    await pushLineText({}, "U123", "hello");
    await replyLineText({}, "tok", "hello");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
