// Stripe billing via raw REST calls (same model as nicelingo: no SDK,
// Workers-native fetch + WebCrypto). Token packs are one-time purchases;
// fulfillment happens only in the webhook after server-side verification.
import { TOKENS_PER_QUESTION } from "./wallet";

export type StripeEnv = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PACK_STARTER_PRICE_ID?: string;
  STRIPE_PACK_STANDARD_PRICE_ID?: string;
  STRIPE_PACK_PREMIUM_PRICE_ID?: string;
};

export type PackId = "starter" | "standard" | "premium";

export type Pack = {
  id: PackId;
  tokens: number;
  /** Price in THB (display only — Stripe Prices are authoritative). */
  thb: number;
  /** Starter is PromptPay-only; larger packs also take cards. */
  promptPayOnly: boolean;
};

export const PACKS: Record<PackId, Pack> = {
  starter: { id: "starter", tokens: 50, thb: 59, promptPayOnly: true },
  standard: { id: "standard", tokens: 200, thb: 199, promptPayOnly: false },
  premium: { id: "premium", tokens: 500, thb: 399, promptPayOnly: false },
};

export const PACK_LIST: Pack[] = [PACKS.starter, PACKS.standard, PACKS.premium];

export function isPackId(v: unknown): v is PackId {
  return v === "starter" || v === "standard" || v === "premium";
}

export function packPriceId(env: StripeEnv, pack: PackId): string | null {
  if (pack === "starter") return env.STRIPE_PACK_STARTER_PRICE_ID ?? null;
  if (pack === "standard") return env.STRIPE_PACK_STANDARD_PRICE_ID ?? null;
  return env.STRIPE_PACK_PREMIUM_PRICE_ID ?? null;
}

/** Buy UI appears only once the secret + at least one pack price exist. */
export function tokensConfigured(env: StripeEnv | undefined): boolean {
  if (!env?.STRIPE_SECRET_KEY?.trim()) return false;
  return PACK_LIST.some((p) => Boolean(packPriceId(env, p.id)?.trim()));
}

async function stripeRequest<T>(
  env: StripeEnv,
  path: string,
  params: URLSearchParams,
  idempotencyKey?: string,
): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured.");
  const headers: Record<string, string> = {
    Authorization: `Basic ${btoa(`${env.STRIPE_SECRET_KEY}:`)}`,
    "content-type": "application/x-www-form-urlencoded",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers,
    body: params,
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  } & T;
  if (!response.ok)
    throw new Error(body.error?.message || `Stripe returned HTTP ${response.status}.`);
  return body;
}

async function stripeGet<T>(env: StripeEnv, path: string): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured.");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Basic ${btoa(`${env.STRIPE_SECRET_KEY}:`)}` },
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  } & T;
  if (!response.ok)
    throw new Error(body.error?.message || `Stripe returned HTTP ${response.status}.`);
  return body;
}

export type CheckoutSession = {
  id: string;
  status?: string;
  payment_status?: string;
  amount_total?: number;
  currency?: string;
  client_reference_id?: string;
  customer?: string;
  payment_intent?: string;
  metadata?: Record<string, string>;
};

/** Resolve the pack a completed session paid for (metadata fallback). */
export function packForSession(session: CheckoutSession): Pack | null {
  const pack = session.metadata?.pack;
  if (isPackId(pack)) return PACKS[pack];
  const tokens = Number(session.metadata?.tokens);
  return PACK_LIST.find((p) => p.tokens === tokens) ?? null;
}

// Retrieve a Checkout Session so the webhook/success page can verify
// completion server-side instead of trusting the redirect alone.
export function retrieveCheckoutSession(env: StripeEnv, sessionId: string) {
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId))
    throw new Error("Invalid checkout session.");
  return stripeGet<CheckoutSession>(
    env,
    `checkout/sessions/${encodeURIComponent(sessionId)}`,
  );
}

/** One-time token-pack checkout (mirrors nicelingo's PromptPay pass
 *  session): payment mode, kind metadata stamped here, idempotency key
 *  per user+price so a double-tap can't create two live sessions. */
export function createPackCheckoutSession(
  env: StripeEnv,
  input: {
    userId: string;
    email: string;
    successUrl: string;
    cancelUrl: string;
    priceId: string;
    pack: Pack;
    customerId?: string | null;
  },
) {
  const params = new URLSearchParams();
  params.set("mode", "payment");
  if (input.pack.promptPayOnly) params.set("payment_method_types[0]", "promptpay");
  params.set("line_items[0][price]", input.priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("client_reference_id", input.userId);
  if (input.customerId) {
    params.set("customer", input.customerId);
  } else {
    params.set("customer_email", input.email);
    params.set("customer_creation", "always");
  }
  params.set("success_url", input.successUrl);
  params.set("cancel_url", input.cancelUrl);
  params.set("metadata[user_id]", input.userId);
  params.set("metadata[kind]", "token_pack");
  params.set("metadata[pack]", input.pack.id);
  params.set("metadata[tokens]", String(input.pack.tokens));
  return stripeRequest<{ id: string; url: string }>(
    env,
    "checkout/sessions",
    params,
    `tarotnice-pack-${input.userId}-${input.priceId}`,
  );
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeHexEqual(actual: string, expected: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(actual) || !/^[0-9a-f]{64}$/.test(expected))
    return false;
  const decode = (value: string) =>
    Uint8Array.from({ length: 32 }, (_, index) =>
      Number.parseInt(value.slice(index * 2, index * 2 + 2), 16),
    );
  const left = decode(actual);
  const right = decode(expected);
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (a: ArrayBufferView, b: ArrayBufferView) => boolean;
  };
  if (typeof subtle.timingSafeEqual === "function")
    return subtle.timingSafeEqual(left, right);
  let difference = 0;
  for (let index = 0; index < left.length; index++)
    difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function verifyStripeSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string | undefined,
): Promise<boolean> {
  if (!signature || !secret) return false;
  const parts: Record<string, string[]> = {};
  for (const part of signature.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    (parts[name] ||= []).push(value);
  }
  const timestamp = Number(parts.t?.[0]);
  if (
    !Number.isFinite(timestamp) ||
    Math.abs(Date.now() / 1000 - timestamp) > 300 ||
    !parts.v1?.length
  )
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = hex(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${timestamp}.${rawBody}`),
    ),
  );
  let matched = false;
  for (const candidate of parts.v1)
    matched = constantTimeHexEqual(digest, candidate) || matched;
  return matched;
}

export { TOKENS_PER_QUESTION };
