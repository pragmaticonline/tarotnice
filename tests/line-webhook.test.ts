import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
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

  it("renders the welcome text with the code in both languages", () => {
    expect(lineWelcomeText("LINE-ABC123", "en")).toContain("LINE-ABC123");
    expect(lineWelcomeText("LINE-ABC123", "th")).toContain("LINE-ABC123");
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
