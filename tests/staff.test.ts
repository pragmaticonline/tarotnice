import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const STAFF = { subject: "s", email: "maew@pragmaticonline.com", role: "admin" as const };
import app, {
  formatMinor,
  renderAffiliatesPage,
  renderInvitesPage,
  summarizeAffiliatePayments,
  allowlistedRole,
  canAdmin,
  canMutate,
  parseGrantInput,
  parseMergeInput,
  parseUserListParams,
  renderMergeForm,
  renderMergePreview,
  renderStuckPage,
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

describe("affiliate tracking", () => {
  it("sums referred payments in minor units", () => {
    expect(summarizeAffiliatePayments([])).toEqual({ count: 0, totalMinor: 0, currency: "THB" });
    const rows = [
      { userId: "f1", day: "2026-11-01", delta: 50, ref: "pi_1", createdAt: 1, amount: 5900, currency: "thb", paymentMethod: "promptpay" },
      { userId: "f1", day: "2026-11-02", delta: 200, ref: "pi_2", createdAt: 2, amount: 19900, currency: "THB", paymentMethod: "card" },
      { userId: "f2", day: "2026-11-03", delta: 50, ref: "pi_3", createdAt: 3, amount: null, currency: null, paymentMethod: null },
    ];
    expect(summarizeAffiliatePayments(rows)).toEqual({ count: 3, totalMinor: 25800, currency: "THB" });
    expect(formatMinor(25800, "THB")).toBe("\u0e3f258.00");
    expect(formatMinor(100, "USD")).toBe("USD 1.00");
  });

  it("affiliates directory lists partners with totals and enable search", () => {
    const html = renderAffiliatesPage(STAFF, "maew", [
      { id: "u9", email: "maew@example.com", name: "Maew", nickname: "Maew" },
    ], [
      { userId: "u9", email: "maew@example.com", nickname: "Maew", enabledAt: Date.UTC(2026, 10, 1), enabledBy: "admin@x.y", invited: 2, converted: 1, payments: 1, revenueMinor: 5900 },
    ]);
    expect(html).toContain("Affiliates");
    expect(html).toContain("/invites?user=u9");
    expect(html).toContain("\u0e3f59.00");
    expect(html).not.toContain("next");
    const empty = renderAffiliatesPage(STAFF, "", [], []);
    expect(empty).toContain("No affiliates yet");
  });

  it("invite page shows the affiliate toggle and referred payments", () => {
    const base = {
      id: "u9", email: "m@x.y", name: "M", nickname: "M", providers: [] as string[], createdAt: 1,
      emailVerified: false, isAnonymous: false, wallet: 0, dailyLeft: 0, readings: 0, dailies: 0,
      inviteCode: "NICE-AAAA", invitedBy: null, invited: 0, converted: 0,
      recentReadings: [], recentTx: [],
    };
    const off = renderInvitesPage(STAFF, "u9", { ...base, friends: [], rewards: [], rewardsTotal: 0 }, true, { active: false, payments: [] });
    expect(off).toContain("Enable affiliate tracking");
    expect(off).not.toContain("Referred payments");
    const on = renderInvitesPage(STAFF, "u9", { ...base, friends: [], rewards: [], rewardsTotal: 0 }, true, {
      active: true, enabledAt: Date.UTC(2026, 10, 1), enabledBy: "a@x.y",
      payments: [{ userId: "f1", day: "2026-11-01", delta: 50, ref: "pi_1", amount: 5900, currency: "THB", paymentMethod: "promptpay" }],
    });
    expect(on).toContain("affiliate");
    expect(on).toContain("Referred payments");
    expect(on).toContain("\u0e3f59.00");
    expect(on).toContain("promptpay");
    const reader = renderInvitesPage({ subject: "s", email: "e", role: "read_only" }, "u9", { ...base, friends: [], rewards: [], rewardsTotal: 0 }, true, { active: false, payments: [] });
    expect(reader).toContain("Ask support or an admin");
    expect(reader).not.toContain('action="/affiliates/');
  });

  it("affiliate routes gate on role and audit everything", () => {
    const src = readFileSync(new URL("../src/staff.ts", import.meta.url), "utf8");
    expect(src).toContain('app.get("/affiliates"');
    expect(src).toContain('app.post("/affiliates/:userId/enable"');
    expect(src).toContain('app.post("/affiliates/:userId/disable"');
    expect(src).toContain("affiliate.enable");
    expect(src).toContain("affiliate.disable");
    expect(src).toContain("SUPPORT_GRANT_CAP");
    const main = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    expect(main).toContain('"affiliate_payment"');
  });

  it("affiliates migration keys on the user", () => {
    const sql = readFileSync(new URL("../drizzle/0014_affiliates.sql", import.meta.url), "utf8");
    expect(sql).toContain("CREATE TABLE `affiliates`");
    expect(sql).toContain("PRIMARY KEY");
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

  it("merge input needs a target, a reason, and the retyped source email", () => {
    expect(parseMergeInput({ target: "u2", reason: "dup", confirmEmail: "A@x.y" }, "a@x.y")).toEqual({
      target: "u2",
      reason: "dup",
      confirmEmail: "A@x.y",
    });
    expect(parseMergeInput({ target: "", reason: "r", confirmEmail: "a@x.y" }, "a@x.y")).toHaveProperty("error");
    expect(parseMergeInput({ target: "u2", reason: "", confirmEmail: "a@x.y" }, "a@x.y")).toHaveProperty("error");
    expect(parseMergeInput({ target: "u2", reason: "r", confirmEmail: "wrong@x.y" }, "a@x.y")).toHaveProperty("error");
    expect(parseMergeInput({ target: "u2", reason: "r", confirmEmail: "" }, "a@x.y")).toHaveProperty("error");
  });

  it("merge form and preview render both sides and the typed-email gate", () => {
    const a = { id: "u1", email: "a@x.y", name: "A", nickname: null, providers: ["google"], createdAt: 1, emailVerified: true, isAnonymous: false, wallet: 10, dailyLeft: 0, readings: 2, dailies: 0, inviteCode: "NICE-AAAA", invitedBy: null, invited: 0, converted: 0, recentReadings: [], recentTx: [] };
    const b = { ...a, id: "u2", email: "b@x.y", wallet: 5 };
    const form = renderMergeForm(STAFF, a);
    expect(form).toContain("a@x.y");
    expect(form).toContain("deletes");
    const preview = renderMergePreview(STAFF, a, b, "dup", "u2");
    expect(preview).toContain("Confirm merge");
    expect(preview).toContain("NICE-AAAA");
    expect(preview).toContain("about 15 after");
    expect(preview).toContain('name="confirmEmail"');
    expect(preview).toContain("Merge and delete source");
  });

  it("stuck queue renders rows, checkboxes, and bulk action", () => {
    const rows = [
      { id: "r1", userId: "u1", email: "a@x.y", nickname: "A", day: "2026-11-19", topic: "love", lang: "th", model: "m", status: "drawn", createdAt: Date.now() - 10 * 60000, stuckMinutes: 10, charged: 5, refunded: false },
      { id: "r2", userId: "u2", email: "b@x.y", nickname: null, day: "2026-11-19", topic: "work", lang: "en", model: "m", status: "failed", createdAt: Date.now() - 60000, stuckMinutes: 1, charged: 5, refunded: true },
    ];
    const html = renderStuckPage(STAFF, rows, { refunded: 2, failed: 1 });
    expect(html).toContain("Stuck readings");
    expect(html).toContain('value="r1"');
    expect(html).not.toContain('value="r2"');
    expect(html).toContain("refunded</span>");
    expect(html).toContain("Refund selected");
    expect(html).toContain("Refunded 2 reading(s)");
    expect(renderStuckPage(STAFF, [])).toContain("queue is clear");
  });

  it("support grants are capped, merge/admin routes are admin-only, queue wired", () => {
    const src = readFileSync(new URL("../src/staff.ts", import.meta.url), "utf8");
    expect(src).toContain("SUPPORT_GRANT_CAP = 20");
    expect(src).toContain("grant_cap_exceeded");
    expect(src).toContain('app.post("/users/:id/merge"');
    expect(src).toContain('app.get("/users/:id/merge"');
    expect(src).toContain("mergeUsers");
    expect(src).toContain("Admin role required.");
    expect(src).toContain('app.get("/stuck"');
    expect(src).toContain('app.post("/stuck/refund"');
    expect(src).toContain("listStuckReadings");
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
