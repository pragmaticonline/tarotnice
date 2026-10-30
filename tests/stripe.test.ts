import { describe, expect, it, vi } from "vitest";
import {
  PACKS,
  createPackCheckoutSession,
  isPackId,
  packPriceId,
  tokensConfigured,
  verifyStripeSignature,
} from "../src/lib/stripe";

const ENV = {
  STRIPE_SECRET_KEY: "[SECURITY_DATA]",
  STRIPE_WEBHOOK_SECRET: "[SECURITY_DATA]",
  STRIPE_PACK_STARTER_PRICE_ID: "price_starter",
  STRIPE_PACK_STANDARD_PRICE_ID: "price_standard",
  STRIPE_PACK_PREMIUM_PRICE_ID: "price_premium",
};

describe("pack catalogue", () => {
  it("carries the spec prices (token counts are display; Stripe Prices charge)", () => {
    expect(PACKS.starter).toMatchObject({ tokens: 50, thb: 59, promptPayOnly: true });
    expect(PACKS.standard).toMatchObject({ tokens: 200, thb: 199, promptPayOnly: false });
    expect(PACKS.premium).toMatchObject({ tokens: 500, thb: 399, promptPayOnly: false });
    expect(isPackId("starter")).toBe(true);
    expect(isPackId("monthly")).toBe(false);
  });

  it("maps packs to price ids and reports configuration honestly", () => {
    expect(packPriceId(ENV, "standard")).toBe("price_standard");
    expect(tokensConfigured(ENV)).toBe(true);
    expect(tokensConfigured({})).toBe(false);
    expect(tokensConfigured({ STRIPE_SECRET_KEY: "sk_test_x" })).toBe(false);
    expect(tokensConfigured({ STRIPE_PACK_STARTER_PRICE_ID: "price_starter" })).toBe(false);
  });
});

describe("createPackCheckoutSession", () => {
  function stubFetch() {
    const calls: { url: string; body: URLSearchParams; headers: Record<string, string> }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: { body: URLSearchParams; headers: Record<string, string> }) => {
      calls.push({ url, body: init.body, headers: init.headers });
      return { ok: true, status: 200, json: async () => ({ id: "cs_test_123", url: "https://checkout.stripe.com/x" }) };
    });
    return calls;
  }

  it("builds a PromptPay-only payment session for the starter pack", async () => {
    const calls = stubFetch();
    const session = await createPackCheckoutSession(ENV, {
      userId: "u1",
      email: "a@example.com",
      successUrl: "https://tarotnice.com/billing/success?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://tarotnice.com/billing/cancel",
      priceId: "price_starter",
      pack: PACKS.starter,
    });
    expect(session.url).toContain("checkout.stripe.com");
    const body = calls[0].body;
    expect(body.get("mode")).toBe("payment");
    expect(body.get("payment_method_types[0]")).toBe("promptpay");
    expect(body.get("line_items[0][price]")).toBe("price_starter");
    expect(body.get("client_reference_id")).toBe("u1");
    expect(body.get("customer_creation")).toBe("always");
    expect(body.get("metadata[kind]")).toBe("token_pack");
    expect(body.get("metadata[tokens]")).toBe("50");
    expect(body.get("metadata[pack]")).toBe("starter");
    expect(calls[0].headers["Idempotency-Key"]).toBe("tarotnice-pack-u1-price_starter");
  });

  it("leaves payment methods dynamic for card packs and reuses a customer", async () => {
    const calls = stubFetch();
    await createPackCheckoutSession(ENV, {
      userId: "u1",
      email: "a@example.com",
      successUrl: "https://tarotnice.com/billing/success",
      cancelUrl: "https://tarotnice.com/billing/cancel",
      priceId: "price_premium",
      pack: PACKS.premium,
      customerId: "cus_123",
    });
    const body = calls[0].body;
    expect(body.get("payment_method_types[0]")).toBeNull();
    expect(body.get("customer")).toBe("cus_123");
    expect(body.get("metadata[tokens]")).toBe("500");
  });
});

describe("verifyStripeSignature", () => {
  async function sign(secret: string, timestamp: number, payload: string): Promise<string> {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
    const v1 = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `t=${timestamp},v1=${v1}`;
  }

  it("accepts a fresh valid signature and rejects tampering/stale ones", async () => {
    const payload = '{"id":"evt_1"}';
    const now = Math.floor(Date.now() / 1000);
    const good = await sign("whsec_test", now, payload);
    expect(await verifyStripeSignature(payload, good, "whsec_test")).toBe(true);
    expect(await verifyStripeSignature(payload + " ", good, "whsec_test")).toBe(false);
    expect(await verifyStripeSignature(payload, good, "whsec_other")).toBe(false);
    const stale = await sign("whsec_test", now - 3600, payload);
    expect(await verifyStripeSignature(payload, stale, "whsec_test")).toBe(false);
    expect(await verifyStripeSignature(payload, undefined, "whsec_test")).toBe(false);
  });
});
