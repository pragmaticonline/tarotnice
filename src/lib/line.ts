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

/** One-time welcome code revealed on the follow event. */
export function newLineWelcomeCode(random: () => number = Math.random): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += chars[Math.floor(random() * chars.length)];
  return `LINE-${suffix}`;
}

export function lineWelcomeText(code: string, uiLang: "en" | "th"): string {
  if (uiLang === "th") {
    return `\u0e22\u0e34\u0e19\u0e14\u0e35\u0e15\u0e49\u0e2d\u0e19\u0e23\u0e31\u0e1a\u0e2a\u0e39\u0e48 TarotNice \u0e1a\u0e19 LINE \u0e23\u0e2b\u0e31\u0e2a\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e04\u0e37\u0e2d: ${code}\n\u0e41\u0e25\u0e01\u0e44\u0e14\u0e49\u0e17\u0e35\u0e48 tarotnice.com/billing \u0e41\u0e25\u0e49\u0e27\u0e23\u0e31\u0e1a\u0e42\u0e17\u0e40\u0e04\u0e47\u0e19\u0e1f\u0e23\u0e35\u0e40\u0e25\u0e22`;
  }
  return `Welcome to TarotNice on LINE. Your one-time code: ${code}\nRedeem it at tarotnice.com/billing — it works once and only once.`;
}
