// Staff administration (staff.tarotnice.com). Separate worker, locked by
// Cloudflare Access in front: every request must carry a valid
// Cf-Access-Jwt-Assertion for the staff Access application, and the
// identity must map to an active staff_users row or the allowlist.
// Roles mirror blognice: read_only < support < admin.
import { Hono } from "hono";
import { and, count, desc, eq, inArray, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { d1PrefsStore } from "./db/prefs-store";
import { d1TarotStore } from "./db/tarot-store";
import { account, readings, staffAuditEvents, staffUsers, user, userPrefs } from "./db/schema";
import { bangkokDay } from "./lib/bangkok";
import { escapeHtml } from "./lib/html";
import { inviteCodeFor, inviteLinkFor } from "./lib/invite";
import { TOKENS_PER_QUESTION, walletBalance, type LedgerRow } from "./lib/wallet";

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

const STYLE = `:root{color-scheme:light;--ink:#2e2547;--muted:#6b5f85;--rule:#e3d6b8;--paper:#f6f1fa;--accent:#4a3d78;--accent-soft:#ece7f7;--card:#fff}
*{box-sizing:border-box}html{scrollbar-gutter:stable}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;overflow-y:scroll}
.staff-top{height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 28px;background:var(--card);border-bottom:1px solid var(--rule)}
.staff-brand{font-size:1.15rem;font-weight:800;color:var(--ink);text-decoration:none}
.staff-brand span{font-weight:500;color:var(--muted)}
.staff-top-meta{display:flex;align-items:center;gap:12px}
.staff-top-meta small{color:var(--muted)}
.logout{font-size:.85rem;color:var(--muted);border:1px solid var(--rule);padding:6px 10px;border-radius:7px;text-decoration:none}
.logout:hover{color:var(--ink);border-color:var(--accent)}
.staff-menu-toggle{display:none;border:1px solid var(--rule);background:var(--card);border-radius:7px;padding:6px 10px;font:inherit;cursor:pointer;color:var(--ink)}
.staff-shell{display:flex;min-height:calc(100vh - 64px)}
.staff-sidebar{width:232px;flex:0 0 232px;background:var(--card);border-right:1px solid var(--rule);padding:24px 14px}
.staff-nav{display:flex;flex-direction:column;gap:4px}
.staff-nav a,.staff-nav span.soon{padding:10px 12px;border-radius:7px;text-decoration:none}
.staff-nav a{color:var(--muted)}
.staff-nav a:hover{color:var(--ink);background:var(--paper)}
.staff-nav a.active{color:var(--accent);background:var(--accent-soft);font-weight:650}
.staff-nav span.soon{color:#a99ec4}
.staff-content{width:min(1120px,100%);margin:0 auto;padding:30px}
.staff-content a:not(.btn){color:var(--accent);text-decoration:underline;text-underline-offset:2px}
.top{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid var(--rule);padding-bottom:16px;margin-bottom:16px}
.top h1{font-size:1.25rem;margin:0}
.top small{color:var(--muted)}
h2{font-size:1.1rem;margin:22px 0 8px}
.muted{color:var(--muted)}
.card{background:var(--card);border:1px solid var(--rule);border-radius:10px;margin:14px 0;padding:18px}
.search{display:flex;gap:8px;margin:18px 0;max-width:560px}
.search input{flex:1;padding:10px 12px;border:1px solid var(--rule);border-radius:6px;font:inherit;background:#fff;color:var(--ink)}
.btn{border:1px solid var(--rule);background:#fff;border-radius:6px;padding:9px 13px;font:inherit;cursor:pointer;color:var(--ink)}
.btn:hover{border-color:var(--accent)}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--rule);vertical-align:top;overflow-wrap:anywhere}
th{font-size:.76rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.badge{display:inline-block;border-radius:999px;padding:3px 9px;font-size:.76rem;background:var(--accent-soft);color:var(--accent)}
.badge.warn{background:#fff4d6;color:#7a5b00}
.filters{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:16px 0}
.filters label{display:flex;flex-direction:column;gap:4px;font-size:.82rem;color:var(--muted)}
.filters select{padding:9px 10px;border:1px solid var(--rule);border-radius:6px;font:inherit;background:#fff;color:var(--ink)}
.pager{display:flex;gap:14px;align-items:center;margin-top:14px}
.empty{padding:26px;text-align:center;color:var(--muted)}
.staff-footer{padding:1.1rem 28px 2rem;border-top:1px solid var(--rule);display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;color:var(--muted);font-size:.82rem}
@media(max-width:760px){.staff-top{padding:0 16px}.staff-top-meta small{display:none}.staff-menu-toggle{display:block}.staff-sidebar{visibility:hidden;position:fixed;z-index:10;top:64px;bottom:0;left:0;transform:translateX(-100%);transition:transform .18s ease}.staff-sidebar.open{transform:translateX(0);visibility:visible}.staff-content{padding:22px 16px}}`;

export function shellPage(staff: StaffIdentity): string {
  const body = `<div class="top"><h1>Overview</h1><small>Signed in as ${escapeHtml(staff.email)} (${escapeHtml(staff.role)})</small></div>
<div class="card"><h2 style="margin-top:0">Tools</h2>
<ul class="tools">
<li><b><a href="/users">User lookup</a></b><br><span class="muted">Find a user, see balance and readings.</span></li>
<li><b>Token grant</b> <span class="badge">next</span><br><span class="muted">Goodwill top-ups with reason + audit.</span></li>
<li><b>Invite and referrals</b> <span class="badge">next</span><br><span class="muted">Codes, attribution, inviter rewards.</span></li>
</ul></div>`;
  return shellChrome(staff, "Overview", "/", body);
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

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/", label: "Overview" },
  { href: "/users", label: "Users" },
];
const NAV_SOON = ["Token grant", "Invite and referrals"];

function shellChrome(staff: StaffIdentity, title: string, active: string, body: string): string {
  const nav = NAV_ITEMS.map((item) => `<a href="${item.href}" data-staff-nav>${escapeHtml(item.label)}</a>`).join("") +
    NAV_SOON.map((label) => `<span class="soon">${escapeHtml(label)} (next)</span>`).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} \u00b7 TarotNice staff</title>
<style>${STYLE}</style>
</head>
<body>
<header class="staff-top"><a class="staff-brand" href="/">TarotNice <span>staff</span></a><div class="staff-top-meta"><small>${escapeHtml(staff.email)} \u00b7 ${escapeHtml(staff.role)}</small><a class="logout" href="/cdn-cgi/access/logout">Log out</a><button class="staff-menu-toggle" type="button" aria-controls="staff-sidebar" aria-expanded="false">Menu</button></div></header>
<div class="staff-shell"><aside class="staff-sidebar" id="staff-sidebar"><nav class="staff-nav" aria-label="Staff navigation">${nav}</nav></aside><div class="staff-content">${body}</div></div>
<footer class="staff-footer"><span><strong>TarotNice</strong> staff</span></footer>
<script>(function(){var path=location.pathname;document.querySelectorAll('[data-staff-nav]').forEach(function(link){var target=link.getAttribute('href')||'/';if(target==='/'?path==='/':path===target||path.indexOf(target+'/')===0)link.classList.add('active');});var toggle=document.querySelector('.staff-menu-toggle'),sidebar=document.getElementById('staff-sidebar');if(toggle&&sidebar){toggle.addEventListener('click',function(){var open=sidebar.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));});}})();</script>
</body>
</html>`;
}

export function renderUserSearch(staff: StaffIdentity, q: string, hits: StaffUserHit[]): string {
  const list = hits.length
    ? `<table><thead><tr><th>User</th><th>Email</th><th>Id</th></tr></thead><tbody>${hits
        .map(
          (h) =>
            `<tr><td><a href="/users/${escapeHtml(h.id)}">${escapeHtml(h.nickname || h.name || h.id)}</a></td><td>${escapeHtml(h.email)}</td><td><span class="muted">${escapeHtml(h.id)}</span></td></tr>`,
        )
        .join("")}</tbody></table>`
    : q
      ? `<div class="empty">No users found.</div>`
      : `<div class="empty">Search by email, user id, or nickname.</div>`;
  const body = `<div class="top"><h1>User lookup</h1></div>
<form method="get" action="/users" class="search">
<input type="search" name="q" value="${escapeHtml(q)}" placeholder="email, user id, or nickname" required>
<button class="btn" type="submit">Search</button>
</form>
<div class="card">${list}</div>`;
  return shellChrome(staff, "User lookup", "/users", body);
}

export function renderUserDetail(
  staff: StaffIdentity,
  d: StaffUserDetail,
  notice?: { grantError?: boolean; refundError?: boolean },
): string {
  const fmtDate = (ms: number) => (ms ? new Date(ms).toISOString().slice(0, 10) : "\u2014");
  const kv = (k: string, v: string) => `<tr><th>${escapeHtml(k)}</th><td>${v}</td></tr>`;
  const refundForm = (r: { id: string }) =>
    `<details><summary>Refund this reading</summary><form method="post" action="/users/${escapeHtml(d.id)}/readings/${escapeHtml(r.id)}/refund" class="filters"><label>Reason<input type="text" name="reason" required maxlength="500" placeholder="Why is this refunded?"></label><button class="btn" type="submit">Refund +5 tokens</button></form></details>`;
  const readings = d.recentReadings.length
    ? `<ul class="tools">${d.recentReadings
        .map(
          (r) =>
            `<li><b>${escapeHtml(r.topic)}</b> <span class="muted">${escapeHtml(r.day)} \u00b7 ${escapeHtml(r.lang)} \u00b7 ${escapeHtml(r.status)}</span><br><span class="muted">${escapeHtml(r.question)}</span>` +
            (r.status === "complete" ? "" : refundForm(r)) +
            `</li>`,
        )
        .join("\n")}</ul>`
    : `<p class="muted">No readings yet.</p>`;const tx = d.recentTx.length
    ? `<ul class="tools">${d.recentTx.map((t) => `<li><b>${t.delta > 0 ? "+" : ""}${t.delta}</b> <span class="muted">${escapeHtml(t.reason)} \u00b7 ${escapeHtml(t.day)}</span><br><span class="muted">${escapeHtml(t.ref)}</span></li>`).join("\n")}</ul>`
    : `<p class="muted">No ledger rows yet.</p>`;
  const statusBadges =
    `${d.emailVerified ? '<span class="badge">verified</span>' : '<span class="badge warn">unverified</span>'}` +
    `${d.isAnonymous ? ' <span class="badge warn">anonymous</span>' : ""}`;
  return shellChrome(
    staff,
    `User ${d.nickname ?? d.email}`,
    "/users",
    `<div class="top"><h1>${escapeHtml(d.nickname ?? d.name)}</h1><small>${escapeHtml(d.email)} \u00b7 ${escapeHtml(d.id)}</small></div>
<div class="card"><table>
${kv("Providers", escapeHtml(d.providers.join(", ") || "\u2014"))}
${kv("Signed up", escapeHtml(fmtDate(d.createdAt)))}
${kv("Wallet", `<b>${d.wallet}</b> tokens (${d.dailyLeft} free left today)`)}
${kv("Readings", `${d.readings} readings \u00b7 ${d.dailies} dailies`)}
${kv("Invite code", `<b>${escapeHtml(d.inviteCode)}</b>`)}
${kv("Invited by", d.invitedBy ? escapeHtml(d.invitedBy) : "\u2014")}
${kv("Friends invited", `${d.invited} joined \u00b7 ${d.converted} converted`)}
</table><p>${statusBadges}</p></div>
<div class="card"><h2 style="margin-top:0">Grant tokens</h2>
${notice?.grantError ? `<p class="muted">Grant failed: check the amount (1-1000) and include a reason.</p>` : ""}
<form method="post" action="/users/${escapeHtml(d.id)}/grant" class="filters">
<label>Amount (tokens)<input type="number" name="amount" min="1" max="1000" required></label>
<label>Reason (required)<input type="text" name="reason" required maxlength="500" placeholder="Why these tokens?"></label>
<label>Note to customer (optional)<input type="text" name="note" maxlength="500"></label>
<button class="btn" type="submit">Grant</button>
</form></div>
${notice?.refundError ? `<div class="card"><p class="muted">Refund failed: delivered readings cannot be refunded, and a reason is always required.</p></div>` : ""}
<div class="card"><h2 style="margin-top:0">Recent readings</h2>
${readings}</div>
<div class="card"><h2 style="margin-top:0">Recent transactions</h2>
${tx}</div>`,
  );
}

export const USER_LIST_PAGE_SIZE = 20;
const USER_LIST_PROVIDERS = ["google", "line", "credential"] as const;

export type UserListParams = {
  provider: string;
  verified: string;
  anonymous: string;
  activity: string;
  sort: string;
  page: number;
};

export type UserListRow = {
  id: string;
  email: string;
  name: string;
  nickname: string | null;
  createdAt: number;
  emailVerified: boolean;
  isAnonymous: boolean;
  providers: string[];
  readingCount: number;
};

export type UserList = { rows: UserListRow[]; page: number; pages: number; total: number };

function oneOf(raw: string | undefined, allowed: readonly string[], fallback: string): string {
  const v = (raw ?? "").trim().toLowerCase();
  return (allowed as readonly string[]).includes(v) ? v : fallback;
}

/** Validate list query params; unknown values fall back to defaults. */
export function parseUserListParams(query: (name: string) => string | undefined): UserListParams {
  const pageRaw = Number(query("page"));
  return {
    provider: oneOf(query("provider"), ["all", ...USER_LIST_PROVIDERS], "all"),
    verified: oneOf(query("verified"), ["all", "yes", "no"], "all"),
    anonymous: oneOf(query("anonymous"), ["all", "yes", "no"], "all"),
    activity: oneOf(query("activity"), ["all", "readers", "none"], "all"),
    sort: oneOf(query("sort"), ["newest", "oldest", "readings"], "newest"),
    page: Number.isSafeInteger(pageRaw) && pageRaw >= 0 && pageRaw <= 100000 ? pageRaw : 0,
  };
}

/** Paginated staff directory with filters; one query for the page plus batched lookups. */
export async function listUsers(db: D1Database, params: UserListParams): Promise<UserList> {
  const orm = drizzle(db);
  const rc = orm
    .select({ userId: readings.userId, n: sql<number>`count(*)`.mapWith(Number).as("n") })
    .from(readings)
    .groupBy(readings.userId)
    .as("rc");
  const conds = [];
  if (params.provider !== "all") {
    conds.push(
      inArray(
        user.id,
        orm.select({ uid: account.userId }).from(account).where(eq(account.providerId, params.provider)),
      ),
    );
  }
  if (params.verified !== "all") conds.push(sql`${user.emailVerified} = ${params.verified === "yes" ? 1 : 0}`);
  if (params.anonymous !== "all") conds.push(sql`${user.isAnonymous} = ${params.anonymous === "yes" ? 1 : 0}`);
  if (params.activity === "readers") conds.push(sql`${rc.n} > 0`);
  if (params.activity === "none") conds.push(sql`${rc.n} IS NULL`);
  const where = conds.length ? and(...conds) : undefined;
  const order =
    params.sort === "oldest"
      ? [sql`${user.createdAt} ASC`, sql`${user.id} ASC`]
      : params.sort === "readings"
        ? [sql`${rc.n} DESC`, sql`${user.createdAt} DESC`, sql`${user.id} DESC`]
        : [sql`${user.createdAt} DESC`, sql`${user.id} DESC`];
  const offset = params.page * USER_LIST_PAGE_SIZE;
  const [pageRows, totalRows] = await Promise.all([
    orm
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        emailVerified: user.emailVerified,
        isAnonymous: user.isAnonymous,
        nickname: userPrefs.nickname,
        readingCount: sql<number | null>`${rc.n}`,
      })
      .from(user)
      .leftJoin(userPrefs, eq(userPrefs.userId, user.id))
      .leftJoin(rc, eq(rc.userId, user.id))
      .where(where)
      .orderBy(...order)
      .limit(USER_LIST_PAGE_SIZE)
      .offset(offset),
    orm
      .select({ total: count() })
      .from(user)
      .leftJoin(rc, eq(rc.userId, user.id))
      .where(where),
  ]);
  // Providers per user on this page (batched; a user can link several).
  const ids = pageRows.map((r) => r.id);
  const acctRows = ids.length
    ? await orm
        .select({ userId: account.userId, providerId: account.providerId })
        .from(account)
        .where(inArray(account.userId, ids))
    : [];
  const providersById = new Map<string, string[]>();
  for (const a of acctRows) {
    const list = providersById.get(a.userId) ?? [];
    if (!list.includes(a.providerId)) list.push(a.providerId);
    providersById.set(a.userId, list);
  }
  const total = totalRows[0]?.total ?? 0;
  return {
    rows: pageRows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      nickname: r.nickname,
      createdAt: r.createdAt instanceof Date ? r.createdAt.getTime() : Number(r.createdAt),
      emailVerified: r.emailVerified === true,
      isAnonymous: r.isAnonymous === true,
      providers: providersById.get(r.id) ?? [],
      readingCount: Number(r.readingCount ?? 0),
    })),
    page: params.page,
    pages: Math.max(1, Math.ceil(total / USER_LIST_PAGE_SIZE)),
    total,
  };
}

function userListQuery(params: UserListParams, overrides: Partial<UserListParams>): string {
  const merged = { ...params, ...overrides };
  const sp = new URLSearchParams();
  sp.set("provider", merged.provider);
  sp.set("verified", merged.verified);
  sp.set("anonymous", merged.anonymous);
  sp.set("activity", merged.activity);
  sp.set("sort", merged.sort);
  sp.set("page", String(merged.page));
  return `/users?${sp.toString()}`;
}

export function renderUserList(staff: StaffIdentity, params: UserListParams, list: UserList | null): string {
  const opt = (value: string, label: string, current: string) =>
    `<option value="${value}"${value === current ? " selected" : ""}>${escapeHtml(label)}</option>`;
  const sel = (name: string, current: string, options: [string, string][]) =>
    `<label>${escapeHtml(name)}<select name="${name}">${options.map(([v, l]) => opt(v, l, current)).join("")}</select></label>`;
  const body = !list
    ? `<div class="empty">Directory unavailable.</div>`
    : list.rows.length
      ? `<table class="grid"><thead><tr><th>User</th><th>Signed up</th><th>Providers</th><th>Readings</th></tr></thead><tbody>${list.rows
          .map(
            (r) =>
              `<tr><td><a href="/users/${escapeHtml(r.id)}">${escapeHtml(r.nickname || r.name || r.id)}</a><br><span class="muted">${escapeHtml(r.email)}</span></td>` +
              `<td>${escapeHtml(r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "\u2014")}${r.emailVerified ? "" : " (unverified)"}${r.isAnonymous ? " (anon)" : ""}</td>` +
              `<td>${escapeHtml(r.providers.join(", ") || "\u2014")}</td>` +
              `<td>${r.readingCount}</td></tr>`,
          )
          .join("")}</tbody></table>
      <div class="pager">${
        list.page > 0 ? `<a href="${userListQuery(params, { page: list.page - 1 })}">\u2039 Newer</a>` : `<span class="muted">\u2039 Newer</span>`
      }<span class="muted">Page ${list.page + 1} of ${list.pages} (${list.total} users)</span>${
        list.page + 1 < list.pages ? `<a href="${userListQuery(params, { page: list.page + 1 })}">Older \u203a</a>` : `<span class="muted">Older \u203a</span>`
      }</div>`
      : `<div class="empty">No users match these filters.</div>`;
  return shellChrome(
    staff,
    "Users",
    "/users",
    `<div class="top"><h1>Users</h1><small>${list ? `${list.total} total` : ""}</small></div>
<form method="get" action="/users" class="search">
<input type="search" name="q" placeholder="email, user id, or nickname">
<button class="btn" type="submit">Search</button>
</form>
<form method="get" action="/users" class="filters">
${sel("provider", params.provider, [["all", "All providers"], ["google", "Google"], ["line", "LINE"], ["credential", "Email + password"]])}
${sel("verified", params.verified, [["all", "All"], ["yes", "Verified"], ["no", "Unverified"]])}
${sel("anonymous", params.anonymous, [["all", "All"], ["yes", "Anonymous"], ["no", "Registered"]])}
${sel("activity", params.activity, [["all", "All"], ["readers", "Has readings"], ["none", "No readings"]])}
${sel("sort", params.sort, [["newest", "Newest first"], ["oldest", "Oldest first"], ["readings", "Most readings"]])}
<button class="btn" type="submit">Apply</button>
</form>
<div class="card">${body}</div>`,
  );
}

export type AuditEntry = {
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  result: "ok" | "denied" | "failed";
  before?: unknown;
  after?: unknown;
};

/** Write one audit row: who did what to whom, when, why, before/after. */
export async function recordAudit(
  db: D1Database,
  staff: StaffIdentity,
  entry: AuditEntry,
): Promise<void> {
  const orm = drizzle(db);
  await orm.insert(staffAuditEvents).values({
    id: crypto.randomUUID(),
    occurredAt: Date.now(),
    subject: staff.subject,
    email: staff.email,
    role: staff.role,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    reason: entry.reason,
    result: entry.result,
    requestId: null,
    beforeJson: entry.before === undefined ? null : JSON.stringify(entry.before),
    afterJson: entry.after === undefined ? null : JSON.stringify(entry.after),
  });
}

export type GrantInput = { amount: number; reason: string; note: string };

async function readInput(c: {
  req: {
    header: (n: string) => string | undefined;
    json: () => Promise<unknown>;
    parseBody: () => Promise<Record<string, string | File>>;
  };
}): Promise<Record<string, unknown>> {
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = await c.req.json();
      return (body ?? {}) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  try {
    return (await c.req.parseBody()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function wantsJson(c: { req: { header: (n: string) => string | undefined } }): boolean {
  return (c.req.header("content-type") ?? "").includes("application/json");
}

/** Validate a token grant: amount 1..1000, reason required, note optional. */
export function parseGrantInput(body: { amount?: unknown; reason?: unknown; note?: unknown }): GrantInput | { error: string } {
  const amount = typeof body.amount === "string" && body.amount.trim() !== "" ? Number(body.amount) : body.amount;
  if (!Number.isSafeInteger(amount) || (amount as number) < 1 || (amount as number) > 1000) {
    return { error: "Amount must be a whole number of tokens between 1 and 1000." };
  }
  const reason = String(body.reason ?? "").trim();
  if (!reason) return { error: "A reason is required for every grant." };
  if (reason.length > 500) return { error: "Reason is too long (max 500 characters)." };
  const note = String(body.note ?? "").trim();
  if (note.length > 500) return { error: "Note is too long (max 500 characters)." };
  return { amount: amount as number, reason, note };
}

async function walletOf(db: D1Database, userId: string): Promise<number> {
  const store = d1TarotStore(db);
  const rows = await store.ledgerRows(userId).catch(() => []);
  const balance = walletBalance(
    rows.map((r): LedgerRow => ({
      delta: r.delta,
      reason: r.reason as LedgerRow["reason"],
      source: (r.source as LedgerRow["source"]) ?? null,
      day: r.day,
      createdAt: r.createdAt,
    })),
    bangkokDay(),
  );
  return balance.wallet;
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
  const staff = c.get("staff" as never) as StaffIdentity;
  const q = (c.req.query("q") ?? "").trim();
  if (q) {
    const hits = c.env?.DB ? await findUsers(c.env.DB, q).catch(() => []) : [];
    return c.html(renderUserSearch(staff, q, hits));
  }
  const params = parseUserListParams((name) => c.req.query(name));
  const list = c.env?.DB ? await listUsers(c.env.DB, params).catch(() => null) : null;
  return c.html(renderUserList(staff, params, list));
});

app.get("/users/:id", async (c) => {
  const id = c.req.param("id");
  const detail = c.env?.DB ? await userDetail(c.env.DB, id).catch(() => null) : null;
  if (!detail) return c.text("No such user.", 404);
  const staff = c.get("staff" as never) as StaffIdentity;
  return c.html(
    renderUserDetail(staff, detail, {
      grantError: c.req.query("grantError") === "1",
      refundError: c.req.query("refundError") === "1",
    }),
  );
});

// Token grant (support+). Amount + required reason; the customer note
// lives in the audit log (ledger rows carry no free text).
app.post("/users/:id/grant", async (c) => {
  const staff = c.get("staff" as never) as StaffIdentity;
  if (!canMutate(staff)) return c.text("Support role or above required.", 403);
  const userId = c.req.param("id");
  const body = await readInput(c as never);
  const parsed = parseGrantInput(body);
  if ("error" in parsed) {
    if (wantsJson(c)) return c.json({ error: parsed.error }, 400);
    return c.redirect(`/users/${encodeURIComponent(userId)}?grantError=1`, 302);
  }
  if (!c.env?.DB) return c.json({ error: "unavailable" }, 503);
  const store = d1TarotStore(c.env.DB);
  const before = await walletOf(c.env.DB, userId);
  const granted = await store
    .postLedger({
      userId,
      delta: parsed.amount,
      reason: "staff_grant",
      ref: `staff-grant:${crypto.randomUUID()}`,
      day: bangkokDay(),
    })
    .catch(() => false);
  if (!granted) {
    await recordAudit(c.env.DB, staff, {
      action: "token.grant",
      targetType: "user",
      targetId: userId,
      reason: parsed.reason,
      result: "failed",
      before: { wallet: before },
    }).catch(() => {});
    return c.json({ error: "grant_failed" }, 500);
  }
  const after = await walletOf(c.env.DB, userId);
  await recordAudit(c.env.DB, staff, {
    action: "token.grant",
    targetType: "user",
    targetId: userId,
    reason: parsed.reason,
    result: "ok",
    before: { wallet: before },
    after: { wallet: after, granted: parsed.amount, note: parsed.note || null },
  }).catch(() => {});
  if (!wantsJson(c)) return c.redirect(`/users/${encodeURIComponent(userId)}`, 302);
  return c.json({ ok: true, granted: parsed.amount, wallet: after });
});

// Refund one reading (support+). Only undelivered readings (drawn/failed)
// can be refunded; delivered readings are refused. Idempotent per reading.
app.post("/users/:id/readings/:readingId/refund", async (c) => {
  const staff = c.get("staff" as never) as StaffIdentity;
  if (!canMutate(staff)) return c.text("Support role or above required.", 403);
  const userId = c.req.param("id");
  const readingId = c.req.param("readingId");
  const body = await readInput(c as never);
  const reason = String(body.reason ?? "").trim();
  if (!reason) {
    if (wantsJson(c)) return c.json({ error: "A reason is required for every refund." }, 400);
    return c.redirect(`/users/${encodeURIComponent(userId)}?refundError=1`, 302);
  }
  if (!c.env?.DB) return c.json({ error: "unavailable" }, 503);
  const store = d1TarotStore(c.env.DB);
  const reading = await store.getReading(readingId).catch(() => null);
  if (!reading || reading.userId !== userId) {
    if (wantsJson(c)) return c.json({ error: "unknown_reading" }, 404);
    return c.text("No such reading.", 404);
  }
  if (reading.status === "complete") {
    await recordAudit(c.env.DB, staff, {
      action: "reading.refund",
      targetType: "reading",
      targetId: readingId,
      reason,
      result: "denied",
      before: { status: reading.status },
    }).catch(() => {});
    if (wantsJson(c)) return c.json({ error: "already_delivered" }, 409);
    return c.redirect(`/users/${encodeURIComponent(userId)}?refundError=1`, 302);
  }
  const before = await walletOf(c.env.DB, userId);
  const granted = await store
    .postLedger({
      userId,
      delta: TOKENS_PER_QUESTION,
      reason: "refund",
      ref: readingId,
      day: bangkokDay(),
    })
    .catch(() => false);
  if (!granted) {
    if (wantsJson(c)) return c.json({ ok: true, alreadyRefunded: true });
    return c.redirect(`/users/${encodeURIComponent(userId)}`, 302);
  }
  await store.setReadingResult(readingId, { aiText: "", aiSummary: "", model: "", status: "failed" }).catch(() => {});
  const after = await walletOf(c.env.DB, userId);
  await recordAudit(c.env.DB, staff, {
    action: "reading.refund",
    targetType: "reading",
    targetId: readingId,
    reason,
    result: "ok",
    before: { status: reading.status, wallet: before },
    after: { status: "failed", wallet: after, refunded: TOKENS_PER_QUESTION },
  }).catch(() => {});
  if (!wantsJson(c)) return c.redirect(`/users/${encodeURIComponent(userId)}`, 302);
  return c.json({ ok: true, refunded: TOKENS_PER_QUESTION, wallet: after });
});

app.notFound((c) => c.text("Not found.", 404));

export default app;
