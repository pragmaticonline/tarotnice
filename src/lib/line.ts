import { LINE_WELCOME_BONUS_TOKENS } from "./wallet";

// LINE Messaging API client for the @677zpuat Official Account.
// Uses the Channel Access Token (secret LINE_MSG_ACCESS_TOKEN) for
// calls and the channel secret (LINE_MSG_CHANNEL_SECRET) for
// webhook signature checks. Every sender is best-effort: returns
// false (and logs) instead of throwing.
export type LineMsgEnv = {
  LINE_MSG_ACCESS_TOKEN?: string;
  LINE_MSG_CHANNEL_SECRET?: string;
};

const LINE_API_BASE = "https://api.line.me";

export function lineMsgConfigured(env: LineMsgEnv | undefined): boolean {
  return Boolean(env?.LINE_MSG_ACCESS_TOKEN);
}

/** Verify `X-Line-Signature`: HMAC-SHA256(channelSecret, rawBody), base64. */
export async function verifyLineSignature(
  env: LineMsgEnv | undefined,
  rawBody: string,
  signature: string | undefined,
): Promise<boolean> {
  const secret = env?.LINE_MSG_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return timingSafeEqualHex(expected, signature);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function postBot(
  env: LineMsgEnv,
  path: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await fetch(`${LINE_API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.LINE_MSG_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`LINE ${path} failed: HTTP ${res.status} ${body.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`LINE ${path} failed: ${(err as Error).message}`);
    return false;
  }
}

/** Push one text message to a LINE user who added the OA. */
export async function pushLineText(
  env: LineMsgEnv | undefined,
  lineUserId: string,
  text: string,
): Promise<boolean> {
  if (!lineMsgConfigured(env) || !lineUserId || !text) return false;
  return postBot(env!, "/v2/bot/message/push", {
    to: lineUserId,
    messages: [{ type: "text", text }],
  });
}

/** Reply with one text message inside the webhook context. */
export async function replyLineText(
  env: LineMsgEnv | undefined,
  replyToken: string,
  text: string,
): Promise<boolean> {
  if (!lineMsgConfigured(env) || !replyToken || !text) return false;
  return postBot(env!, "/v2/bot/message/reply", {
    replyToken,
    messages: [{ type: "text", text }],
  });
}

/** Generate a one-time LINE welcome code (LINE-XXXXXX). */
export function newLineWelcomeCode(random: () => number = Math.random): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += chars[Math.floor(random() * chars.length)];
  return `LINE-${suffix}`;
}
/** One-time welcome code revealed on the follow event.
 * Bilingual (we do not know the friend's language yet): Thai first,
 * then English. The token count comes from LINE_WELCOME_BONUS_TOKENS. */
export function lineWelcomeText(code: string): string {
  const n = LINE_WELCOME_BONUS_TOKENS;
  const link = "https://tarotnice.com/billing";
  return [
    `\u{1F381} \u0e42\u0e04\u0e49\u0e14\u0e02\u0e2d\u0e07\u0e02\u0e27\u0e31\u0e0d\u0e08\u0e32\u0e01\u0e19\u0e49\u0e2d\u0e07\u0e40\u0e07\u0e34\u0e19: {CODE}`,
    `\u0e23\u0e31\u0e1a\u0e1f\u0e23\u0e35 ${n} \u0e42\u0e17\u0e40\u0e04\u0e19 \u00b7 \u0e43\u0e0a\u0e49\u0e44\u0e14\u0e49 1 \u0e04\u0e23\u0e31\u0e49\u0e07`,
    `\u0e41\u0e25\u0e01\u0e44\u0e14\u0e49\u0e17\u0e35\u0e48 \u{1F449} ${link}`,
    ``,
    `\u{1F381} A gift from Ngern: {CODE}`,
    `Get ${n} free tokens \u00b7 one-time use`,
    `Redeem at \u{1F449} ${link}`,
  ].join("\n").replaceAll("{CODE}", code);
}

