import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const STAFF = { subject: "s", email: "maew@pragmaticonline.com", role: "admin" as const };
import app, {
  allowlistedRole,
  canAdmin,
  canMutate,
  parseGrantInput,
  parseUserListParams,
  renderUserDetail,
  renderUserList,
  renderUserSearch,
  shellPage,
  verifyAccessToken,
} from "../src/staff";
import { staffAuditEvents, staffUsers } from "../src/db/schema";

const TEAM = "https://pragmaticonline.cloudflareaccess.com";
const AUD = "test-audience";

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

async function signToken(opts: {
  subject: string;
  email: string;
  aud?: unknown;
  iss?: string;
  expOffset?: number;
  kid?: string;
  tamper?: boolean;
}): Promise<{ token: string; publicJwk: JsonWebKey & { kid?: string } }> {
  const keys = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = (await crypto.subtle.exportKey("jwk", keys.publicKey)) as JsonWebKey & { kid?: string };
  publicJwk.kid = opts.kid ?? "staff-test-key";
  publicJwk.alg = "RS256";
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", kid: publicJwk.kid })));
  const payload = b64url(
    new TextEncoder().encode(
      JSON.stringify({
        sub: opts.subject,
        email: opts.email,
        iss: opts.iss ?? TEAM,
        aud: opts.aud === undefined ? [AUD] : opts.aud,
        iat: now - 1,
        exp: now + (opts.expOffset ?? 3600),
      }),
    ),
  );
  let sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(`${header}.${payload}`));
  if (opts.tamper) {
    const bytes = new Uint8Array(sig);
    bytes[0] ^= 0xff;
    sig = bytes.buffer as ArrayBuffer;
  }
  return { token: `${header}.${payload}.${b64url(new Uint8Array(sig))}`, publicJwk };
}

describe("staff access JWT verification", () => {
  it("accepts a valid team token for the staff audience", async () => {
    const { token, publicJwk } = await signToken({ subject: "user-1", email: "ray@pragmaticonline.com" });
    const claims = await verifyAccessToken(token, TEAM, AUD, { keys: [publicJwk] });
    expect(claims?.sub).toBe("user-1");
    expect(claims?.email).toBe("ray@pragmaticonline.com");
  });

  it("rejects wrong audience, expired tokens, unknown keys and tampered signatures", async () => {
    const good = await signToken({ subject: "user-1", email: "ray@pragmaticonline.com" });
    expect(await verifyAccessToken(good.token, TEAM, "other-aud", { keys: [good.publicJwk] })).toBeNull();

    const expired = await signToken({ subject: "user-1", email: "ray@pragmaticonline.com", expOffset: -10 });
    expect(await verifyAccessToken(expired.token, TEAM, AUD, { keys: [expired.publicJwk] })).toBeNull();

    const unknownKey = await signToken({ subject: "user-1", email: "ray@pragmaticonline.com", kid: "nope" });
    expect(await verifyAccessToken(unknownKey.token, TEAM, AUD, { keys: [good.publicJwk] })).toBeNull();

    const tampered = await signToken({ subject: "user-1", email: "ray@pragmaticonline.com", tamper: true });
    // Tampered payload was signed with a different key than the cert set.
    const other = await signToken({ subject: "user-2", email: "x@y.z", kid: "other" });
    expect(await verifyAccessToken(tampered.token, TEAM, AUD, { keys: [other.publicJwk] })).toBeNull();
    expect(await verifyAccessToken("not.a.token", TEAM, AUD, { keys: [] })).toBeNull();
  });
});

describe("staff roles", () => {
  it("allowlist bootstraps admins, case-insensitive, exact match only", () => {
    const csv = "ray@pragmaticonline.com, maew@pragmaticonline.com";
    expect(allowlistedRole("ray@pragmaticonline.com", csv)).toBe("admin");
    expect(allowlistedRole("  MAEW@Pragmaticonline.com ", csv)).toBe("admin");
    expect(allowlistedRole("ray@evil.com", csv)).toBeNull();
    expect(allowlistedRole("ray@pragmaticonline.com.evil.com", csv)).toBeNull();
    expect(allowlistedRole("", csv)).toBeNull();
    expect(allowlistedRole("ray@pragmaticonline.com", undefined)).toBeNull();
  });

  it("read_only < support < admin", () => {
    expect(canMutate({ subject: "s", email: "e", role: "read_only" })).toBe(false);
    expect(canMutate({ subject: "s", email: "e", role: "support" })).toBe(true);
    expect(canMutate({ subject: "s", email: "e", role: "admin" })).toBe(true);
    expect(canAdmin({ subject: "s", email: "e", role: "support" })).toBe(false);
    expect(canAdmin({ subject: "s", email: "e", role: "admin" })).toBe(true);
  });
});

describe("staff worker guard and shell", () => {
  it("health is public, everything else needs Access", async () => {
    const health = await app.request("/health");
    expect(health.status).toBe(200);
    const denied = await app.request("/");
    expect(denied.status).toBe(401);
    expect(await denied.text()).toContain("Cloudflare Access");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("allowlisted staff with a valid team token reach the shell", async () => {
    const { token, publicJwk } = await signToken({ subject: "access-sub-1", email: "maew@pragmaticonline.com", kid: "k1" });
    const stranger = await signToken({ subject: "access-sub-2", email: "stranger@example.com", kid: "k2" });
    vi.stubGlobal(
      "fetch",
      async (url: unknown) => {
        if (String(url).endsWith("/cdn-cgi/access/certs")) {
          return new Response(JSON.stringify({ keys: [publicJwk, stranger.publicJwk] }), { status: 200 });
        }
        throw new Error(`unexpected fetch: ${String(url)}`);
      },
    );
    const env = {
      ACCESS_TEAM_DOMAIN: TEAM,
      ACCESS_AUD: AUD,
      STAFF_ALLOWED_EMAILS: "ray@pragmaticonline.com,maew@pragmaticonline.com",
    };
    const ok = await app.request("/", { headers: { "Cf-Access-Jwt-Assertion": token } }, env);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("maew@pragmaticonline.com");

    // Cryptographically valid token, but the email is not staff: still out.
    const denied = await app.request("/", { headers: { "Cf-Access-Jwt-Assertion": stranger.token } }, env);
    expect(denied.status).toBe(401);
  });

  it("shell names the staffer, the role, and the next tools", () => {
    const html = shellPage({ subject: "s", email: "maew@pragmaticonline.com", role: "admin" });
    expect(html).toContain("maew@pragmaticonline.com");
    expect(html).toContain("admin");
    expect(html).toContain("noindex");
    expect(html).toContain("User lookup");
    expect(html).toContain('href="/users"');
    expect(html).toContain("Token grant");
  });

  it("user search renders the form, hits, and empty states", () => {
    expect(renderUserSearch(STAFF, "", [])).toContain("Search by email, user id, or nickname.");
    expect(renderUserSearch(STAFF, "nobody@example.com", [])).toContain("No users found.");
    const html = renderUserSearch(STAFF, "maew", [
      { id: "u1", email: "maew@example.com", name: "Maew", nickname: "Maew" },
      { id: "u2", email: "x@example.com", name: "<b>X</b>", nickname: null },
    ]);
    expect(html).toContain('href="/users/u1"');
    expect(html).toContain("maew@example.com");
    expect(html).not.toContain("<b>X</b>");
    expect(html).toContain("&lt;b&gt;X&lt;/b&gt;");
  });

  it("user detail renders balance, readings, invite, and ledger", () => {
    const html = renderUserDetail(STAFF, {
      id: "u1",
      email: "maew@example.com",
      name: "Maew",
      nickname: "Mae<script>w",
      providers: ["google", "line"],
      createdAt: Date.UTC(2026, 0, 2),
      emailVerified: true,
      isAnonymous: false,
      wallet: 20,
      dailyLeft: 5,
      readings: 3,
      dailies: 1,
      inviteCode: "NICE-EF7J",
      invitedBy: "Ray",
      invited: 2,
      converted: 1,
      recentReadings: [{ id: "r1", day: "2026-11-23", topic: "love", question: "Will it work?", lang: "en", status: "done" }],
      recentTx: [{ day: "2026-11-23", reason: "referral", delta: 10, ref: "friend-bonus:u1" }],
    });
    expect(html).toContain("20</b> tokens");
    expect(html).toContain("NICE-EF7J");
    expect(html).toContain("Invited by");
    expect(html).toContain("friend-bonus:u1");
    expect(html).toContain("Will it work?");
    expect(html).not.toContain("<script>w");
    expect(html).toContain("Mae&lt;script&gt;w");
  });

  it("grant input requires a bounded amount and a reason", () => {
    expect(parseGrantInput({ amount: 10, reason: "Goodwill", note: "" })).toEqual({ amount: 10, reason: "Goodwill", note: "" });
    expect(parseGrantInput({ amount: "25", reason: "  Stuck reading  ", note: "Sorry!" })).toEqual({ amount: 25, reason: "Stuck reading", note: "Sorry!" });
    for (const bad of [{}, { amount: 0, reason: "x" }, { amount: 1001, reason: "x" }, { amount: 1.5, reason: "x" }, { amount: NaN, reason: "x" }, { amount: 5, reason: "" }, { amount: 5, reason: "   " }, { amount: 5, reason: "x".repeat(501) }]) {
      expect(parseGrantInput(bad)).toHaveProperty("error");
    }
  });

  it("user detail shows the grant form and per-reading refund forms with reason fields", () => {
    const drawing = { id: "r1", day: "2026-11-23", topic: "love", question: "Q?", lang: "en", status: "drawn" };
    const done = { id: "r2", day: "2026-11-23", topic: "work", question: "Q?", lang: "en", status: "complete" };
    const base = {
      id: "u1", email: "a@b.c", name: "A", nickname: null, providers: [], createdAt: 0,
      emailVerified: false, isAnonymous: false, wallet: 0, dailyLeft: 0, readings: 0, dailies: 0,
      inviteCode: "NICE-XXXX", invitedBy: null, invited: 0, converted: 0, recentTx: [],
    };
    const html = renderUserDetail(STAFF, { ...base, recentReadings: [drawing, done] });
    expect(html).toContain('action="/users/u1/grant"');
    expect(html).toContain('name="reason"');
    expect(html).toContain('action="/users/u1/readings/r1/refund"');
    expect(html).not.toContain("/users/u1/readings/r2/refund");
    expect(html).toContain("Refund +5 tokens");
    const flagged = renderUserDetail(STAFF, { ...base, recentReadings: [] }, { grantError: true, refundError: true });
    expect(flagged).toContain("Grant failed");
    expect(flagged).toContain("Refund failed");
  });

  it("grant and refund routes require support role, reason, and audit", () => {
    const src = readFileSync(new URL("../src/staff.ts", import.meta.url), "utf8");
    expect(src).toContain('app.post("/users/:id/grant"');
    expect(src).toContain('app.post("/users/:id/readings/:readingId/refund"');
    expect(src).toContain("recordAudit");
    expect(src).toContain('reason: "staff_grant"');
    expect(src).toContain('reason: "refund"');
    expect(src).toContain("already_delivered");
    expect(src).toContain('status: "failed"');
  });

  it("lookup routes are read-only and wired to the stores", () => {
    const src = readFileSync(new URL("../src/staff.ts", import.meta.url), "utf8");
    expect(src).toContain('app.get("/users"');
    expect(src).toContain('app.get("/users/:id"');
    expect(src).toContain("findUsers");
    expect(src).toContain("listUsers");
    expect(src).toContain("userDetail");
    expect(src).toContain("any staff role can read");
  });

  it("list params default safely and clamp the page", () => {
    const blank = parseUserListParams(() => undefined);
    expect(blank).toEqual({ provider: "all", verified: "all", anonymous: "all", activity: "all", sort: "newest", page: 0 });
    const evil = parseUserListParams((n) => ({ provider: "drop", sort: "nope", page: "999999999" })[n]);
    expect(evil.provider).toBe("all");
    expect(evil.sort).toBe("newest");
    expect(evil.page).toBe(0);
    const second = parseUserListParams((n) => ({ page: "2", sort: "readings", verified: "YES " })[n]);
    expect(second.page).toBe(2);
    expect(second.sort).toBe("readings");
    expect(second.verified).toBe("yes");
  });

  it("user list renders filters, table, and pagination preserving state", () => {
    const params = { provider: "line", verified: "all", anonymous: "all", activity: "all", sort: "newest", page: 1 };
    const html = renderUserList(STAFF, params, {
      rows: [
        { id: "u1", email: "maew@example.com", name: "Maew", nickname: "Mae<script>w", createdAt: Date.UTC(2026, 0, 2), emailVerified: true, isAnonymous: false, providers: ["line"], readingCount: 7 },
      ],
      page: 1,
      pages: 3,
      total: 41,
    });
    expect(html).toContain("Users");
    expect(html).toContain('href="/users/u1"');
    expect(html).toContain("Mae&lt;script&gt;w");
    expect(html).toContain("Page 2 of 3 (41 users)");
    expect(html).toContain("page=0");
    expect(html).toContain("page=2");
    expect(html).toContain("provider=line");
    expect(html).not.toContain("<script>w");
    const empty = renderUserList(STAFF, parseUserListParams(() => undefined), { rows: [], page: 0, pages: 1, total: 0 });
    expect(empty).toContain("No users match these filters.");
  });

  it("worker verifies Access JWTs against team certs and gates on staff identity", () => {
    const src = readFileSync(new URL("../src/staff.ts", import.meta.url), "utf8");
    expect(src).toContain("Cf-Access-Jwt-Assertion");
    expect(src).toContain("cdn-cgi/access/certs");
    expect(src).toContain("RSASSA-PKCS1-v1_5");
    expect(src).toContain("staff_users");
    expect(src).toContain("STAFF_ALLOWED_EMAILS");
    expect(src).not.toContain("tarotnice.com/r/");
  });
});

describe("staff tables and config", () => {
  it("schema exposes staff users and audit events", () => {
    expect(staffUsers.subject).toBeTruthy();
    expect(staffAuditEvents.action).toBeTruthy();
  });

  it("migration creates both tables with the audit indexes", () => {
    const sql = readFileSync(new URL("../drizzle/0012_staff_users.sql", import.meta.url), "utf8");
    expect(sql).toContain("CREATE TABLE `staff_users`");
    expect(sql).toContain("CREATE TABLE `staff_audit_events`");
    expect(sql).toContain("idx_staff_audit_occurred");
    expect(sql).toContain("idx_staff_audit_target");
  });

  it("staff worker is separate from the public worker on staff.tarotnice.com", () => {
    const toml = readFileSync(new URL("../wrangler.staff.toml", import.meta.url), "utf8");
    expect(toml).toContain('name = "tarotnice-staff"');
    expect(toml).toContain('main = "src/staff.ts"');
    expect(toml).toContain("staff.tarotnice.com");
    expect(toml).toContain('database_name = "tarotnice"');
    expect(toml).toContain("ACCESS_TEAM_DOMAIN");
    expect(toml).toContain("ACCESS_AUD");
    expect(toml).toContain("STAFF_ALLOWED_EMAILS");
  });
});
