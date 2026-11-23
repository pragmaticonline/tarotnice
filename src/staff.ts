// Staff administration (staff.tarotnice.com). Separate worker, locked by
// Cloudflare Access in front: every request must carry a valid
// Cf-Access-Jwt-Assertion for the staff Access application, and the
// identity must map to an active staff_users row or the allowlist.
// Roles mirror blognice: read_only < support < admin.
import { Hono } from "hono";
import { eq, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { d1PrefsStore } from "./db/prefs-store";
import { d1TarotStore } from "./db/tarot-store";
import { staffUsers, user, userPrefs } from "./db/schema";
import { bangkokDay } from "./lib/bangkok";
import { escapeHtml } from "./lib/html";
import { inviteCodeFor, inviteLinkFor } from "./lib/invite";
import { walletBalance, type LedgerRow } from "./lib/wallet";

export type StaffRole = "read_only" | "support" | "admin";
export type StaffIdentity = { subject: string; email: string; role: StaffRole };

type StaffEnv = {
  DB: D1Database;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  STAFF_ALLOWED_EMAILS?: string;
};

type AccessClaims = {
  sub?: string;
  email?: string;
  aud?: string[] | string;
  iss?: string;
  exp?: number;
  iat?: number;
};

const STAFF_ROLES = new Set<StaffRole>(["read_only", "support", "admin"]);

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function decodeJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(value))) as T;
}

function normalizedTeamDomain(value: string): string {
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withScheme.replace(/\/+$/, "");
}

/**
 * Verify an Access JWT against fetched team certs. Pure (certs injected)
 * so tests can sign with a throwaway key; the worker fetches certs from
 * the team domain with a short cache in accessClaims below.
 */
export async function verifyAccessToken(
  token: string,
  teamDomain: string,
  audience: string,
  certKeys: { keys?: JsonWebKey[] } | null,
): Promise<AccessClaims | null> {
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
    if (!encodedHeader || !encodedPayload || !encodedSignature) return null;
    const header = decodeJson<{ alg?: string; kid?: string }>(encodedHeader);
    const claims = decodeJson<AccessClaims>(encodedPayload);
    if (header.alg !== "RS256" || !header.kid || !claims.sub || !claims.email) return null;
    const now = Math.floor(Date.now() / 1000);
    if (!claims.exp || claims.exp <= now || (claims.iat && claims.iat > now + 60)) return null;
    const issuer = normalizedTeamDomain(teamDomain);
    if (!claims.iss || claims.iss.replace(/\/+$/, "") !== issuer) return null;
    const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
    if (!audiences.includes(audience)) return null;
    const key = certKeys?.keys?.find((candidate) => (candidate as JsonWebKey & { kid?: string }).kid === header.kid);
    if (!key) return null;
    const cryptoKey = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      base64UrlDecode(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
    return valid ? claims : null;
  } catch {
    return null;
  }
}

async function accessClaims(c: {
  req: { header: (n: string) => string | undefined };
  env?: StaffEnv;
}): Promise<AccessClaims | null> {
  const token = c.req.header("Cf-Access-Jwt-Assertion");
  const team = String(c.env?.ACCESS_TEAM_DOMAIN || "").trim();
  const audience = String(c.env?.ACCESS_AUD || "").trim();
  if (!token || !team || !audience) return null;
  try {
    const issuer = normalizedTeamDomain(team);
    const certs = await fetch(`${issuer}/cdn-cgi/access/certs`).then((res) =>
      res.ok ? (res.json() as Promise<{ keys?: JsonWebKey[] }>) : null,
    );
    return verifyAccessToken(token, team, audience, certs);
  } catch {
    return null;
  }
}

/** Allowlist check (pure): listed emails bootstrap as admins. */
export function allowlistedRole(email: string, allowlistCsv: string | undefined): StaffRole | null {
  const clean = email.trim().toLowerCase();
  const allowed = String(allowlistCsv || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return clean && allowed.includes(clean) ? "admin" : null;
}

/** Staff identity: active staff_users row wins; allowlist bootstraps admins. */
export async function resolveStaff(
  c: { req: { header: (n: string) => string | undefined }; env?: StaffEnv },
  claims: AccessClaims | null,
): Promise<StaffIdentity | null> {
  if (!claims) return null;
  if (c.env?.DB) {
    try {
      const row = await drizzle(c.env.DB)
        .select()
        .from(staffUsers)
        .where(eq(staffUsers.subject, String(claims.sub)))
        .limit(1)
        .then((rows) => rows[0] ?? null);
      if (row && row.active === 1 && STAFF_ROLES.has(row.role as StaffRole)) {
        return { subject: row.subject, email: row.email, role: row.role as StaffRole };
      }
    } catch {
      return null;
    }
  }
  const email = String(claims.email ?? "").trim();
  const role = allowlistedRole(email, c.env?.STAFF_ALLOWED_EMAILS);
  if (role) {
    return { subject: String(claims.sub), email, role };
  }
  return null;
}

export function canMutate(staff: StaffIdentity): boolean {
  return staff.role === "support" || staff.role === "admin";
}

export function canAdmin(staff: StaffIdentity): boolean {
  return staff.role === "admin";
}

const STYLE = `<style>
body{margin:0;background:#f6f1fa;color:#2e2547;font-family:system-ui,sans-serif}
.wrap{max-width:720px;margin:0 auto;padding:32px 16px}
.card{background:#fff;border:1px solid #e3d6b8;border-radius:16px;padding:24px}
.muted{color:#6b5f85}
ul.tools{list-style:none;margin:16px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
ul.tools li{border:1px solid #e3d6b8;border-radius:12px;padding:12px 14px;background:#fffaf0}
.badge{display:inline-block;font-size:12px;font-weight:700;border:1px solid #b0832f;border-radius:999px;padding:2px 10px;margin-left:8px;color:#4a3d78}
</style>`;

export function shellPage(staff: StaffIdentity): string {
  const tools = [
    { name: "User lookup", note: "Find a user, see balance and readings.", href: "/users" },
    { name: "Token grant", note: "Goodwill top-ups with reason + audit.", soon: true },
    { name: "Invite & referrals", note: "Codes, attribution, inviter rewards.", soon: true },
  ];
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>TarotNice staff</title>
${STYLE}
</head>
<body>
<div class="wrap"><div class="card">
<h1>TarotNice staff</h1>
<p class="muted">Signed in as ${escapeHtml(staff.email)} (${escapeHtml(staff.role)})</p>
<ul class="tools">
${tools
  .map((t) =>
    "href" in t && t.href
      ? `<li><b><a href="${t.href}">${escapeHtml(t.name)}</a></b><br><span class="muted">${escapeHtml(t.note)}</span></li>`
      : `<li><b>${escapeHtml(t.name)}</b><span class="badge">next</span><br><span class="muted">${escapeHtml(t.note)}</span></li>`,
  )
  .join("\n")}
</ul>
</div></div>
</body>
</html>`;
}

export type StaffUserHit = { id: string; email: string; name: string; nickname: string | null };

/** Find users by email (exact), id (exact), or nickname (prefix). */
export async function findUsers(db: D1Database, rawQuery: string): Promise<StaffUserHit[]> {
  const q = rawQuery.trim();
  if (!q) return [];
  const orm = drizzle(db);
  let rows: { id: string; email: string; name: string }[];
  if (q.includes("@")) {
    rows = await orm
      .select({ id: user.id, email: user.email, name: user.name })
      .from(user)
      .where(sql`lower(${user.email}) = lower(${q})`)
      .limit(5);
  } else {
    rows = await orm
      .select({ id: user.id, email: user.email, name: user.name })
      .from(user)
      .where(eq(user.id, q))
      .limit(5);
    if (!rows.length) {
      const pattern = `${q.replace(/[%_\\]/g, "\\$&")}%`;
      const nicked = await orm
        .select({ id: user.id, email: user.email, name: user.name, nickname: userPrefs.nickname })
        .from(user)
        .leftJoin(userPrefs, eq(userPrefs.userId, user.id))
        .where(like(userPrefs.nickname, pattern))
        .limit(20);
      return nicked.map((r) => ({ id: r.id, email: r.email, name: r.name, nickname: r.nickname }));
    }
  }
  if (!rows.length) return [];
  const prefs = d1PrefsStore(db);
  const hits: StaffUserHit[] = [];
  for (const r of rows) {
    const p = await prefs.get(r.id).catch(() => null);
    hits.push({ ...r, nickname: p?.nickname ?? null });
  }
  return hits;
}

export type StaffUserDetail = {
  id: string;
  email: string;
  name: string;
  nickname: string | null;
  providers: string[];
  createdAt: number;
  emailVerified: boolean;
  isAnonymous: boolean;
  wallet: number;
  dailyLeft: number;
  readings: number;
  dailies: number;
  inviteCode: string;
  invitedBy: string | null;
  invited: number;
  converted: number;
  recentReadings: { id: string; day: string; topic: string; question: string; lang: string; status: string }[];
  recentTx: { day: string; reason: string; delta: number; ref: string }[];
};

/** Full support view for one user; null when the id is unknown. */
export async function userDetail(db: D1Database, userId: string): Promise<StaffUserDetail | null> {
  const store = d1TarotStore(db);
  const orm = drizzle(db);
  const rows = await orm
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  const found = rows[0];
  if (!found) return null;
  const prefs = d1PrefsStore(db);
  const today = bangkokDay();
  const [info, flags, pref, ledger, stats, referral, refStats, readings, tx] = await Promise.all([
    store.accountInfo(userId).catch(() => null),
    store.getUserFlags(userId).catch(() => null),
    prefs.get(userId).catch(() => null),
    store.ledgerRows(userId).catch(() => []),
    store.progressStats(userId).catch(() => ({ readings: 0, topics: [], dailies: 0 })),
    store.getReferral(userId).catch(() => null),
    store.referralStats(userId).catch(() => ({ invited: 0, converted: 0 })),
    store.listReadings(userId, null, 10).catch(() => []),
    store.listTransactions({ userId, reasons: null, cursor: null, limit: 10 }).catch(() => []),
  ]);
  const balance = walletBalance(
    ledger.map((r): LedgerRow => ({
      delta: r.delta,
      reason: r.reason as LedgerRow["reason"],
      source: (r.source as LedgerRow["source"]) ?? null,
      day: r.day,
      createdAt: r.createdAt,
    })),
    today,
  );
  let invitedBy: string | null = null;
  if (referral) {
    const rp = await prefs.get(referral.referrerId).catch(() => null);
    invitedBy = rp?.nickname ?? referral.referrerId;
  }
  const code = await store.ensureInviteCode(userId, inviteCodeFor(userId)).catch(() => inviteCodeFor(userId));
  return {
    id: found.id,
    email: found.email,
    name: found.name,
    nickname: pref?.nickname ?? null,
    providers: info?.providers ?? [],
    createdAt: info?.createdAt ?? 0,
    emailVerified: flags?.emailVerified ?? info?.emailVerified ?? false,
    isAnonymous: flags?.isAnonymous ?? false,
    wallet: balance.wallet,
    dailyLeft: balance.dailyLeft,
    readings: stats.readings,
    dailies: stats.dailies,
    inviteCode: code,
    invitedBy,
    invited: refStats.invited,
    converted: refStats.converted,
    recentReadings: readings.map((r) => ({ id: r.id, day: r.day, topic: r.topic, question: r.question, lang: r.lang, status: r.status })),
    recentTx: tx.map((t) => ({ day: t.day, reason: t.reason, delta: t.delta, ref: t.ref })),
  };
}

function staffHead(title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} \u00b7 TarotNice staff</title>
${STYLE}
</head>
<body>
<div class="wrap"><div class="card">
<p class="muted"><a href="/">staff</a></p>`;
}

function staffFoot(): string {
  return `</div></div>
</body>
</html>`;
}

export function renderUserSearch(q: string, hits: StaffUserHit[]): string {
  const list = hits.length
    ? `<ul class="tools">${hits
        .map(
          (h) =>
            `<li><b><a href="/users/${escapeHtml(h.id)}">${escapeHtml(h.nickname ?? h.name)}</a></b><br><span class="muted">${escapeHtml(h.email)} \u00b7 ${escapeHtml(h.id)}</span></li>`,
        )
        .join("\n")}</ul>`
    : q
      ? `<p class="muted">No users found.</p>`
      : `<p class="muted">Search by email, user id, or nickname.</p>`;
  return (
    staffHead("User lookup") +
    `<h1>User lookup</h1>
<form method="get" action="/users">
<input type="search" name="q" value="${escapeHtml(q)}" placeholder="email, user id, or nickname" required>
<button type="submit">Search</button>
</form>
${list}` +
    staffFoot()
  );
}

export function renderUserDetail(d: StaffUserDetail): string {
  const fmtDate = (ms: number) => (ms ? new Date(ms).toISOString().slice(0, 10) : "\u2014");
  const kv = (k: string, v: string) => `<tr><th>${escapeHtml(k)}</th><td>${v}</td></tr>`;
  const readings = d.recentReadings.length
    ? `<ul class="tools">${d.recentReadings.map((r) => `<li><b>${escapeHtml(r.topic)}</b> <span class="muted">${escapeHtml(r.day)} \u00b7 ${escapeHtml(r.lang)} \u00b7 ${escapeHtml(r.status)}</span><br><span class="muted">${escapeHtml(r.question)}</span></li>`).join("\n")}</ul>`
    : `<p class="muted">No readings yet.</p>`;
  const tx = d.recentTx.length
    ? `<ul class="tools">${d.recentTx.map((t) => `<li><b>${t.delta > 0 ? "+" : ""}${t.delta}</b> <span class="muted">${escapeHtml(t.reason)} \u00b7 ${escapeHtml(t.day)}</span><br><span class="muted">${escapeHtml(t.ref)}</span></li>`).join("\n")}</ul>`
    : `<p class="muted">No ledger rows yet.</p>`;
  return (
    staffHead(`User ${d.nickname ?? d.email}`) +
    `<h1>${escapeHtml(d.nickname ?? d.name)}</h1>
<p class="muted">${escapeHtml(d.email)} \u00b7 ${escapeHtml(d.id)}</p>
<table>
${kv("Providers", escapeHtml(d.providers.join(", ") || "\u2014"))}
${kv("Signed up", escapeHtml(fmtDate(d.createdAt)))}
${kv("Email verified", d.emailVerified ? "yes" : "no")}
${kv("Anonymous", d.isAnonymous ? "yes" : "no")}
${kv("Wallet", `<b>${d.wallet}</b> tokens (${d.dailyLeft} free left today)`)}
${kv("Readings", `${d.readings} readings \u00b7 ${d.dailies} dailies`)}
${kv("Invite code", `<b>${escapeHtml(d.inviteCode)}</b>`)}
${kv("Invited by", d.invitedBy ? escapeHtml(d.invitedBy) : "\u2014")}
${kv("Friends invited", `${d.invited} joined \u00b7 ${d.converted} converted`)}
</table>
<h2>Recent readings</h2>
${readings}
<h2>Recent transactions</h2>
${tx}` +
    staffFoot()
  );
}

const app = new Hono<{ Bindings: StaffEnv }>();

app.get("/health", (c) => c.json({ ok: true, service: "tarotnice-staff" }));

app.use("*", async (c, next) => {
  const staff = await resolveStaff(c, await accessClaims(c));
  if (!staff) {
    return c.text("Sign in via Cloudflare Access.", 401, { "Content-Type": "text/plain; charset=utf-8" });
  }
  c.set("staff" as never, staff as never);
  await next();
});

app.get("/", (c) => {
  const staff = c.get("staff" as never) as StaffIdentity;
  return c.html(shellPage(staff));
});

// User lookup: any staff role can read. Search by email, id, or nickname.
app.get("/users", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const hits = q && c.env?.DB ? await findUsers(c.env.DB, q).catch(() => []) : [];
  return c.html(renderUserSearch(q, hits));
});

app.get("/users/:id", async (c) => {
  const id = c.req.param("id");
  const detail = c.env?.DB ? await userDetail(c.env.DB, id).catch(() => null) : null;
  if (!detail) return c.text("No such user.", 404);
  return c.html(renderUserDetail(detail));
});

app.notFound((c) => c.text("Not found.", 404));

export default app;
