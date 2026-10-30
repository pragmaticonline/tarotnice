// Invite codes (design: NICE-7K2Q, link tarotnice.com/r/NICE-7K2Q).
// The code is DERIVED from the user id (sha-256, readable alphabet), so
// it is stable across devices with no lookup table; a code resolves by
// registering the owner when their panel is first viewed.

/** Digits/letters that can't be confused when read aloud or typed. */
export const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const CODE_RE = /^NICE-([A-Z2-9]{4})$/i;

export function isInviteCode(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = CODE_RE.exec(v.trim());
  if (!m) return false;
  return [...m[1].toUpperCase()].every((ch) => INVITE_ALPHABET.includes(ch));
}

/** Canonical (upper-case) form of a valid code, else null. */
export function normalizeInviteCode(v: unknown): string | null {
  return isInviteCode(v) ? (v as string).trim().toUpperCase() : null;
}

/** Deterministic code for a user id (sync sha-256 via FNV fallback is
 *  not collision-safe, so callers use the async variant for display;
 *  this sync form exists for tests and non-critical labels). */
export function inviteCodeFor(userId: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < userId.length; i++) {
    h1 = Math.imul(h1 ^ userId.charCodeAt(i), 0x01000193);
    h2 = Math.imul(h2 ^ userId.charCodeAt(userId.length - 1 - i), 0x811c9dc5);
  }
  let suffix = "";
  let x = (h1 >>> 0) * 31 + (h2 >>> 0);
  for (let i = 0; i < 4; i++) {
    suffix += INVITE_ALPHABET[Math.abs(Math.floor(x)) % INVITE_ALPHABET.length];
    x = x / INVITE_ALPHABET.length;
  }
  return `NICE-${suffix}`;
}

/**
 * Code from the /invite/:code.png route value. Hono captures the whole
 * last segment (param name `code.png`), extension included, so strip a
 * trailing .png before validating.
 */
export function inviteCodeFromPngParam(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return normalizeInviteCode(v.trim().replace(/\.png$/i, ""));
}

export function inviteLinkFor(origin: string, code: string): string {
  return `${origin}/r/${code}`;
}

/** Internal cookie/attribution value for an invite: `inv:<userId>`. */
export function inviteRefFor(userId: string): string {
  return `inv:${userId}`;
}

export function parseInviteRef(ref: string | null | undefined): string | null {
  if (!ref || !ref.startsWith("inv:")) return null;
  const userId = ref.slice(4).trim();
  return userId.length >= 8 ? userId : null;
}
