// Staff administration (staff.tarotnice.com). Separate worker, locked by
// Cloudflare Access in front: every request must carry a valid
// Cf-Access-Jwt-Assertion for the staff Access application, and the
// identity must map to an active staff_users row or the allowlist.
// Roles mirror blognice: read_only < support < admin.
import { Hono, type Context } from "hono";
import { summarizeAffiliatePayments, formatMinor, type AffiliatePayment } from "./lib/affiliate";
import { and, count, desc, eq, inArray, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { d1PrefsStore } from "./db/prefs-store";
import { d1TarotStore } from "./db/tarot-store";
import {
  account,
  badgeShares,
  dailyDraws,
  inviteCodes,
  lineFriends,
  readings,
  redeemRedemptions,
  session,
  shares,
  staffAuditEvents,
  staffUsers,
  stripeCustomers,
  stripeEvents,
  tokenLedger,
  user,
  userPrefs,
} from "./db/schema";
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
<li><b><a href="/stuck">Stuck readings</a></b><br><span class="muted">Failed and abandoned draws; refund with a reason.</span></li>
<li><b><a href="/grants">Token grants</a></b><br><span class="muted">Find a user to grant to; every grant and its reason, audited.</span></li>
<li><b><a href="/invites">Invites</a></b><br><span class="muted">Codes, attribution, and inviter rewards per user.</span></li>
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
  { href: "/stuck", label: "Stuck readings" },
  { href: "/affiliates", label: "Affiliates" },
  { href: "/grants", label: "Token grants" },
  { href: "/invites", label: "Invites" },
];

function shellChrome(staff: StaffIdentity, title: string, active: string, body: string): string {
  const nav = NAV_ITEMS.map((item) => `<a href="${item.href}" data-staff-nav>${escapeHtml(item.label)}</a>`).join("");
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
</table><p>${statusBadges}</p>${staff.role === "admin" ? `<p><a href="/users/${escapeHtml(d.id)}/merge">Merge into another account</a></p>` : ""}</div>
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

/** Per-action grant cap for support staff; admins are unlimited. */
export const SUPPORT_GRANT_CAP = 20;

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

export type MergeInput = { target: string; reason: string; confirmEmail: string };

/** Validate merge intent: a different target, a reason, and the source email retyped. */
export function parseMergeInput(
  body: { target?: unknown; reason?: unknown; confirmEmail?: unknown },
  sourceEmail: string,
): MergeInput | { error: string } {
  const target = String(body.target ?? "").trim();
  if (!target) return { error: "Pick the account to merge into (id or email)." };
  const reason = String(body.reason ?? "").trim();
  if (!reason) return { error: "A reason is required for every merge." };
  if (reason.length > 500) return { error: "Reason is too long (max 500 characters)." };
  const confirmEmail = String(body.confirmEmail ?? "").trim();
  if (confirmEmail.toLowerCase() !== sourceEmail.trim().toLowerCase() || !confirmEmail) {
    return { error: "Type the source account email exactly to confirm." };
  }
  return { target, reason, confirmEmail };
}

export type MergeReport = {
  moved: Record<string, number>;
  dropped: Record<string, number>;
  makeup: number;
  walletBeforeA: number;
  walletBeforeB: number;
  walletAfterB: number;
};

/**
 * Merge duplicate A into keeper B, then delete A. Referrals are history
 * and stay untouched. Tables with per-user unique rows keep B's copy;
 * dropped ledger value returns to B as one makeup grant, so the merged
 * balance is exactly A + B.
 */
export async function mergeUsers(db: D1Database, aId: string, bId: string): Promise<MergeReport> {
  if (aId === bId) throw new Error("same_user");
  const orm = drizzle(db);
  const moved: Record<string, number> = {};
  const dropped: Record<string, number> = {};
  const bump = (m: Record<string, number>, k: string, n = 1) => {
    m[k] = (m[k] ?? 0) + n;
  };

  const walletBeforeA = await walletOf(db, aId);
  const walletBeforeB = await walletOf(db, bId);

  // Simple reassignments: globally unique primary keys, no conflicts.
  type IdRow = { id: string };
  async function idsOf(ref: any, userCol: any): Promise<string[]> {
    const rows = (await orm.select({ id: (ref as any).id }).from(ref).where(eq(userCol, aId)).catch(() => [])) as IdRow[];
    return rows.map((r) => r.id);
  }

  async function moveById(tableName: string, ref: any, idCol: any): Promise<void> {
    for (const id of await idsOf(ref, (ref as any).userId)) {
      try {
        await orm.update(ref).set({ userId: bId }).where(eq(idCol, id));
        bump(moved, tableName);
      } catch {
        bump(dropped, tableName);
      }
    }
  }

  await moveById("readings", readings, readings.id);
  await moveById("badge_shares", badgeShares, badgeShares.shareId);
  await moveById("shares", shares, shares.id);
  await moveById("stripe_events", stripeEvents, stripeEvents.id);

  // redeem_redemptions: unique (code, user) — drop A's when B already has it.
  for (const id of await idsOf(redeemRedemptions, redeemRedemptions.userId)) {
    try {
      await orm.update(redeemRedemptions).set({ userId: bId }).where(eq(redeemRedemptions.id, id));
      bump(moved, "redeem_redemptions");
    } catch {
      await orm.delete(redeemRedemptions).where(eq(redeemRedemptions.id, id)).catch(() => {});
      bump(dropped, "redeem_redemptions");
    }
  }

  // daily_draws: unique (user, day) — drop A's day when B drew the same day.
  {
    const rows = (await orm
      .select({ day: dailyDraws.bangkokDay })
      .from(dailyDraws)
      .where(eq(dailyDraws.userId, aId))
      .catch(() => [])) as { day: string }[];
    for (const r of rows) {
      try {
        await orm
          .update(dailyDraws)
          .set({ userId: bId })
          .where(and(eq(dailyDraws.userId, aId), eq(dailyDraws.bangkokDay, r.day)));
        bump(moved, "daily_draws");
      } catch {
        await orm
          .delete(dailyDraws)
          .where(and(eq(dailyDraws.userId, aId), eq(dailyDraws.bangkokDay, r.day)))
          .catch(() => {});
        bump(dropped, "daily_draws");
      }
    }
  }

  // lineFriends: PK is the LINE id — just reassign.
  await moveById("line_friends", lineFriends, lineFriends.lineUserId);

  // Ledger: PK id, unique (user, reason, ref). Dropped value comes back
  // as one makeup grant so B's balance still grows by exactly A's.
  let droppedSum = 0;
  {
    const rows = (await orm
      .select({ id: tokenLedger.id, delta: tokenLedger.delta })
      .from(tokenLedger)
      .where(eq(tokenLedger.userId, aId))
      .catch(() => [])) as { id: string; delta: number }[];
    for (const r of rows) {
      try {
        await orm.update(tokenLedger).set({ userId: bId }).where(eq(tokenLedger.id, r.id));
        bump(moved, "token_ledger");
      } catch {
        await orm.delete(tokenLedger).where(eq(tokenLedger.id, r.id)).catch(() => {});
        droppedSum += r.delta;
        bump(dropped, "token_ledger");
      }
    }
  }

  // Per-user singletons: keep B's copy, drop A's.
  for (const [tableName, ref] of [["user_prefs", userPrefs], ["invite_codes", inviteCodes], ["stripe_customers", stripeCustomers]] as const) {
    const hasB = (
      (await orm.select({ id: (ref as any).userId }).from(ref).where(eq((ref as any).userId, bId)).limit(1).catch(() => [])) as unknown[]
    ).length > 0;
    if (hasB) {
      await orm.delete(ref).where(eq((ref as any).userId, aId)).catch(() => {});
      bump(dropped, tableName);
    } else {
      await orm.update(ref).set({ userId: bId }).where(eq((ref as any).userId, aId)).catch(() => {});
      bump(moved, tableName);
    }
  }

  // Providers: move A's logins except ones B already linked.
  {
    const bProviders = new Set(
      ((await orm.select({ providerId: account.providerId }).from(account).where(eq(account.userId, bId)).catch(() => [])) as { providerId: string }[]).map(
        (r) => r.providerId,
      ),
    );
    const aRows = (await orm
      .select({ id: account.id, providerId: account.providerId })
      .from(account)
      .where(eq(account.userId, aId))
      .catch(() => [])) as { id: string; providerId: string }[];
    for (const r of aRows) {
      if (bProviders.has(r.providerId)) {
        await orm.delete(account).where(eq(account.id, r.id)).catch(() => {});
        bump(dropped, "account");
      } else {
        await orm.update(account).set({ userId: bId }).where(eq(account.id, r.id)).catch(() => {});
        bump(moved, "account");
      }
    }
  }

  // A's sessions die with the merge; A must not stay signed in anywhere.
  await orm.delete(session).where(eq(session.userId, aId)).catch(() => {});
  // Delete A's row last, after every child moved away or dropped.
  await orm.delete(user).where(eq(user.id, aId));

  let makeup = 0;
  if (droppedSum !== 0) {
    const ok = await d1TarotStore(db)
      .postLedger({ userId: bId, delta: droppedSum, reason: "staff_grant", ref: `merge-makeup:${aId}`, day: bangkokDay() })
      .catch(() => false);
    if (ok) makeup = droppedSum;
  }

  const walletAfterB = await walletOf(db, bId);
  return { moved, dropped, makeup, walletBeforeA, walletBeforeB, walletAfterB };
}

export function renderMergeForm(staff: StaffIdentity, d: StaffUserDetail): string {
  return shellChrome(
    staff,
    `Merge ${d.nickname ?? d.email}`,
    "/users",
    `<div class="top"><h1>Merge into another account</h1><small>source: ${escapeHtml(d.email)} \u00b7 ${escapeHtml(d.id)}</small></div>
<div class="card"><p>This moves everything from <b>${escapeHtml(d.email)}</b> into the keeper account, then <b>deletes</b> this row. Referral history stays untouched.</p>
<form method="get" action="/users/${escapeHtml(d.id)}/merge" class="filters">
<label>Keeper account (id or email)<input type="text" name="target" required placeholder="user id or email"></label>
<label>Reason (required)<input type="text" name="reason" required maxlength="500" placeholder="Why merge these accounts?"></label>
<button class="btn" type="submit">Preview merge</button>
</form></div>`,
  );
}

export function renderMergePreview(
  staff: StaffIdentity,
  a: StaffUserDetail,
  b: StaffUserDetail,
  reason: string,
  targetRaw: string,
): string {
  const row = (k: string, x: string, y: string) => `<tr><th>${escapeHtml(k)}</th><td>${x}</td><td>${y}</td></tr>`;
  const cell = (d: StaffUserDetail) =>
    `${escapeHtml(d.nickname ?? d.name)}<br><span class="muted">${escapeHtml(d.email)}<br>${escapeHtml(d.id)}</span>`;
  return shellChrome(
    staff,
    `Confirm merge`,
    "/users",
    `<div class="top"><h1>Confirm merge</h1><small>irreversible: the source row is deleted</small></div>
<div class="card"><table><thead><tr><th></th><th>Source (deleted after)</th><th>Keeper</th></tr></thead><tbody>
${row("Account", cell(a), cell(b))}
${row("Providers", escapeHtml(a.providers.join(", ") || "\u2014"), escapeHtml(b.providers.join(", ") || "\u2014"))}
${row("Wallet", `${a.wallet} tokens`, `${b.wallet} tokens \u2192 about ${a.wallet + b.wallet} after`)}
${row("Readings", `${a.readings}`, `${b.readings}`)}
${row("Invite code", escapeHtml(a.inviteCode), escapeHtml(b.inviteCode))}
</tbody></table>
<p><span class="muted">Reason:</span> ${escapeHtml(reason)}</p>
<form method="post" action="/users/${escapeHtml(a.id)}/merge" class="filters">
<input type="hidden" name="target" value="${escapeHtml(targetRaw)}">
<input type="hidden" name="reason" value="${escapeHtml(reason)}">
<label>Type the source email to confirm<input type="text" name="confirmEmail" required autocomplete="off" placeholder="${escapeHtml(a.email)}"></label>
<button class="btn" type="submit">Merge and delete source</button>
</form></div>`,
  );
}

export type StuckReading = {
  id: string;
  userId: string;
  email: string;
  nickname: string | null;
  day: string;
  topic: string;
  lang: string;
  model: string | null;
  status: string;
  createdAt: number;
  stuckMinutes: number;
  charged: number;
  refunded: boolean;
};

const STUCK_AFTER_MS = 2 * 60 * 1000;
const FAILED_WINDOW_MS = 7 * 24 * 3600 * 1000;

/** Safety-net queue: drawn readings stuck past 2 minutes, plus recent failures. */
export async function listStuckReadings(db: D1Database, now = Date.now()): Promise<StuckReading[]> {
  const orm = drizzle(db);
  const cutoff = now - STUCK_AFTER_MS;
  const rows = (await orm
    .select({
      id: readings.id,
      userId: readings.userId,
      day: readings.bangkokDay,
      topic: readings.topic,
      lang: readings.lang,
      model: readings.model,
      status: readings.status,
      createdAt: readings.createdAt,
    })
    .from(readings)
    .where(
      sql`(${readings.status} = 'drawn' and ${readings.createdAt} < ${cutoff}) or (${readings.status} = 'failed' and ${readings.createdAt} > ${now - FAILED_WINDOW_MS})`,
    )
    .orderBy(sql`${readings.createdAt} ASC`)
    .limit(100)
    .catch(() => [])) as {
    id: string; userId: string; day: string; topic: string; lang: string;
    model: string | null; status: string; createdAt: number;
  }[];
  if (!rows.length) return [];
  const ids = [...new Set(rows.map((r) => r.id))];
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const [users, prefs, spends, refunds] = await Promise.all([
    orm.select({ id: user.id, email: user.email }).from(user).where(inArray(user.id, userIds)).catch(() => [] as { id: string; email: string }[]),
    orm.select({ userId: userPrefs.userId, nickname: userPrefs.nickname }).from(userPrefs).where(inArray(userPrefs.userId, userIds)).catch(() => [] as { userId: string; nickname: string | null }[]),
    orm.select({ ref: tokenLedger.ref, delta: tokenLedger.delta }).from(tokenLedger).where(and(eq(tokenLedger.reason, "reading"), inArray(tokenLedger.ref, ids))).catch(() => [] as { ref: string; delta: number }[]),
    orm.select({ ref: tokenLedger.ref }).from(tokenLedger).where(and(eq(tokenLedger.reason, "refund"), inArray(tokenLedger.ref, ids))).catch(() => [] as { ref: string }[]),
  ]);
  const emailById = new Map(users.map((u) => [u.id, u.email]));
  const nickById = new Map(prefs.map((r) => [r.userId, r.nickname]));
  const chargedByRef = new Map(spends.map((r) => [r.ref, r.delta]));
  const refundedRefs = new Set(refunds.map((r) => r.ref));
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    email: emailById.get(r.userId) ?? r.userId,
    nickname: nickById.get(r.userId) ?? null,
    day: r.day,
    topic: r.topic,
    lang: r.lang,
    model: r.model,
    status: r.status,
    createdAt: r.createdAt,
    stuckMinutes: Math.max(0, Math.floor((now - r.createdAt) / 60000)),
    charged: -(chargedByRef.get(r.id) ?? 0),
    refunded: refundedRefs.has(r.id),
  }));
}

export function renderStuckPage(
  staff: StaffIdentity,
  rows: StuckReading[],
  notice?: { refunded?: number; failed?: number },
): string {
  const fmtDate = (ms: number) => (ms ? new Date(ms).toISOString().slice(0, 16).replace("T", " ") : "\u2014");
  const body = rows.length
    ? `<form method="post" action="/stuck/refund"><table><thead><tr><th></th><th>User</th><th>When (UTC)</th><th>Stuck</th><th>Lang</th><th>Topic</th><th>Charged</th><th>Status</th><th></th></tr></thead><tbody>${rows
        .map(
          (r) =>
            `<tr><td>${r.status === "drawn" && !r.refunded ? `<input type="checkbox" name="ids" value="${escapeHtml(r.id)}">` : ""}</td>` +
            `<td><a href="/users/${escapeHtml(r.userId)}">${escapeHtml(r.nickname ?? r.email)}</a></td>` +
            `<td>${escapeHtml(fmtDate(r.createdAt))}</td>` +
            `<td>${r.stuckMinutes}m</td>` +
            `<td>${escapeHtml(r.lang)}</td>` +
            `<td>${escapeHtml(r.topic)}</td>` +
            `<td>${r.charged}</td>` +
            `<td>${escapeHtml(r.status)}${r.refunded ? ' <span class="badge">refunded</span>' : ""}</td>` +
            `<td>${r.refunded ? "" : `<a href="/users/${escapeHtml(r.userId)}">open</a>`}</td></tr>`,
        )
        .join("")}</tbody></table>
<div class="filters"><label>Reason (required)<input type="text" name="reason" required maxlength="500" placeholder="Why are these refunded?"></label><button class="btn" type="submit">Refund selected</button></div></form>`
    : `<div class="empty">No stuck readings. The queue is clear.</div>`;
  const note = notice
    ? `<div class="card"><p class="muted">Refunded ${notice.refunded ?? 0} reading(s)${notice.failed ? `, ${notice.failed} failed` : ""}.</p></div>`
    : "";
  return shellChrome(
    staff,
    "Stuck readings",
    "/stuck",
    `<div class="top"><h1>Stuck readings</h1><small>drawn &gt; 2 min old, failures from the last 7 days</small></div>${note}<div class="card">${body}</div>`,
  );
}

export type GrantAuditRow = {
  id: string;
  occurredAt: number;
  subject: string;
  email: string;
  targetId: string;
  reason: string | null;
  result: string;
  amount: number | null;
  note: string | null;
};

/** Latest token.grant audit rows, newest first. */
export async function recentGrants(db: D1Database, limit = 50): Promise<GrantAuditRow[]> {
  const orm = drizzle(db);
  const rows = await orm
    .select({
      id: staffAuditEvents.id,
      occurredAt: staffAuditEvents.occurredAt,
      subject: staffAuditEvents.subject,
      email: staffAuditEvents.email,
      targetId: staffAuditEvents.targetId,
      reason: staffAuditEvents.reason,
      result: staffAuditEvents.result,
      afterJson: staffAuditEvents.afterJson,
    })
    .from(staffAuditEvents)
    .where(eq(staffAuditEvents.action, "token.grant"))
    .orderBy(desc(staffAuditEvents.occurredAt))
    .limit(Math.max(1, Math.min(100, limit)))
    .catch(() => []);
  return (rows as unknown as {
    id: string; occurredAt: number; subject: string; email: string; targetId: string;
    reason: string | null; result: string; afterJson: string | null;
  }[]).map((r) => {
    let amount: number | null = null;
    let note: string | null = null;
    try {
      const after = r.afterJson ? (JSON.parse(r.afterJson) as { granted?: unknown; note?: unknown }) : null;
      if (typeof after?.granted === "number") amount = after.granted;
      if (typeof after?.note === "string" && after.note) note = after.note;
    } catch {
      /* best-effort parse */
    }
    return {
      id: r.id, occurredAt: r.occurredAt, subject: r.subject, email: r.email,
      targetId: r.targetId, reason: r.reason, result: r.result, amount, note,
    };
  });
}

export function renderGrantsPage(
  staff: StaffIdentity,
  q: string,
  hits: StaffUserHit[],
  grants: GrantAuditRow[],
): string {
  const fmtWhen = (ms: number) => (ms ? new Date(ms).toISOString().slice(0, 16).replace("T", " ") : "\u2014");
  const search = `<form method="get" action="/grants" class="search">
<input type="search" name="q" value="${escapeHtml(q)}" placeholder="Find a user to grant to: email, id, nickname">
<button class="btn" type="submit">Search</button>
</form>`;
  const list = !q
    ? `<div class="empty">Search for the customer first, then grant from their user page.</div>`
    : hits.length === 0
      ? `<div class="empty">No users match.</div>`
      : `<table><thead><tr><th>User</th><th>Email</th><th></th></tr></thead><tbody>${hits
          .map(
            (h) =>
              `<tr><td><a href="/users/${escapeHtml(h.id)}">${escapeHtml(h.nickname ?? h.name)}</a></td><td><span class="muted">${escapeHtml(h.email)}</span></td><td><a href="/users/${escapeHtml(h.id)}">Grant \u203a</a></td></tr>`,
          )
          .join("")}</tbody></table>`;
  const log = grants.length
    ? `<table><thead><tr><th>When (UTC)</th><th>Staff</th><th>User</th><th>Amount</th><th>Reason</th><th>Result</th></tr></thead><tbody>${grants
        .map(
          (g) =>
            `<tr><td>${escapeHtml(fmtWhen(g.occurredAt))}</td><td>${escapeHtml(g.email)}</td>` +
            `<td><a href="/users/${escapeHtml(g.targetId)}">${escapeHtml(g.targetId)}</a></td>` +
            `<td>${g.amount === null ? "\u2014" : `+${g.amount}`}</td>` +
            `<td>${escapeHtml(g.reason ?? "\u2014")}${g.note ? `<br><span class="muted">${escapeHtml(g.note)}</span>` : ""}</td>` +
            `<td>${g.result === "ok" ? '<span class="badge">ok</span>' : g.result === "denied" ? '<span class="badge warn">denied</span>' : `<span class="badge warn">${escapeHtml(g.result)}</span>`}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<div class="empty">No grants yet.</div>`;
  return shellChrome(
    staff,
    "Token grants",
    "/grants",
    `<div class="top"><h1>Token grants</h1><small>goodwill top-ups with a required reason, all audited</small></div>` +
      `<div class="card"><h2 style="margin-top:0">Find customer</h2>${search}${list}</div>` +
      `<div class="card"><h2 style="margin-top:0">Recent grants</h2>${log}</div>`,
  );
}

export type InviteFriendRow = {
  userId: string;
  email: string | null;
  nickname: string | null;
  joinedAt: number;
  convertedAt: number | null;
};

export type InviteDetail = {
  userId: string;
  email: string;
  nickname: string | null;
  code: string | null;
  invited: number;
  converted: number;
  invitedBy: { userId: string; nickname: string | null; email: string | null; code: string | null } | null;
  friends: InviteFriendRow[];
  rewards: { day: string; delta: number; refereeId: string; refereeName: string | null }[];
  rewardsTotal: number;
};

async function displayName(db: D1Database, userId: string): Promise<{ nickname: string | null; email: string | null }> {
  const orm = drizzle(db);
  const [u, pref] = await Promise.all([
    orm.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, userId)).limit(1).catch(() => [] as { name: string; email: string }[]),
    d1PrefsStore(db).get(userId).catch(() => null),
  ]);
  const row = u[0];
  if (!row) return { nickname: pref?.nickname ?? null, email: null };
  return { nickname: pref?.nickname ?? row.name ?? null, email: row.email ?? null };
}

/** Full invite picture for one user: code, attribution both ways, rewards paid. */
export async function inviteDetail(db: D1Database, userId: string): Promise<InviteDetail | null> {
  const store = d1TarotStore(db);
  const orm = drizzle(db);
  const base = await displayName(db, userId);
  if (base.email === null && base.nickname === null) {
    const exists = await orm.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1).catch(() => []);
    if (!exists.length) return null;
  }
  const [codeRows, stats, referral, friends, rewardRows] = await Promise.all([
    orm.select({ code: inviteCodes.code }).from(inviteCodes).where(eq(inviteCodes.userId, userId)).limit(1).catch(() => [] as { code: string }[]),
    store.referralStats(userId).catch(() => ({ invited: 0, converted: 0 })),
    store.getReferral(userId).catch(() => null),
    store.listReferralFriends(userId).catch(() => []),
    store.listTransactions({ userId, reasons: ["referral"], cursor: null, limit: 100 }).catch(() => []),
  ]);
  // Batch emails for the friend list.
  const friendIds = friends.map((f) => f.visitorUserId);
  const emailRows = friendIds.length
    ? await orm.select({ id: user.id, email: user.email }).from(user).where(inArray(user.id, friendIds)).catch(() => [] as { id: string; email: string }[])
    : [];
  const emailById = new Map(emailRows.map((r) => [r.id, r.email]));
  let invitedBy: InviteDetail["invitedBy"] = null;
  if (referral) {
    const [who, refCode] = await Promise.all([
      displayName(db, referral.referrerId),
      orm.select({ code: inviteCodes.code }).from(inviteCodes).where(eq(inviteCodes.userId, referral.referrerId)).limit(1).catch(() => [] as { code: string }[]),
    ]);
    invitedBy = { userId: referral.referrerId, nickname: who.nickname, email: who.email, code: refCode[0]?.code ?? null };
  }
  const rewards = rewardRows
    .filter((t) => !t.ref.startsWith("friend-bonus:"))
    .map((t) => ({ day: t.day, delta: t.delta, refereeId: t.ref, refereeName: null as string | null }));
  // Name the referees from the friend list when present.
  const nameById = new Map(friends.map((f) => [f.visitorUserId, f.nickname]));
  for (const r of rewards) r.refereeName = nameById.get(r.refereeId) ?? null;
  return {
    userId,
    email: base.email ?? "",
    nickname: base.nickname,
    code: codeRows[0]?.code ?? null,
    invited: stats.invited,
    converted: stats.converted,
    invitedBy,
    friends: friends.map((f) => ({
      userId: f.visitorUserId,
      email: emailById.get(f.visitorUserId) ?? null,
      nickname: f.nickname,
      joinedAt: f.createdAt,
      convertedAt: f.firstReadingAt,
    })),
    rewards,
    rewardsTotal: rewards.reduce((sum, r) => sum + r.delta, 0),
  };
}

export type InviteAffiliate = {
  active: boolean;
  enabledAt?: number;
  enabledBy?: string;
  payments: AffiliatePayment[];
};

export function renderInvitesPage(
  staff: StaffIdentity, q: string, detail: InviteDetail | null, lookedUp: boolean,
  affiliate?: InviteAffiliate | null,
): string {
  const search = `<form method="get" action="/invites" class="search">
<input type="search" name="user" value="${escapeHtml(q)}" placeholder="user id or email">
<button class="btn" type="submit">Look up</button>
</form>`;
  let body = `<div class="card"><h2 style="margin-top:0">Find customer</h2>${search}`;
  if (!q) {
    body += `<div class="empty">Look up a user to see their code, who used it, and the rewards paid.</div></div>`;
  } else if (!detail) {
    body += `<div class="empty">No user found.</div></div>`;
  } else {
    const d = detail;
    const codeBlock = d.code
      ? `<p><b style="font-size:20px">${escapeHtml(d.code)}</b> <span class="badge">active</span></p>
<form method="post" action="/invites/${escapeHtml(d.userId)}/disable" class="filters"><label>Reason (required)<input type="text" name="reason" required maxlength="500" placeholder="Why disable this code?"></label><button class="btn" type="submit">Disable code</button></form>`
      : `<p><span class="badge warn">disabled</span> <span class="muted">Links with this user's code go to plain sign-up.</span></p>
<form method="post" action="/invites/${escapeHtml(d.userId)}/enable" class="filters"><label>Reason (required)<input type="text" name="reason" required maxlength="500" placeholder="Why re-enable?"></label><button class="btn" type="submit">Re-enable code</button></form>`;
    const friends = d.friends.length
      ? `<table><thead><tr><th>Friend</th><th>Joined</th><th>First reading</th></tr></thead><tbody>${d.friends
          .map(
            (f) =>
              `<tr><td><a href="/users/${escapeHtml(f.userId)}">${escapeHtml(f.nickname ?? f.email ?? f.userId)}</a></td>` +
              `<td>${escapeHtml(new Date(f.joinedAt).toISOString().slice(0, 10))}</td>` +
              `<td>${f.convertedAt ? escapeHtml(new Date(f.convertedAt).toISOString().slice(0, 10)) : '<span class="muted">\u2014</span>'}</td></tr>`,
          )
          .join("")}</tbody></table>`
      : `<div class="empty">Nobody has used this code yet.</div>`;
    const rewards = d.rewards.length
      ? `<table><thead><tr><th>Day</th><th>Tokens</th><th>Referee</th></tr></thead><tbody>${d.rewards
          .map(
            (r) =>
              `<tr><td>${escapeHtml(r.day)}</td><td>+${r.delta}</td>` +
              `<td><a href="/users/${escapeHtml(r.refereeId)}">${escapeHtml(r.refereeName ?? r.refereeId)}</a></td></tr>`,
          )
          .join("")}</tbody></table>`
      : `<div class="empty">No rewards paid yet.</div>`;
    body += `</div>
<div class="card"><h2 style="margin-top:0">${escapeHtml(d.nickname ?? d.email)}</h2>
<p class="muted">${escapeHtml(d.email)} \u00b7 <a href="/users/${escapeHtml(d.userId)}">open user page</a></p>
<h2 style="font-size:15px;margin:14px 0 6px">Invite code</h2>${codeBlock}
<h2 style="font-size:15px;margin:14px 0 6px">Invited by</h2>
<p>${d.invitedBy ? `<a href="/invites?user=${encodeURIComponent(d.invitedBy.userId)}">${escapeHtml(d.invitedBy.nickname ?? d.invitedBy.email ?? d.invitedBy.userId)}</a> <span class="muted">(${escapeHtml(d.invitedBy.code ?? "code unknown")})</span>` : '<span class="muted">\u2014</span>'}</p>
<h2 style="font-size:15px;margin:14px 0 6px">Used by (${d.invited} joined \u00b7 ${d.converted} converted)</h2>${friends}
<h2 style="font-size:15px;margin:14px 0 6px">Rewards paid (+${d.rewardsTotal} tokens)</h2>${rewards}${affiliateSection(staff, d, affiliate)}</div>`;
  }
  return shellChrome(
    staff,
    "Invites",
    "/invites",
    `<div class="top"><h1>Invites</h1><small>codes, attribution, inviter rewards</small></div>${body}`,
  );
}

function affiliateSection(
  staff: StaffIdentity,
  d: InviteDetail,
  affiliate?: InviteAffiliate | null,
): string {
  const sum = summarizeAffiliatePayments(affiliate?.payments ?? []);
  const rows = (affiliate?.payments ?? []).length
    ? `<table><thead><tr><th>Day</th><th class="num">Tokens</th><th class="num">Amount</th><th>Method</th><th>Payer</th></tr></thead><tbody>${(affiliate?.payments ?? [])
        .map(
          (t) =>
            `<tr><td>${escapeHtml(t.day)}</td><td class="num">+${t.delta}</td>` +
            `<td class="num">${t.amount === null ? '<span class="muted">\u2014</span>' : escapeHtml(formatMinor(t.amount, t.currency ?? "THB"))}</td>` +
            `<td>${escapeHtml(t.paymentMethod ?? "\u2014")}</td>` +
            `<td><a href="/users/${escapeHtml(t.userId)}">${escapeHtml(t.userId)}</a></td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<div class="empty">No payments recorded yet. New referred payments appear here automatically.</div>`;
  const mayEdit = canMutate(staff);
  const enableForm = (action: string, label: string, placeholder: string, field: "note" | "reason") =>
    mayEdit
      ? `<form method="post" action="${action}" class="filters"><label>${field === "note" ? "Note (optional)" : "Reason (required)"}<input type="text" name="${field}"${field === "reason" ? " required" : ""} maxlength="500" placeholder="${placeholder}"></label><button class="btn" type="submit">${label}</button></form>`
      : `<p class="muted">Ask support or an admin to change this.</p>`;
  const status = affiliate?.active
    ? `<p><span class="badge">affiliate</span> <span class="muted">since ${escapeHtml(new Date(affiliate.enabledAt ?? 0).toISOString().slice(0, 10))}${affiliate.enabledBy ? ` by ${escapeHtml(affiliate.enabledBy)}` : ""}</span></p>
${enableForm(`/affiliates/${escapeHtml(d.userId)}/disable`, "Disable", "Why disable tracking?", "reason")}`
    : `<p><span class="muted">Not an affiliate. Enabling tracks this code's signups and payments; the code and rewards keep working exactly as before.</span></p>
${enableForm(`/affiliates/${escapeHtml(d.userId)}/enable`, "Enable affiliate tracking", "e.g. LINE OA partner", "note")}`;
  const payBlock = affiliate?.active
    ? `<h2 style="font-size:15px;margin:14px 0 6px">Referred payments (${sum.count} \u00b7 ${escapeHtml(formatMinor(sum.totalMinor, sum.currency))} gross)</h2>${rows}`
    : ``;
  return `<h2 style="font-size:15px;margin:14px 0 6px">Affiliate</h2>${status}${payBlock}`;
}

export type AffiliateRow = {
  userId: string; email: string | null; nickname: string | null;
  enabledAt: number; enabledBy: string; invited: number; converted: number;
  payments: number; revenueMinor: number;
};

export type PendingPayout = {
  id: string; userId: string; email: string | null; amountMinor: number; requestedAt: number;
};

export function renderAffiliatesPage(
  staff: StaffIdentity, q: string, hits: StaffUserHit[], rows: AffiliateRow[],
  payouts: PendingPayout[] = [],
): string {
  const search = `<form method="get" action="/affiliates" class="search">
<input type="search" name="q" value="${escapeHtml(q)}" placeholder="find a user to enable: email, user id, or nickname">
<button class="btn" type="submit">Search</button>
</form>`;
  const found = !q
    ? ``
    : hits.length
      ? `<table><thead><tr><th>User</th><th>Email</th><th></th></tr></thead><tbody>${hits
          .map(
            (h) =>
              `<tr><td><a href="/invites?user=${escapeHtml(h.id)}">${escapeHtml(h.nickname ?? h.name)}</a></td>` +
              `<td>${escapeHtml(h.email)}</td>` +
              `<td><form method="post" action="/affiliates/${escapeHtml(h.id)}/enable"><button class="btn" type="submit">Enable</button></form></td></tr>`,
          )
          .join("")}</tbody></table>`
      : `<div class="empty">No users match.</div>`;
  const list = rows.length
    ? `<table><thead><tr><th>Affiliate</th><th>Since</th><th class="num">Joined</th><th class="num">Converted</th><th class="num">Payments</th><th class="num">Revenue</th></tr></thead><tbody>${rows
        .map(
          (r) =>
            `<tr><td><a href="/invites?user=${escapeHtml(r.userId)}">${escapeHtml(r.nickname ?? r.email ?? r.userId)}</a></td>` +
            `<td>${escapeHtml(new Date(r.enabledAt).toISOString().slice(0, 10))}</td>` +
            `<td class="num">${r.invited}</td><td class="num">${r.converted}</td>` +
            `<td class="num">${r.payments}</td><td class="num">${escapeHtml(formatMinor(r.revenueMinor, "THB"))}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<div class="empty">No affiliates yet. Search above to enable the first one.</div>`;
  const queue = payouts.length
    ? `<table><thead><tr><th>Affiliate</th><th class="num">Requested</th><th>Filed</th><th>Mark paid (bank transfer ref + note)</th></tr></thead><tbody>${payouts
        .map(
          (p) =>
            `<tr><td><a href="/invites?user=${escapeHtml(p.userId)}">${escapeHtml(p.email ?? p.userId)}</a></td>` +
            `<td class="num">${escapeHtml(formatMinor(p.amountMinor, "THB"))}</td>` +
            `<td>${escapeHtml(new Date(p.requestedAt).toISOString().slice(0, 10))}</td>` +
            `<td><form method="post" action="/affiliates/payouts/${escapeHtml(p.id)}/pay" style="display:flex;gap:6px;align-items:center">` +
            `<input type="text" name="note" placeholder="transfer ref, tax withheld" required style="min-width:16em">` +
            `<button class="btn" type="submit">Mark paid</button></form></td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<div class="empty">No pending payout requests.</div>`;
  return shellChrome(
    staff,
    "Affiliates",
    "/affiliates",
    `<div class="top"><h1>Affiliates</h1><small>invite codes with signup + payment tracking</small></div>` +
      `<div class="card"><h2 style="margin-top:0">Payout requests</h2>${queue}</div>` +
      `<div class="card"><h2 style="margin-top:0">Enable tracking</h2>${search}${found}</div>` +
      `<div class="card"><h2 style="margin-top:0">Partners</h2>${list}</div>`,
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
  if (!("error" in parsed) && !canAdmin(staff) && parsed.amount > SUPPORT_GRANT_CAP) {
    await recordAudit(c.env.DB, staff, {
      action: "token.grant",
      targetType: "user",
      targetId: userId,
      reason: parsed.reason,
      result: "denied",
      before: { amount: parsed.amount, cap: SUPPORT_GRANT_CAP },
    }).catch(() => {});
    if (wantsJson(c)) return c.json({ error: "grant_cap_exceeded" }, 403);
    return c.redirect(`/users/${encodeURIComponent(userId)}?grantError=1`, 302);
  }
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

export type RefundResult =
  | { ok: true; refunded: number; wallet: number }
  | { ok: true; alreadyRefunded: true }
  | { error: "unknown_reading" | "already_delivered" };

/** Refund one undelivered reading: +5 tokens linked to the reading,
 *  reading marked failed. Idempotent per reading. */
export async function refundReading(
  db: D1Database,
  staff: StaffIdentity,
  userId: string,
  readingId: string,
  reason: string,
): Promise<RefundResult> {
  const store = d1TarotStore(db);
  const reading = await store.getReading(readingId).catch(() => null);
  if (!reading || reading.userId !== userId) return { error: "unknown_reading" };
  if (reading.status === "complete") {
    await recordAudit(db, staff, {
      action: "reading.refund",
      targetType: "reading",
      targetId: readingId,
      reason,
      result: "denied",
      before: { status: reading.status },
    }).catch(() => {});
    return { error: "already_delivered" };
  }
  const before = await walletOf(db, userId);
  const granted = await store
    .postLedger({ userId, delta: TOKENS_PER_QUESTION, reason: "refund", ref: readingId, day: bangkokDay() })
    .catch(() => false);
  if (!granted) return { ok: true, alreadyRefunded: true };
  await store.setReadingResult(readingId, { aiText: "", aiSummary: "", model: "", status: "failed" }).catch(() => {});
  const after = await walletOf(db, userId);
  await recordAudit(db, staff, {
    action: "reading.refund",
    targetType: "reading",
    targetId: readingId,
    reason,
    result: "ok",
    before: { status: reading.status, wallet: before },
    after: { status: "failed", wallet: after, refunded: TOKENS_PER_QUESTION },
  }).catch(() => {});
  return { ok: true, refunded: TOKENS_PER_QUESTION, wallet: after };
}

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
  const result = await refundReading(c.env.DB, staff, userId, readingId, reason);
  if ("error" in result) {
    if (wantsJson(c)) return c.json({ error: result.error }, result.error === "unknown_reading" ? 404 : 409);
    return result.error === "unknown_reading"
      ? c.text("No such reading.", 404)
      : c.redirect(`/users/${encodeURIComponent(userId)}?refundError=1`, 302);
  }
  if (!wantsJson(c)) return c.redirect(`/users/${encodeURIComponent(userId)}`, 302);
  return c.json({ ok: true, refunded: (result as { refunded?: number }).refunded ?? 0, alreadyRefunded: (result as { alreadyRefunded?: boolean }).alreadyRefunded ?? false });
});

// Merge duplicates (admin only). GET shows the form, or the preview
// when ?target=&reason= are present; POST executes after the source
// email is retyped. The source row is deleted; referrals stay as history.
app.get("/users/:id/merge", async (c) => {
  const staff = c.get("staff" as never) as StaffIdentity;
  if (!canAdmin(staff)) return c.text("Admin role required.", 403);
  if (!c.env?.DB) return c.text("No such user.", 404);
  const a = await userDetail(c.env.DB, c.req.param("id")).catch(() => null);
  if (!a) return c.text("No such user.", 404);
  const target = (c.req.query("target") ?? "").trim();
  const reason = (c.req.query("reason") ?? "").trim();
  if (!target || !reason) return c.html(renderMergeForm(staff, a));
  const bId = await resolveMergeTarget(c.env.DB, target);
  if (!bId) return c.html(renderMergeForm(staff, a));
  if (bId === a.id) return c.text("Source and keeper are the same account.", 400);
  const b = await userDetail(c.env.DB, bId).catch(() => null);
  if (!b) return c.text("No such user.", 404);
  if (b.isAnonymous) return c.text("The keeper account must be registered.", 400);
  return c.html(renderMergePreview(staff, a, b, reason, target));
});

app.post("/users/:id/merge", async (c) => {
  const staff = c.get("staff" as never) as StaffIdentity;
  if (!canAdmin(staff)) return c.text("Admin role required.", 403);
  if (!c.env?.DB) return c.text("No such user.", 404);
  const a = await userDetail(c.env.DB, c.req.param("id")).catch(() => null);
  if (!a) return c.text("No such user.", 404);
  const body = await readInput(c as never);
  const parsed = parseMergeInput(body, a.email);
  if ("error" in parsed) {
    if (wantsJson(c)) return c.json({ error: parsed.error }, 400);
    return c.text(parsed.error, 400);
  }
  const bId = await resolveMergeTarget(c.env.DB, parsed.target);
  if (!bId) {
    if (wantsJson(c)) return c.json({ error: "unknown_target" }, 404);
    return c.text("Keeper account not found (use an exact id or email).", 404);
  }
  if (bId === a.id) {
    if (wantsJson(c)) return c.json({ error: "same_user" }, 400);
    return c.text("Source and keeper are the same account.", 400);
  }
  const b = await userDetail(c.env.DB, bId).catch(() => null);
  if (!b || b.isAnonymous) {
    if (wantsJson(c)) return c.json({ error: "bad_target" }, 400);
    return c.text("The keeper account must be a registered user.", 400);
  }
  let report;
  try {
    report = await mergeUsers(c.env.DB, a.id, bId);
  } catch (err) {
    await recordAudit(c.env.DB, staff, {
      action: "account.merge",
      targetType: "user",
      targetId: `${a.id}->${bId}`,
      reason: parsed.reason,
      result: "failed",
      before: { source: a.id },
    }).catch(() => {});
    if (wantsJson(c)) return c.json({ error: "merge_failed" }, 500);
    return c.text("Merge failed partway; check both accounts before retrying.", 500);
  }
  await recordAudit(c.env.DB, staff, {
    action: "account.merge",
    targetType: "user",
    targetId: `${a.id}->${bId}`,
    reason: parsed.reason,
    result: "ok",
    before: { source: a, keeper: { id: b.id, wallet: report.walletBeforeB } },
    after: { moved: report.moved, dropped: report.dropped, makeup: report.makeup, wallet: report.walletAfterB },
  }).catch(() => {});
  if (wantsJson(c)) return c.json({ ok: true, keeper: bId, report });
  return c.redirect(`/users/${encodeURIComponent(bId)}`, 302);
});

/** Resolve a merge target (exact id, or exact email) to a user id. */
async function resolveMergeTarget(db: D1Database, target: string): Promise<string | null> {
  const q = target.trim();
  if (!q) return null;
  if (!q.includes("@")) {
    const d = await userDetail(db, q).catch(() => null);
    return d ? d.id : null;
  }
  const hits = await findUsers(db, q).catch(() => []);
  if (hits.length === 1) return hits[0].id;
  const exact = hits.filter((h) => h.email.toLowerCase() === q.toLowerCase());
  return exact.length === 1 ? exact[0].id : null;
}

// Stuck-reading safety net (read for all staff; refunds need support+).
app.get("/stuck", async (c) => {
  const staff = c.get("staff" as never) as StaffIdentity;
  const rows = c.env?.DB ? await listStuckReadings(c.env.DB).catch(() => []) : [];
  return c.html(
    renderStuckPage(staff, rows, {
      refunded: c.req.query("refunded") ? Number(c.req.query("refunded")) : undefined,
      failed: c.req.query("failed") ? Number(c.req.query("failed")) : undefined,
    }),
  );
});

app.post("/stuck/refund", async (c) => {
  const staff = c.get("staff" as never) as StaffIdentity;
  if (!canMutate(staff)) return c.text("Support role or above required.", 403);
  if (!c.env?.DB) return c.text("No such reading.", 404);
  const body = await readInput(c as never);
  const rawIds = body.ids;
  const ids = (Array.isArray(rawIds) ? rawIds : rawIds === undefined ? [] : [rawIds]).map(String).filter(Boolean);
  const reason = String(body.reason ?? "").trim();
  if (!ids.length || !reason) {
    if (wantsJson(c)) return c.json({ error: "ids_and_reason_required" }, 400);
    return c.redirect("/stuck?failed=1", 302);
  }
  let refunded = 0;
  let failed = 0;
  for (const id of ids.slice(0, 100)) {
    const reading = await d1TarotStore(c.env.DB).getReading(id).catch(() => null);
    if (!reading) {
      failed += 1;
      continue;
    }
    const result = await refundReading(c.env.DB, staff, reading.userId, id, reason);
    if ("error" in result) failed += 1;
    else refunded += 1;
  }
  if (wantsJson(c)) return c.json({ ok: true, refunded, failed });
  return c.redirect(`/stuck?refunded=${refunded}&failed=${failed}`, 302);
});

// Token grants: find the customer, then grant from their user page.
// The audit trail below shows every grant with its reason.
app.get("/grants", async (c) => {
  const staff = c.get("staff" as never) as StaffIdentity;
  const q = ((c.req.query("q") as string | undefined) ?? "").trim();
  const hits = q && c.env?.DB ? await findUsers(c.env.DB, q).catch(() => []) : [];
  const grants = c.env?.DB ? await recentGrants(c.env.DB, 50).catch(() => []) : [];
  return c.html(renderGrantsPage(staff, q, hits, grants));
});

// Invite codes per user: who used them, conversion, rewards paid.
// Disable/enable is admin-only: it changes what /r/CODE links do.
app.get("/invites", async (c) => {
  const staff = c.get("staff" as never) as StaffIdentity;
  const q = ((c.req.query("user") as string | undefined) ?? "").trim();
  let detail: InviteDetail | null = null;
  if (q && c.env?.DB) {
    let id: string | null = null;
    if (q.includes("@")) {
      const hits = await findUsers(c.env.DB, q).catch(() => []);
      const exact = hits.filter((h) => h.email.toLowerCase() === q.toLowerCase());
      id = (exact[0] ?? hits[0])?.id ?? null;
    } else {
      id = q;
    }
    if (id) detail = await inviteDetail(c.env.DB, id).catch(() => null);
  }
  let affiliate: InviteAffiliate | null = null;
  if (detail && c.env?.DB) {
    const store = d1TarotStore(c.env.DB);
    const flag = await store.getAffiliate(detail.userId).catch(() => null);
    const payments = detail.friends.length
      ? await store.topupsForUsers(detail.friends.map((f) => f.userId)).catch(() => [])
      : [];
    affiliate = flag
      ? { active: true, enabledAt: flag.enabledAt, enabledBy: flag.enabledBy, payments }
      : { active: false, payments };
  }
  return c.html(renderInvitesPage(staff, q, detail, q !== "", affiliate));
});

async function setInviteCodeEnabled(
  c: Context<{ Bindings: StaffEnv }>,
  staff: StaffIdentity,
  enable: boolean,
): Promise<Response> {
  const userId = c.req.param("userId") ?? "";
  const body = await readInput(c as never);
  const reason = String((body as Record<string, unknown>).reason ?? "").trim();
  if (!userId) return wantsJson(c) ? c.json({ error: "unknown_user" }, 404) : new Response("No such user.", { status: 404 });
  if (!reason) return wantsJson(c) ? c.json({ error: "A reason is required." }, 400) : new Response("A reason is required.", { status: 400 });
  const db = c.env?.DB;
  if (!db) return wantsJson(c) ? c.json({ error: "unavailable" }, 503) : new Response("Unavailable.", { status: 503 });
  const before = await inviteDetail(db, userId).catch(() => null);
  if (!before) return wantsJson(c) ? c.json({ error: "unknown_user" }, 404) : new Response("No such user.", { status: 404 });
  const orm = drizzle(db);
  if (enable) {
    await orm
      .insert(inviteCodes)
      .values({ userId, code: inviteCodeFor(userId), createdAt: Date.now() })
      .onConflictDoNothing()
      .catch(() => {});
  } else {
    await orm.delete(inviteCodes).where(eq(inviteCodes.userId, userId)).catch(() => {});
  }
  await recordAudit(c.env.DB, staff, {
    action: enable ? "invite_code.enable" : "invite_code.disable",
    targetType: "user",
    targetId: userId,
    reason,
    result: "ok",
    before: { code: before.code },
  }).catch(() => {});
  if (wantsJson(c)) return c.json({ ok: true });
  return c.redirect(`/invites?user=${encodeURIComponent(userId)}`, 302);
}

app.post("/invites/:userId/disable", async (c) => {
  const staff = c.get("staff" as never) as StaffIdentity;
  if (!canAdmin(staff)) return c.text("Admin role required.", 403);
  return setInviteCodeEnabled(c, staff, false);
});

app.post("/invites/:userId/enable", async (c) => {
  const staff = c.get("staff" as never) as StaffIdentity;
  if (!canAdmin(staff)) return c.text("Admin role required.", 403);
  return setInviteCodeEnabled(c, staff, true);
});

// Affiliates: staff-enabled tracking on top of invite codes.
// An affiliate's code works exactly like before; this only unlocks
// per-referred-user signup and payment tracking below.
app.get("/affiliates", async (c) => {
  const staff = c.get("staff" as never) as StaffIdentity;
  const q = ((c.req.query("q") as string | undefined) ?? "").trim();
  const hits = q && c.env?.DB ? await findUsers(c.env.DB, q).catch(() => []) : [];
  let rows: { userId: string; email: string | null; nickname: string | null; enabledAt: number; enabledBy: string; invited: number; converted: number; payments: number; revenueMinor: number }[] = [];
  if (c.env?.DB) {
    try {
      const store = d1TarotStore(c.env.DB);
      const flags = await store.listAffiliates();
      const orm = drizzle(c.env.DB);
      const users = flags.length
        ? await orm.select({ id: user.id, email: user.email }).from(user).where(inArray(user.id, flags.map((f) => f.userId))).catch(() => [] as { id: string; email: string }[])
        : [];
      const emailById = new Map(users.map((u) => [u.id, u.email]));
      const nicks = flags.length
        ? await orm.select({ userId: userPrefs.userId, nickname: userPrefs.nickname }).from(userPrefs).where(inArray(userPrefs.userId, flags.map((f) => f.userId))).catch(() => [] as { userId: string; nickname: string | null }[])
        : [];
      const nickById = new Map(nicks.map((r) => [r.userId, r.nickname]));
      rows = await Promise.all(
        flags.map(async (f) => {
          const refereeIds = (await store.listReferralFriends(f.userId).catch(() => [])).map((r) => r.visitorUserId);
          const payments = await store.topupsForUsers(refereeIds).catch(() => []);
          const sum = summarizeAffiliatePayments(payments);
          const stats = await store.referralStats(f.userId).catch(() => ({ invited: 0, converted: 0 }));
          return {
            userId: f.userId, email: emailById.get(f.userId) ?? null, nickname: nickById.get(f.userId) ?? null,
            enabledAt: f.enabledAt, enabledBy: f.enabledBy, invited: stats.invited, converted: stats.converted,
            payments: sum.count, revenueMinor: sum.totalMinor,
          };
        }),
      );
    } catch {
      rows = [];
    }
  }
  let payouts: PendingPayout[] = [];
  if (c.env?.DB) {
    try {
      const store = d1TarotStore(c.env.DB);
      const pending = await store.pendingAffiliatePayouts();
      const orm = drizzle(c.env.DB);
      const cu = pending.length
        ? await orm.select({ id: user.id, email: user.email }).from(user).where(inArray(user.id, pending.map((x) => x.userId))).catch(() => [] as { id: string; email: string }[])
        : [];
      const emailById = new Map(cu.map((u) => [u.id, u.email]));
      payouts = pending.map((x) => ({ ...x, email: emailById.get(x.userId) ?? null }));
    } catch {
      payouts = [];
    }
  }
  return c.html(renderAffiliatesPage(staff, q, hits, rows, payouts));
});

app.post("/affiliates/:userId/enable", async (c) => {
  const staff = c.get("staff" as never) as StaffIdentity;
  if (!canMutate(staff)) return c.text("Support role or above required.", 403);
  const userId = c.req.param("userId") ?? "";
  if (!userId) return c.json({ error: "unknown_user" }, 404);
  if (!c.env?.DB) return c.json({ error: "unavailable" }, 503);
  const body = await readInput(c as never);
  const noteRaw = String((body as Record<string, unknown>).note ?? "").trim();
  const note = noteRaw ? noteRaw.slice(0, 500) : null;
  const store = d1TarotStore(c.env.DB);
  const detail = await userDetail(c.env.DB, userId).catch(() => null);
  if (!detail) return c.json({ error: "unknown_user" }, 404);
  await store.setAffiliate(userId, staff.email, note);
  await recordAudit(c.env.DB, staff, {
    action: "affiliate.enable", targetType: "user", targetId: userId,
    reason: "Enable affiliate tracking for this user.", result: "ok", after: { note },
  }).catch(() => {});
  if (wantsJson(c)) return c.json({ ok: true });
  return c.redirect(`/affiliates`, 302);
});

app.post("/affiliates/payouts/:payoutId/pay", async (c) => {
  const staff = c.get("staff" as never) as StaffIdentity;
  if (!canMutate(staff)) return c.text("Support role or above required.", 403);
  const payoutId = c.req.param("payoutId") ?? "";
  if (!payoutId || !c.env?.DB) return c.json({ error: "unknown_payout" }, 404);
  const body = await readInput(c as never);
  const note = String((body as Record<string, unknown>).note ?? "").trim();
  if (!note) {
    if (wantsJson(c)) return c.json({ error: "A transfer note is required." }, 400);
    return c.redirect("/affiliates", 302);
  }
  const store = d1TarotStore(c.env.DB);
  const payout = await store.affiliatePayout(payoutId).catch(() => null);
  if (!payout) return c.json({ error: "unknown_payout" }, 404);
  if (payout.status !== "requested") {
    if (wantsJson(c)) return c.json({ ok: true, status: payout.status });
    return c.redirect("/affiliates", 302);
  }
  // Conditional update is the single-winner gate: two staff marking the
  // same request paid at once cannot double-record it.
  const won = await store.payAffiliatePayout(payoutId, staff.email, note).catch(() => false);
  if (!won) {
    if (wantsJson(c)) return c.json({ ok: true, status: "paid" });
    return c.redirect("/affiliates", 302);
  }
  await recordAudit(c.env.DB, staff, {
    action: "affiliate_payout.pay", targetType: "user", targetId: payout.userId,
    reason: note, result: "ok", after: { payoutId, amountMinor: payout.amountMinor },
  }).catch(() => {});
  if (wantsJson(c)) return c.json({ ok: true });
  return c.redirect("/affiliates", 302);
});

app.post("/affiliates/:userId/disable", async (c) => {
  const staff = c.get("staff" as never) as StaffIdentity;
  if (!canMutate(staff)) return c.text("Support role or above required.", 403);
  const userId = c.req.param("userId") ?? "";
  if (!userId || !c.env?.DB) return c.json({ error: "unknown_user" }, 404);
  const body = await readInput(c as never);
  const reason = String((body as Record<string, unknown>).reason ?? "").trim();
  if (!reason) {
    if (wantsJson(c)) return c.json({ error: "A reason is required." }, 400);
    return c.redirect(`/invites?user=${encodeURIComponent(userId)}`, 302);
  }
  await d1TarotStore(c.env.DB).removeAffiliate(userId);
  await recordAudit(c.env.DB, staff, {
    action: "affiliate.disable", targetType: "user", targetId: userId,
    reason, result: "ok",
  }).catch(() => {});
  if (wantsJson(c)) return c.json({ ok: true });
  return c.redirect(`/invites?user=${encodeURIComponent(userId)}`, 302);
});

app.notFound((c) => c.text("Not found.", 404));

export default app;
