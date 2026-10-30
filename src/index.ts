import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createAuth, isRegisteredUser, type AuthEnv } from "./lib/auth";
import * as schema from "./db/schema";
import { bangkokDay, bangkokHour, nextBangkokMidnight } from "./lib/bangkok";
import { luckyColour } from "./lib/daily";
import {
  buildReadingPrompt,
  classifyCrisis,
  cleanQuestion,
  crisisMessage,
  crisisWatchHit,
  drawReadingCards,
  isCrisisQuestion,
  isLang,
  isTopic,
  parseSummary,
  sseEvent,
  streamDeltas,
  toPromptCard,
  type Topic,
} from "./lib/reading";
import { computeStreak } from "./lib/streaks";
import { d1PrefsStore } from "./db/prefs-store";
import { d1TarotStore } from "./db/tarot-store";
import { renderBadgeImage, renderInviteImage, renderShareImage, type ShareCard } from "./lib/share-images";
import { badgeLandingPage, shareLandingPage, unsharedPage } from "./routes/share";
import {
  clientCategory,
  countryOf,
  isClientEvent,
  recordEvent,
  type AnalyticsEnv,
} from "./lib/analytics";
import { contactPage, privacyPage, termsPage } from "./routes/legal";
import { homePage } from "./routes/home";
import { historyDetailPage, historyPage } from "./routes/history";
import { progressPage } from "./routes/progress";
import { cardDetailPage, cardsPage } from "./routes/library";
import {
  accountPage,
  forgotPasswordPage,
  registerPage,
  resetPasswordPage,
  signInPage,
} from "./routes/auth-pages";
import { billingCancelPage, billingPage, billingSuccessPage, safeReturnPath } from "./routes/billing";
import { countryOfRequest } from "./lib/geo";
import { isUiLang, t, uiLangFor, type UiLang } from "./lib/i18n";
import {
  createPackCheckoutSession,
  isPackId,
  PACKS,
  packForSession,
  packPriceId,
  retrieveCheckoutSession,
  tokensConfigured,
  verifyStripeSignature,
  type StripeEnv,
} from "./lib/stripe";
import {
  inviteCodeFor,
  inviteCodeFromPngParam,
  inviteRefFor,
  isInviteCode,
  normalizeInviteCode,
  parseInviteRef,
} from "./lib/invite";
import {
  DAILY_FREE_TOKENS,
  REFERRAL_DAILY_CAP,
  REFERRAL_FRIEND_BONUS_TOKENS,
  REFERRAL_REWARD_TOKENS,
  TOKENS_PER_QUESTION,
  isTransactionFilter,
  planSpend,
  reasonsForFilter,
  rewardsTodayCount,
  walletBalance,
  type LedgerRow,
} from "./lib/wallet";
import { checkoutReturnUrls } from "./routes/billing";

type Env = AuthEnv &
  AnalyticsEnv &
  StripeEnv & {
    AI: Ai;
    ASSETS?: Fetcher;
    MEDIA?: R2Bucket;
    READING_LIMITER?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> };
    DAILY_QUESTION_LIMIT?: string;
    REFERRAL_BONUS?: string;
    READING_MODEL?: string;
    DEFAULT_LANG?: string;
    TIMEZONE?: string;
    TURNSTILE_SECRET?: string;
    TURNSTILE_SITE_KEY?: string;
  };

function clientIp(c: { req: { raw: Request; header: (n: string) => string | undefined } }): string {
  return c.req.header("cf-connecting-ip")?.trim() || "unknown";
}

async function verifyTurnstile(secret: string, token: string, ip: string): Promise<boolean> {
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

type SessionUser = { id: string; email: string | null; isAnonymous: boolean | null };

function userKind(user: SessionUser | null): "guest" | "anon" | "user" {
  if (!user) return "guest";
  return user.isAnonymous ? "anon" : "user";
}

function requestContext(c: { req: { raw: Request } }): {
  country: string;
  device: string;
  browser: string;
} {
  return { country: countryOf(c.req.raw), ...clientCategory(c.req.raw) };
}

const app = new Hono<{ Bindings: Env }>();

// ?ui=<lang> picks the interface language: store it in the nl_ui
// cookie (one year) and redirect to the same page without the param.
app.use("*", async (c, next) => {
  const ui = c.req.query("ui");
  if (isUiLang(ui)) {
    setCookie(c, UI_COOKIE, ui, {
      path: "/",
      maxAge: 365 * 24 * 3600,
      sameSite: "Lax",
    });
    const url = new URL(c.req.url);
    url.searchParams.delete("ui");
    return c.redirect(url.pathname + url.search, 302);
  }
  await next();
});

app.get("/health", (c) => c.text("ok"));

// Browser beacon for client-only events. Aggregate-only: no
// visitor/user identifier is accepted or stored; country, device,
// and browser are derived server-side.
app.post("/_t/events", async (c) => {
  const length = Number(c.req.header("content-length") || "0");
  if (length > 2048) return c.body(null, 413);
  const origin = c.req.header("origin");
  if (!origin || new URL(c.req.url).origin !== origin) return c.body(null, 403);
  let body: {
    event?: unknown;
    path?: unknown;
    lang?: unknown;
    topic?: unknown;
    kind?: unknown;
    detail?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.body(null, 400);
  }
  if (!isClientEvent(body.event)) return c.body(null, 400);
  const path = typeof body.path === "string" ? body.path : "";
  if (path && !/^\/(?:$|[^?#]{1,300}$)/.test(path)) return c.body(null, 400);
  const lang =
    typeof body.lang === "string" && /^[a-z]{2}$/.test(body.lang) ? body.lang : "";
  const topic =
    typeof body.topic === "string" && /^[a-z]{1,16}$/.test(body.topic) ? body.topic : "";
  const kind =
    typeof body.kind === "string" && /^[a-z]{1,16}$/.test(body.kind) ? body.kind : "";
  const detail = typeof body.detail === "string" ? body.detail : "";
  recordEvent(c.env, {
    name: body.event,
    lang,
    topic,
    kind,
    detail,
    path,
    ...requestContext(c),
  });
  return c.body(null, 204);
});

const UI_COOKIE = "nl_ui";

/** Interface language for this request (cookie > country > English). */
function requestUiLang(c: {
  req: { raw: Request; header: (n: string) => string | undefined };
}): UiLang {
  const header = c.req.header("cookie") ?? "";
  const cookie = header
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${UI_COOKIE}=`))
    ?.slice(UI_COOKIE.length + 1);
  return uiLangFor({
    cookie: cookie ? decodeURIComponent(cookie) : null,
    country: countryOfRequest(c.req.raw),
  });
}

async function currentUser(c: {
  env: AuthEnv;
  req: { raw: { headers: Headers } };
}): Promise<SessionUser | null> {
  try {
    const auth = createAuth(c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return null;
    return {
      id: session.user.id,
      email: session.user.email ?? null,
      isAnonymous: (session.user as { isAnonymous?: boolean | null }).isAnonymous ?? null,
    };
  } catch {
    return null;
  }
}

app.get("/", async (c) => {
  // Referral touch: ?ref={shareId} from a share landing CTA, or
  // ?ref=NICE-XXXX / ?ref=inv:<userId> personal invites, kept 7 days.
  const ref = c.req.query("ref");
  if (isShareId(ref)) {
    setCookie(c, "tarotnice_ref", ref, {
      path: "/",
      maxAge: 7 * 24 * 3600,
      sameSite: "Lax",
    });
  } else if (isInviteCode(ref) && c.env?.DB) {
    const ownerId = await d1TarotStore(c.env.DB).inviteOwner(normalizeInviteCode(ref) as string);
    if (ownerId) {
      setCookie(c, "tarotnice_ref", inviteRefFor(ownerId), {
        path: "/",
        maxAge: 7 * 24 * 3600,
        sameSite: "Lax",
      });
    }
  } else if (ref && parseInviteRef(ref)) {
    setCookie(c, "tarotnice_ref", ref, {
      path: "/",
      maxAge: 7 * 24 * 3600,
      sameSite: "Lax",
    });
  }
  const origin = new URL(c.req.url).origin;
  // Invite landing banner (design board 2) after /r/NICE-XXXX: the code
  // arrives as ?invited=; the inviter's nickname personalizes it.
  let invite: { code: string; inviterName: string | null } | null = null;
  const invited = c.req.query("invited");
  if (isInviteCode(invited) && c.env?.DB) {
    const code = normalizeInviteCode(invited) as string;
    try {
      const store = d1TarotStore(c.env.DB);
      const ownerId = await store.inviteOwner(code);
      const nickname = ownerId ? (await d1PrefsStore(c.env.DB).get(ownerId))?.nickname ?? null : null;
      invite = { code, inviterName: nickname };
    } catch {
      invite = { code, inviterName: null };
    }
  }
  return c.html(homePage({ origin, uiLang: requestUiLang(c), turnstileSiteKey: c.env?.TURNSTILE_SITE_KEY, invite }));
});

app.get("/robots.txt", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.text(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`, 200, {
    "Content-Type": "text/plain",
  });
});

app.get("/sitemap.xml", async (c) => {
  const origin = new URL(c.req.url).origin;
  // Indexable pages only: home + library index + reviewed card details.
  // Draft (unreviewed) cards, history, progress, account, and share
  // landings stay out (drafts also carry noindex).
  const urls = ["/", "/cards", "/th/cards"];
  if (c.env?.DB) {
    try {
      const cards = await d1TarotStore(c.env.DB).listCards("en");
      for (const card of cards) {
        if (card.reviewed) urls.push(`/cards/${card.slug}`, `/th/cards/${card.slug}`);
      }
    } catch {
      /* sitemap degrades to the static entries */
    }
  }
  return c.text(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map((u) => `<url><loc>${origin}${u}</loc></url>`).join("\n") +
      `\n</urlset>`,
    200,
    { "Content-Type": "application/xml" },
  );
});

app.get("/terms", (c) => c.html(termsPage(requestUiLang(c))));
app.get("/privacy", (c) => c.html(privacyPage(requestUiLang(c))));
app.get("/contact", (c) => c.html(contactPage(requestUiLang(c))));

// Ask a question: quota + burst + Turnstile + IP-day backstops, then
// the server draws 3 cards (stored as status='drawn' immediately).
// A draw counts toward the quota right away and a refresh can never
// re-roll: at most one open drawn reading per user per day — a second
// POST returns it instead of drawing again. Card names stay out of
// the response (SPEC §12); the client maps ids to library data and
// only shows a name when its card flips.
app.post("/api/readings", async (c) => {
  const user = await authedUser(c);
  if (!user || !c.env?.DB) return c.json({ error: "unauthorized" }, 401);
  let body: { question?: unknown; topic?: unknown; lang?: unknown; turnstileToken?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "bad_request" }, 400);
  }
  const question = cleanQuestion(body.question);
  const topic: Topic = isTopic(body.topic) ? body.topic : "general";
  const lang = isLang(body.lang) ? body.lang : requestUiLang(c);
  if (!question) return c.json({ error: "bad_question" }, 400);
  // Crisis pre-check first: supportive reply, no reading, no quota
  // cost. Keywords, then a cheap classifier for borderline phrasing.
  let crisis = isCrisisQuestion(question);
  if (!crisis && crisisWatchHit(question) && c.env.AI) {
    const aiRun = (m: string, input: unknown) => c.env.AI!.run(m as never, input as never) as Promise<unknown>;
    crisis = await classifyCrisis(aiRun, question);
  }
  if (crisis) {
    return c.json({ crisis: true, message: crisisMessage(lang) });
  }
  const store = d1TarotStore(c.env.DB);
  await attributeReferral(c, store, user.id);
  const today = bangkokDay();
  // Token metering: today's free credit (5 tokens = 1 question) spends
  // first; beyond it, registered users spend wallet tokens. The daily
  // grant is an idempotent ledger row, so a day never double-grants.
  await ensureDailyGrant(store, user.id, today);
  // One open draw per user: hand back the cards already drawn today
  // (with their original question) instead of dealing new ones.
  const open = await store.openDrawn(user.id, today);
  if (open) {
    return c.json({
      id: open.id,
      cards: open.cards,
      // Resuming an open draw costs nothing.
      remaining: questionsLeft(await walletState(store, user.id, today)),
      resumed: true,
      question: open.question,
      topic: open.topic,
    });
  }
  const balance = await walletState(store, user.id, today);
  const spend = planSpend(balance, user.isAnonymous ? "anon" : "registered");
  if (!spend.ok) {
    recordEvent(c.env, { name: "limit_hit", lang, ...requestContext(c), userKind: userKind(user) });
    if (spend.error === "registration_required") {
      return c.json({ error: "registration_required", resetsAt: nextBangkokMidnight() }, 403);
    }
    return c.json(
      {
        error: "insufficient_tokens",
        balance: balance.wallet,
        needed: TOKENS_PER_QUESTION,
        resetsAt: nextBangkokMidnight(),
      },
      402,
    );
  }
  const ip = clientIp(c);
  try {
    const burst = c.env.READING_LIMITER ? await c.env.READING_LIMITER.limit({ key: ip }) : { success: true };
    if (!burst.success) throw new Error("burst");
  } catch {
    recordEvent(c.env, { name: "rate_limited", lang, detail: "burst", ...requestContext(c), userKind: userKind(user) });
    return c.json({ error: "rate_limited" }, 429);
  }
  if (c.env.TURNSTILE_SECRET) {
    const ok = typeof body.turnstileToken === "string" && body.turnstileToken.length > 0
      && (await verifyTurnstile(c.env.TURNSTILE_SECRET, body.turnstileToken, ip));
    if (!ok) return c.json({ error: "bad_turnstile" }, 403);
  }
  // Per-IP hourly backstop: 30 draws/hour (no per-day IP limit).
  const hourBucket = bangkokHour();
  if ((await store.ipDayCount(ip, hourBucket)) >= 30) {
    recordEvent(c.env, { name: "rate_limited", lang, detail: "ip_hour", ...requestContext(c), userKind: userKind(user) });
    return c.json({ error: "rate_limited" }, 429);
  }
  const drawn = drawReadingCards();
  const id = crypto.randomUUID();
  // Charge at draw time (a draw is a commitment — no re-rolls). The
  // spend row keys by reading id, so retries never double-charge.
  await store.postLedger({
    userId: user.id,
    delta: -TOKENS_PER_QUESTION,
    reason: "reading",
    ref: id,
    source: spend.source,
    day: today,
  });
  try {
    await store.insertReading({ id, userId: user.id, day: today, topic, question, lang, cards: drawn });
  } catch (err) {
    await store.deleteLedger("reading", id).catch(() => {});
    throw err;
  }
  await store.ipDayBump(ip, hourBucket);
  // SPEC §12: ids + orientations only. Names/images are library data
  // the client fetches separately; nothing to peek at before the flip.
  const after = {
    wallet: balance.wallet - (spend.source === "wallet" ? TOKENS_PER_QUESTION : 0),
    dailyLeft: balance.dailyLeft - (spend.source === "daily" ? TOKENS_PER_QUESTION : 0),
  };
  return c.json({ id, cards: drawn, remaining: questionsLeft(after) });
});

// Stream the AI interpretation (SSE deltas, then done). Replays the
// stored text for completed readings. A failure marks the row failed
// (not counted) and the client offers "Try again" on the same cards.
app.get("/api/readings/:id/stream", async (c) => {
  const user = await authedUser(c);
  if (!user || !c.env?.DB) return c.json({ error: "unauthorized" }, 401);
  const store = d1TarotStore(c.env.DB);
  const row = await store.getReading(c.req.param("id"));
  if (!row || row.userId !== user.id) return c.json({ error: "not_found" }, 404);
  const lang = row.lang === "th" ? "th" : "en";
  const today = bangkokDay();
  const limit = questionLimit(c.env);

  // Fresh generations only: re-check the day's quota (draws count
  // from POST time now, so this also stops pre-fix bypass rows) and
  // atomically claim the reading — a second opener gets a 409, not a
  // second model call. Completed readings replay below.
  if (row.status !== "complete") {
    if (row.status === "failed") return c.json({ error: "reading_failed" }, 409);
    if (row.status === "streaming") return c.json({ error: "already_streaming" }, 409);
    // Draw-time charging is authoritative: a reading with a spend row
    // may always stream (covers paid questions past the free limit and
    // retries re-planned at POST /retry). Rows drawn before token
    // metering (no spend row) keep the legacy day-quota re-check.
    const spentRow = await store.ledgerByRef("reading", row.id);
    if (!spentRow) {
      const others = await store.countReadings(user.id, row.day, row.id);
      if (others >= limit) {
        recordEvent(c.env, { name: "limit_hit", lang, ...requestContext(c), userKind: userKind(user) });
        return c.json({ error: "limit", remaining: 0, resetsAt: nextBangkokMidnight() }, 429);
      }
    }
    if (!(await store.claimForStreaming(row.id, user.id))) {
      return c.json({ error: "already_streaming" }, 409);
    }
    row.status = "streaming";
  }

  const donePayload = async (summary: string) => {
    await ensureDailyGrant(store, user.id, today);
    const remaining = questionsLeft(await walletState(store, user.id, today));
    return sseEvent("done", JSON.stringify({ summary, remaining }));
  };

  const stream = new ReadableStream({
    async start(controller) {
      const send = (text: string) => controller.enqueue(new TextEncoder().encode(text));
      try {
        if (row.status === "complete" && row.aiText) {
          // Replay in small chunks so the client paints progressively.
          for (const chunk of row.aiText.match(/[\s\S]{1,120}/g) ?? []) {
            send(sseEvent("delta", JSON.stringify(chunk)));
          }
          send(await donePayload(row.aiSummary ?? parseSummary(row.aiText)));
          controller.close();
          return;
        }
        const model = c.env.READING_MODEL?.trim() || null;
        if (!model || !c.env.AI) {
          // Hand the claim back so the reading stays retryable.
          try {
            await store.setReadingResult(row.id, { aiText: "", aiSummary: "", model: "", status: "drawn" });
          } catch { /* best-effort */ }
          send(sseEvent("error", JSON.stringify({ error: "model_unset" })));
          controller.close();
          return;
        }
        const views = [];
        for (const card of row.cards) {
          const view = await store.getCard(card.id, lang);
          if (!view) throw new Error("unknown_card");
          views.push(toPromptCard(view, card.reversed, isTopic(row.topic) ? row.topic : "general"));
        }
        const prev = (await store.prevReadings(user.id)).map((p) => ({
          topic: p.topic,
          cardNames: p.cards.map((card) => String(card.id)),
          summary: p.summary,
        }));
        // Resolve previous card ids to names for continuity.
        for (const p of prev) {
          const names: string[] = [];
          for (const id of p.cardNames) {
            const view = await store.getCard(Number(id), lang);
            names.push(view ? view.name : `#${id}`);
          }
          p.cardNames = names;
        }
        let nickname: string | null = null;
        try {
          nickname = (await d1PrefsStore(c.env.DB).get(user.id))?.nickname ?? null;
        } catch {
          nickname = null;
        }
        const { system, user: prompt } = buildReadingPrompt({
          lang, topic: isTopic(row.topic) ? row.topic : "general",
          question: row.question, cards: views, prev, nickname,
        });
        const aiRun = (m: string, input: unknown) => c.env.AI!.run(m as never, input as never) as Promise<unknown>;
        let full = "";
        for await (const delta of streamDeltas(aiRun, model, {
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          // Detailed story-style readings run long, especially in
          // Thai (more tokens per word than English).
          max_tokens: 2048,
        }, 120_000)) {
          full += delta;
          send(sseEvent("delta", JSON.stringify(delta)));
        }
        full = full.trim();
        if (!full) throw new Error("empty_response");
        const summary = parseSummary(full);
        await store.setReadingResult(row.id, { aiText: full, aiSummary: summary, model, status: "complete" });
        recordEvent(c.env, {
          name: "reading_completed", lang, topic: row.topic,
          ...requestContext(c), userKind: userKind(user),
        });
        try {
          const referral = await store.getReferral(user.id);
          if (referral && !referral.converted && (await store.convertReferral(user.id))) {
            recordEvent(c.env, { name: "referral_converted", ...requestContext(c), userKind: userKind(user) });
            // Design semantics: the inviter earns +5 tokens when the
            // friend finishes a first reading, max 3 friends/day.
            await rewardReferrer(store, referral.referrerId, user.id, today);
          }
        } catch {
          /* attribution is best-effort */
        }
        send(await donePayload(summary));
        controller.close();
      } catch (error) {
        console.error(JSON.stringify({ message: "reading stream failed", error: error instanceof Error ? error.message : String(error) }));
        let markedFailed = false;
        try {
          await store.setReadingResult(row.id, { aiText: "", aiSummary: "", model: "", status: "failed" });
          markedFailed = true;
        } catch {
          /* keep the drawn row for retry */
        }
        // Failed readings are free: hand the spend back so a retry (or
        // a fresh question) is charged at retry/draw time instead.
        if (markedFailed) {
          try { await store.deleteLedger("reading", row.id); } catch { /* spend stays if delete fails */ }
        }
        send(sseEvent("error", JSON.stringify({ error: "reading_failed" })));
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
});

// Retry a failed reading on the same cards. The failure refunded the
// spend, so retry re-plans it against today's wallet (free credit first).
app.post("/api/readings/:id/retry", async (c) => {
  const user = await authedUser(c);
  if (!user || !c.env?.DB) return c.json({ error: "unauthorized" }, 401);
  const store = d1TarotStore(c.env.DB);
  const row = await store.getReading(c.req.param("id"));
  if (!row || row.userId !== user.id) return c.json({ error: "not_found" }, 404);
  if (row.status !== "failed") return c.json({ error: "bad_state" }, 400);
  const today = bangkokDay();
  await ensureDailyGrant(store, user.id, today);
  const balance = await walletState(store, user.id, today);
  const spend = planSpend(balance, user.isAnonymous ? "anon" : "registered");
  if (!spend.ok) {
    if (spend.error === "registration_required") {
      return c.json({ error: "registration_required", resetsAt: nextBangkokMidnight() }, 403);
    }
    return c.json(
      { error: "insufficient_tokens", balance: balance.wallet, needed: TOKENS_PER_QUESTION, resetsAt: nextBangkokMidnight() },
      402,
    );
  }
  await store.postLedger({
    userId: user.id,
    delta: -TOKENS_PER_QUESTION,
    reason: "reading",
    ref: row.id,
    source: spend.source,
    day: today,
  });
  await store.setReadingResult(row.id, { aiText: "", aiSummary: "", model: "", status: "drawn" });
  return c.json({ ok: true });
});

// Create (lazily) a share link for a reading or daily card.
/** SPEC §5.4 milestone keys: streak tiers + the 78-card daily deck. */
const STREAK_TIERS = [3, 7, 14, 30, 78, 100];

function milestoneLabel(ui: UiLang, key: string): string | null {
  const d = t(ui);
  if (key === "collection") return d.msCollection;
  const m = /^streak-(\d+)$/.exec(key);
  if (m && STREAK_TIERS.includes(Number(m[1]))) return d.msStreakDays.replace("{n}", m[1]);
  return null;
}

async function badgeAchieved(
  store: ReturnType<typeof d1TarotStore>,
  userId: string,
  key: string,
): Promise<boolean> {
  if (key === "collection") return (await store.collectionDaily(userId)).length >= 78;
  const m = /^streak-(\d+)$/.exec(key);
  if (!m || !STREAK_TIERS.includes(Number(m[1]))) return false;
  return computeStreak(await store.activityDays(userId), bangkokDay()).longest >= Number(m[1]);
}

// {kind:'reading'|'daily'|'badge', ref, mode} -> share URLs.
// Shares always include the question asked (owner decision).
app.post("/api/share", async (c) => {
  const user = await authedUser(c);
  if (!user || !c.env?.DB) return c.json({ error: "unauthorized" }, 401);
  let body: { kind?: unknown; ref?: unknown; showQuestion?: unknown; mode?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "bad_request" }, 400);
  }
  const showQuestion = true;
  const mode = body.mode === "night" ? "night" : "day";
  const store = d1TarotStore(c.env.DB);
  let shareId: string | null = null;
  let base = "";
  let lang = requestUiLang(c);
  if (body.kind === "reading") {
    if (typeof body.ref !== "string") return c.json({ error: "bad_request" }, 400);
    const row = await store.getReading(body.ref);
    if (!row || row.userId !== user.id || row.status !== "complete") {
      return c.json({ error: "not_found" }, 404);
    }
    lang = row.lang === "th" ? "th" : "en";
    shareId = row.shareId;
    if (!shareId) {
      shareId = newShareId();
    }
    await store.setReadingShare(body.ref, shareId, showQuestion);
    base = `/r/${shareId}`;
  } else if (body.kind === "daily") {
    const draw = await store.getDaily(user.id, bangkokDay());
    if (!draw) return c.json({ error: "no_daily" }, 400);
    lang = draw.lang === "th" ? "th" : "en";
    shareId = draw.shareId;
    if (!shareId) {
      shareId = newShareId();
      await store.setDailyShare(user.id, bangkokDay(), shareId);
    }
    base = `/d/${shareId}`;
  } else if (body.kind === "badge") {
    // Milestone badges (SPEC §5.4): the ref is a milestone key, and
    // the server re-checks the achievement before minting the link.
    const key = typeof body.ref === "string" ? body.ref : "";
    if (!(await badgeAchieved(store, user.id, key))) {
      return c.json({ error: "not_achieved" }, 400);
    }
    lang = requestUiLang(c);
    shareId = await store.getOrCreateBadgeShare(user.id, key, () => newShareId());
    base = `/b/${shareId}`;
  } else {
    return c.json({ error: "bad_kind" }, 400);
  }
  const origin = new URL(c.req.url).origin;
  return c.json({
    shareId,
    url: `${origin}${base}`,
    storyImageUrl: `${origin}${base}/story.png?lang=${lang}&mode=${mode}`,
    ogImageUrl: `${origin}${base}/og.png?lang=${lang}&mode=${mode}`,
  });
});

// Log a share-target tap (virality metrics).
app.post("/api/shares", async (c) => {
  const user = await authedUser(c);
  if (!user || !c.env?.DB) return c.json({ error: "unauthorized" }, 401);
  let body: { shareId?: unknown; target?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "bad_request" }, 400);
  }
  if (!isShareId(body.shareId)) return c.json({ error: "bad_request" }, 400);
  if (typeof body.target !== "string" || !(SHARE_TARGETS as readonly string[]).includes(body.target)) {
    return c.json({ error: "bad_request" }, 400);
  }
  const store = d1TarotStore(c.env.DB);
  if (!(await store.shareOwner(body.shareId))) return c.json({ error: "not_found" }, 404);
  await store.insertShare(crypto.randomUUID(), body.shareId, user.id, body.target);
  recordEvent(c.env, { name: "share_target", detail: body.target, ...requestContext(c), userKind: userKind(user) });
  return c.json({ ok: true });
});

// Unshare: the landing page becomes a friendly 410.
app.delete("/api/share/:shareId", async (c) => {
  const user = await authedUser(c);
  if (!user || !c.env?.DB) return c.json({ error: "unauthorized" }, 401);
  const shareId = c.req.param("shareId");
  if (!isShareId(shareId)) return c.json({ error: "bad_request" }, 400);
  const store = d1TarotStore(c.env.DB);
  const cleared =
    (await store.clearReadingShare(shareId, user.id)) ||
    (await store.clearDailyShare(shareId, user.id)) ||
    (await store.clearBadgeShare(shareId, user.id));
  if (!cleared) return c.json({ error: "not_found" }, 404);
  await deleteShareImages(c.env, shareId);
  return c.json({ ok: true });
});

async function landingCards(
  store: ReturnType<typeof d1TarotStore>,
  cards: { id: number; reversed: boolean }[],
  lang: "th" | "en",
): Promise<{ image: string; image2x: string; name: string; reversed: boolean; reversedLabel: string }[]> {
  const out = [];
  for (const card of cards) {
    const view = await store.getCard(card.id, lang);
    if (!view) continue;
    out.push({
      image: `/static/${view.imageKey}.webp`,
      image2x: `/static/${view.imageKey}@2x.webp`,
      name: view.name,
      reversed: card.reversed,
      reversedLabel: lang === "th" ? "\u0e01\u0e25\u0e31\u0e1a\u0e2b\u0e31\u0e27" : "reversed",
    });
  }
  return out;
}

app.get("/r/:shareId", async (c) => {
  const ui = requestUiLang(c);
  const origin = new URL(c.req.url).origin;
  const shareId = c.req.param("shareId");
  // Personal invite link (/r/NICE-XXXX, design board 2): save the
  // inviter for attribution and send the friend to the ask flow.
  if (isInviteCode(shareId) && c.env?.DB) {
    const code = normalizeInviteCode(shareId) as string;
    const ownerId = await d1TarotStore(c.env.DB).inviteOwner(code);
    if (ownerId) {
      setCookie(c, "tarotnice_ref", inviteRefFor(ownerId), {
        path: "/",
        maxAge: 7 * 24 * 3600,
        sameSite: "Lax",
      });
      recordEvent(c.env, { name: "share_landing", kind: "invite", ...requestContext(c), userKind: "guest" });
      return c.redirect(`/?ref=${code}&invited=${code}`, 302);
    }
    return c.html(unsharedPage(origin, ui), 410);
  }
  if (!isShareId(shareId) || !c.env?.DB) return c.html(unsharedPage(origin, ui), 410);
  const store = d1TarotStore(c.env.DB);
  const row = await store.getReadingByShare(shareId);
  if (!row) return c.html(unsharedPage(origin, ui), 410);
  const cards = await landingCards(store, row.cards, ui);
  recordEvent(c.env, { name: "share_landing", kind: "reading", ...requestContext(c), userKind: "guest" });
  return c.html(
    shareLandingPage({
      kind: "reading",
      origin,
      shareId,
      ui,
      cards,
      summary: row.aiSummary ?? "",
      question: row.showQuestion ? row.question : null,
      ogImage: `${origin}/r/${shareId}/og.png`,
    }),
  );
});

app.get("/d/:shareId", async (c) => {
  const ui = requestUiLang(c);
  const origin = new URL(c.req.url).origin;
  const shareId = c.req.param("shareId");
  if (!isShareId(shareId) || !c.env?.DB) return c.html(unsharedPage(origin, ui), 410);
  const store = d1TarotStore(c.env.DB);
  const row = await store.getDailyByShare(shareId);
  if (!row) return c.html(unsharedPage(origin, ui), 410);
  const cards = await landingCards(store, [{ id: row.cardId, reversed: row.reversed }], ui);
  recordEvent(c.env, { name: "share_landing", kind: "daily", ...requestContext(c), userKind: "guest" });
  return c.html(
    shareLandingPage({
      kind: "daily",
      origin,
      shareId,
      ui,
      cards,
      summary: row.message,
      question: null,
      ogImage: `${origin}/d/${shareId}/og.png`,
    }),
  );
});

app.get("/b/:shareId", async (c) => {
  const ui = requestUiLang(c);
  const origin = new URL(c.req.url).origin;
  const shareId = c.req.param("shareId");
  if (!isShareId(shareId) || !c.env?.DB) return c.html(unsharedPage(origin, ui), 410);
  const store = d1TarotStore(c.env.DB);
  const badge = await store.getBadgeShare(shareId);
  const label = badge ? milestoneLabel(ui, badge.milestoneKey) : null;
  if (!badge || !label) return c.html(unsharedPage(origin, ui), 410);
  recordEvent(c.env, { name: "share_landing", kind: "badge", ...requestContext(c), userKind: "guest" });
  return c.html(
    badgeLandingPage({ origin, shareId, ui, label, ogImage: `${origin}/b/${shareId}/og.png` }),
  );
});

async function badgeImageResponse(
  c: { env: Env; req: { query: (n: string) => string | undefined } },
  shareId: string,
  img: "story" | "og",
): Promise<Response> {
  if (!c.env?.DB || !c.env.MEDIA || !c.env.ASSETS) {
    return new Response("Share images unavailable", { status: 503 });
  }
  const qLang = c.req.query("lang");
  const qMode = c.req.query("mode");
  const mode = qMode === "night" ? "night" : "day";
  const lang: "th" | "en" = qLang === "en" || qLang === "th" ? qLang : "th";
  const badge = await d1TarotStore(c.env.DB).getBadgeShare(shareId);
  const label = badge ? milestoneLabel(lang, badge.milestoneKey) : null;
  if (!badge || !label) return new Response("Not found", { status: 404 });
  const key = `share/${shareId}/badge-${img}-${lang}-${mode}.png`;
  const hit = await c.env.MEDIA.get(key);
  if (hit) {
    return new Response(await hit.arrayBuffer(), {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  }
  try {
    const bytes = await renderBadgeImage(
      { MEDIA: c.env.MEDIA, ASSETS: c.env.ASSETS },
      { kind: img, label, lang, mode },
    );
    try {
      await c.env.MEDIA.put(key, bytes);
    } catch { /* cache write is best-effort */ }
    return new Response(bytes as unknown as BodyInit, {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch (err) {
    console.error("badge image render failed", err);
    return new Response("Render failed", { status: 503 });
  }
}

app.get("/b/:shareId/story.png", (c) => badgeImageResponse(c, c.req.param("shareId"), "story"));
app.get("/b/:shareId/og.png", (c) => badgeImageResponse(c, c.req.param("shareId"), "og"));

// Invite share image (1080x1080, design board 4). Public by code: the
// code is itself the capability, like a share id.
app.get("/invite/:code.png", async (c) => {
  const code = inviteCodeFromPngParam(c.req.param("code.png"));
  if (!code || !c.env?.DB || !c.env.MEDIA || !c.env.ASSETS) {
    return new Response("Not found", { status: 404 });
  }
  const store = d1TarotStore(c.env.DB);
  const ownerId = await store.inviteOwner(code);
  if (!ownerId) return new Response("Not found", { status: 404 });
  const qLang = c.req.query("lang");
  const qMode = c.req.query("mode");
  const mode = qMode === "night" ? "night" : "day";
  const lang: "th" | "en" = qLang === "en" || qLang === "th" ? qLang : "th";
  const key = `invite/${code}/${lang}-${mode}.png`;
  const hit = await c.env.MEDIA.get(key);
  if (hit) {
    return new Response(await hit.arrayBuffer(), {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  }
  const prefs = await d1PrefsStore(c.env.DB).get(ownerId);
  try {
    const bytes = await renderInviteImage(
      { MEDIA: c.env.MEDIA, ASSETS: c.env.ASSETS },
      { name: prefs?.nickname ?? null, code, lang, mode },
    );
    try { await c.env.MEDIA.put(key, bytes); } catch { /* cache write is best-effort */ }
    return new Response(bytes as unknown as BodyInit, {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch (err) {
    console.error("invite image render failed", err);
    return new Response("Render failed", { status: 503 });
  }
});

async function shareImageResponse(
  c: { env: Env; req: { query: (n: string) => string | undefined } },
  kind: "reading" | "daily",
  shareId: string,
  img: "story" | "og",
): Promise<Response> {
  const empty = new Response("Not found", { status: 404 });
  if (!c.env?.DB || !c.env.MEDIA || !c.env.ASSETS) {
    return new Response("Share images unavailable", { status: 503 });
  }
  const store = d1TarotStore(c.env.DB);
  const qLang = c.req.query("lang");
  const qMode = c.req.query("mode");
  const mode = qMode === "night" ? "night" : "day";
  let lang: "th" | "en" = qLang === "en" || qLang === "th" ? qLang : "th";
  let cards: { id: number; reversed: boolean }[] = [];
  let summary = "";
  let question: string | null = null;
  if (kind === "reading") {
    const row = await store.getReadingByShare(shareId);
    if (!row) return empty;
    if (qLang !== "en" && qLang !== "th") lang = row.lang === "th" ? "th" : "en";
    cards = row.cards;
    summary = row.aiSummary ?? "";
    if (img === "story" && row.showQuestion) question = row.question;
  } else {
    const row = await store.getDailyByShare(shareId);
    if (!row) return empty;
    if (qLang !== "en" && qLang !== "th") lang = row.lang === "th" ? "th" : "en";
    cards = [{ id: row.cardId, reversed: row.reversed }];
    summary = row.message;
  }
  const views: ShareCard[] = [];
  for (const card of cards) {
    const view = await store.getCard(card.id, lang);
    if (!view) return empty;
    views.push({ key: view.imageKey.replace(/^cards\//, ""), name: view.name, reversed: card.reversed });
  }
  const r2key = `share/${shareId}/${img}-${lang}-${mode}${question ? "-q" : ""}.png`;
  const cached = await c.env.MEDIA.get(r2key);
  if (cached) {
    const headers = new Headers();
    cached.writeHttpMetadata(headers);
    headers.set("Content-Type", "image/png");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    return new Response(await cached.arrayBuffer(), { headers });
  }
  let png: Uint8Array;
  try {
    png = await renderShareImage(
      { MEDIA: c.env.MEDIA, ASSETS: c.env.ASSETS },
      { kind: img, shareKind: kind, lang, mode, cards: views, summary, question },
    );
  } catch (error) {
    console.error(JSON.stringify({ message: "share image failed", error: error instanceof Error ? error.message : String(error) }));
    return new Response("Share images unavailable", { status: 503 });
  }
  try {
    await c.env.MEDIA.put(r2key, png.slice().buffer as ArrayBuffer, {
      httpMetadata: { contentType: "image/png", cacheControl: "public, max-age=31536000, immutable" },
    });
  } catch {
    /* serve anyway */
  }
  return new Response(png.slice().buffer as ArrayBuffer, {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}

app.get("/r/:shareId/story.png", (c) => shareImageResponse(c, "reading", c.req.param("shareId"), "story"));
app.get("/r/:shareId/og.png", (c) => shareImageResponse(c, "reading", c.req.param("shareId"), "og"));
app.get("/d/:shareId/story.png", (c) => shareImageResponse(c, "daily", c.req.param("shareId"), "story"));
app.get("/d/:shareId/og.png", (c) => shareImageResponse(c, "daily", c.req.param("shareId"), "og"));

// Billing: token packs, history, invite panel. Registered users only;
// guests land on sign-in with a return path (design: account first).
app.get("/billing", async (c) => {
  c.header("Cache-Control", "private, no-store");
  const user = await currentUser(c);
  if (!user || !isRegisteredUser(user)) {
    return c.redirect(`/sign-in?return=${encodeURIComponent("/billing")}`, 302);
  }
  const ui = requestUiLang(c);
  const store = d1TarotStore(c.env.DB);
  const today = bangkokDay();
  await ensureDailyGrant(store, user.id, today);
  const balance = await walletState(store, user.id, today);
  return c.html(
    billingPage({
      ui,
      origin: new URL(c.req.url).origin,
      env: c.env,
      balance: balance.wallet,
      freeLeft: balance.dailyLeft,
    }),
  );
});

// Post-checkout landing: verify the session server-side (credits only
// ever land via the webhook; this page just reports honestly).
app.get("/billing/success", async (c) => {
  c.header("Cache-Control", "private, no-store");
  const ui = requestUiLang(c);
  const origin = new URL(c.req.url).origin;
  const returnTo = safeReturnPath(c.req.query("return"));
  const sessionId = c.req.query("session_id") ?? "";
  let state: "verified" | "pending" | "failed" = "failed";
  if (tokensConfigured(c.env) && sessionId) {
    try {
      const session = await retrieveCheckoutSession(c.env, sessionId);
      state = session.payment_status === "paid" ? "verified" : "pending";
    } catch {
      state = "failed";
    }
  }
  return c.html(billingSuccessPage({ ui, origin, returnTo, state }));
});

app.get("/billing/cancel", (c) => {
  c.header("Cache-Control", "private, no-store");
  const returnTo = safeReturnPath(c.req.query("return"));
  return c.html(billingCancelPage({ ui: requestUiLang(c), origin: new URL(c.req.url).origin, returnTo }));
});

// Account pages (free registration saves readings across devices).
app.get("/register", (c) => c.html(registerPage(c.req.query("return"), new URL(c.req.url).origin, requestUiLang(c))));
app.get("/sign-in", (c) => c.html(signInPage(c.req.query("return"), new URL(c.req.url).origin, requestUiLang(c))));
app.get("/forgot-password", (c) => c.html(forgotPasswordPage(new URL(c.req.url).origin, requestUiLang(c))));
app.get("/reset-password", (c) => c.html(resetPasswordPage(c.req.query("token") ?? "", new URL(c.req.url).origin, requestUiLang(c))));
app.get("/account", async (c) => {
  // Signed-in area: never render account controls for guests or
  // anonymous sessions, and never let a browser cache the signed-in
  // page (a cached copy survives sign-out via back/bfcache).
  c.header("Cache-Control", "private, no-store");
  const user = await currentUser(c);
  if (!user || !isRegisteredUser(user)) {
    return c.redirect(`/sign-in?return=${encodeURIComponent("/account")}`, 302);
  }
  const prefs = c.env?.DB ? await d1PrefsStore(c.env.DB).get(user.id) : null;
  return c.html(
    accountPage(new URL(c.req.url).origin, user?.email ?? "", requestUiLang(c), {
      lang: prefs?.lang ?? "en",
      theme: prefs?.theme ?? null,
      nickname: prefs?.nickname ?? null,
    }),
  );
});

/** Streak for pages (signed-in users only; guests see zeros). */
async function pageStreak(db: D1Database | undefined, userId: string | null) {
  if (!db || !userId) return { current: 0, longest: 0, activeToday: false };
  try {
    return computeStreak(await d1TarotStore(db).activityDays(userId), bangkokDay());
  } catch {
    return { current: 0, longest: 0, activeToday: false };
  }
}

function signInReturn(c: { req: { path: string } }) {
  return `/sign-in?return=${encodeURIComponent(c.req.path)}`;
}

/** Localized topic chip label. */
function topicLabel(ui: UiLang, topic: string): string {
  const d = t(ui);
  return topic === "love" ? d.topicLove
    : topic === "career" ? d.topicCareer
    : topic === "money" ? d.topicMoney
    : topic === "health" ? d.topicHealth
    : d.topicGeneral;
}

// Reading history (signed-in area, noindex): reverse-chron list of 30
// with ?cursor= paging. Card names/images come from one listCards call
// so the page costs 2 queries, not 1 + 3 per reading.
app.get("/history", async (c) => {
  c.header("Cache-Control", "private, no-store");
  const user = await currentUser(c);
  if (!user || !c.env?.DB) return c.redirect(signInReturn(c), 302);
  const ui = requestUiLang(c);
  const lang = ui === "th" ? "th" : "en";
  const rawCursor = c.req.query("cursor");
  const cursor = rawCursor ? Number(rawCursor) : null;
  const store = d1TarotStore(c.env.DB);
  const [items, cards] = await Promise.all([
    store.listReadings(user.id, cursor !== null && Number.isFinite(cursor) ? cursor : null, 30),
    store.listCards(lang),
  ]);
  const byId = new Map(cards.map((card) => [card.id, card]));
  const revLabel = t(ui).reversed;
  return c.html(
    historyPage({
      ui,
      origin: new URL(c.req.url).origin,
      streak: await pageStreak(c.env.DB, user.id),
      items: items.map((r) => ({
        id: r.id,
        day: r.day,
        topic: r.topic,
        topicLabel: topicLabel(ui, r.topic),
        question: r.question,
        cards: r.cards.map((card) => {
          const view = byId.get(card.id);
          return {
            name: view?.name ?? `#${card.id}`,
            reversed: card.reversed,
            image: view ? `/static/${view.imageKey}.webp` : "",
            reversedLabel: revLabel,
          };
        }),
        summary: r.aiSummary,
        status: r.status,
        createdAt: r.createdAt,
      })),
      nextCursor: items.length === 30 ? items[items.length - 1].createdAt : null,
    }),
  );
});

// One reading: full interpretation, cards, journal, share + delete.
app.get("/history/:id", async (c) => {
  c.header("Cache-Control", "private, no-store");
  const user = await currentUser(c);
  if (!user || !c.env?.DB) return c.redirect(signInReturn(c), 302);
  const ui = requestUiLang(c);
  const store = d1TarotStore(c.env.DB);
  const reading = await store.getReading(c.req.param("id"));
  if (!reading || reading.userId !== user.id) return c.text("Not found", 404);
  const lang = reading.lang === "th" ? "th" : "en";
  const revLabel = t(ui).reversed;
  const cards = [];
  for (const card of reading.cards) {
    const view = await store.getCard(card.id, lang);
    if (view) {
      cards.push({
        name: view.name,
        image: `/static/${view.imageKey}.webp`,
        image2x: `/static/${view.imageKey}@2x.webp`,
        reversed: card.reversed,
        reversedLabel: revLabel,
      });
    }
  }
  return c.html(
    historyDetailPage({
      ui,
      origin: new URL(c.req.url).origin,
      streak: await pageStreak(c.env.DB, user.id),
      reading: {
        id: reading.id,
        topicLabel: topicLabel(ui, reading.topic),
        question: reading.question,
        cards,
        aiText: reading.aiText,
        journal: reading.journal,
        status: reading.status,
      },
    }),
  );
});

// Public card data (SPEC §12): the library as JSON. The draw client
// maps the ids from POST /api/readings onto these at pick time, so
// names never travel with the draw itself.
app.get("/api/cards", async (c) => {
  const qLang = c.req.query("lang");
  const lang: "th" | "en" = isLang(qLang) ? qLang : requestUiLang(c);
  const cards = c.env?.DB ? await d1TarotStore(c.env.DB).listCards(lang) : [];
  return c.json({
    cards: cards.map((card) => ({
      id: card.id,
      slug: card.slug,
      name: card.name,
      nameEn: card.nameEn ?? card.name,
      image: `/static/${card.imageKey}.webp`,
      image2x: `/static/${card.imageKey}@2x.webp`,
      arcana: card.arcana,
      suit: card.suit,
      rank: card.rank,
      reviewed: card.reviewed,
      keywordsUpright: card.keywordsUpright,
      keywordsReversed: card.keywordsReversed,
    })),
  });
});

app.get("/api/cards/:slug", async (c) => {
  if (!c.env?.DB) return c.json({ error: "not_found" }, 404);
  const qLang = c.req.query("lang");
  const lang: "th" | "en" = isLang(qLang) ? qLang : requestUiLang(c);
  const card = await d1TarotStore(c.env.DB).getCardBySlug(c.req.param("slug"), lang);
  if (!card) return c.json({ error: "not_found" }, 404);
  return c.json({
    id: card.id, slug: card.slug, name: card.name, nameEn: card.nameEn ?? card.name,
    image: `/static/${card.imageKey}.webp`,
    image2x: `/static/${card.imageKey}@2x.webp`,
    arcana: card.arcana, suit: card.suit, rank: card.rank,
    reviewed: card.reviewed,
    keywordsUpright: card.keywordsUpright,
    keywordsReversed: card.keywordsReversed,
    upright: card.upright, reversed: card.reversed,
    love: card.love, career: card.career, money: card.money, health: card.health,
  });
});

// Paginated history for infinite scroll (newest first).
app.get("/api/readings", async (c) => {
  const user = await authedUser(c);
  if (!user || !c.env?.DB) return c.json({ error: "unauthorized" }, 401);
  const rawCursor = c.req.query("cursor");
  const cursor = rawCursor ? Number(rawCursor) : null;
  if (rawCursor && (!Number.isFinite(cursor) || (cursor as number) <= 0)) {
    return c.json({ error: "bad_cursor" }, 400);
  }
  const rawLimit = Number(c.req.query("limit") ?? "20");
  const limit = Number.isFinite(rawLimit) ? Math.min(30, Math.max(1, Math.floor(rawLimit))) : 20;
  const items = await d1TarotStore(c.env.DB).listReadings(user.id, cursor, limit);
  const nextCursor = items.length === limit ? items[items.length - 1].createdAt : null;
  return c.json({
    items: items.map((r) => ({
      id: r.id, day: r.day, topic: r.topic, question: r.question, lang: r.lang,
      aiSummary: r.aiSummary, status: r.status, journal: r.journal,
      shared: r.shareId !== null, createdAt: r.createdAt,
    })),
    nextCursor,
  });
});

/**
 * Remove every rendered share image for a share id. Images live at
 * share/{shareId}/{story|og}-{lang}-{mode}[-q].png (plus badge
 * variants), so delete by prefix — story images can embed the
 * user's question and must not outlive the share.
 */
async function deleteShareImages(env: Env, shareId: string): Promise<void> {
  const media = env.MEDIA;
  if (!media) return;
  try {
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const listed = await media.list({ prefix: `share/${shareId}/`, cursor });
      for (const obj of listed.objects) {
        try {
          await media.delete(obj.key);
        } catch { /* best-effort per object */ }
      }
      if (!listed.truncated) break;
      cursor = listed.cursor;
    }
  } catch {
    /* best-effort */
  }
}

// Delete a reading (also clears its share rows + R2 images best-effort).
app.delete("/api/readings/:id", async (c) => {
  const user = await authedUser(c);
  if (!user || !c.env?.DB) return c.json({ error: "unauthorized" }, 401);
  const store = d1TarotStore(c.env.DB);
  const reading = await store.getReading(c.req.param("id"));
  if (!reading || reading.userId !== user.id) return c.json({ error: "not_found" }, 404);
  await store.deleteReading(reading.id, user.id);
  if (reading.shareId) await deleteShareImages(c.env, reading.shareId);
  return c.body(null, 204);
});

// Save / clear the private journal note (500 chars, matches the form).
app.put("/api/readings/:id/journal", async (c) => {
  const user = await authedUser(c);
  if (!user || !c.env?.DB) return c.json({ error: "unauthorized" }, 401);
  let body: { journal?: unknown; text?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "bad_request" }, 400);
  }
  // SPEC §12 names the field {text}; the app sends {journal}. Accept both.
  if (body.journal === undefined && body.text !== undefined) body.journal = body.text;
  if (body.journal !== null && typeof body.journal !== "string") {
    return c.json({ error: "bad_request" }, 400);
  }
  const journal = typeof body.journal === "string" ? body.journal.trim() : null;
  if (journal && [...journal].length > 500) return c.json({ error: "too_long" }, 400);
  const ok = await d1TarotStore(c.env.DB).setJournal(c.req.param("id"), user.id, journal || null);
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true, journal: journal || null });
});

// Progress: streak, 14-day grid, personal best, 78-card collection,
// referrals, milestones.
app.get("/progress", async (c) => {
  c.header("Cache-Control", "private, no-store");
  const user = await currentUser(c);
  if (!user || !c.env?.DB) return c.redirect(signInReturn(c), 302);
  const ui = requestUiLang(c);
  const lang = ui === "th" ? "th" : "en";
  const store = d1TarotStore(c.env.DB);
  const [stats, days, ownedDaily, referrals, cards, recent] = await Promise.all([
    store.progressStats(user.id),
    store.activityDays(user.id),
    store.collectionDaily(user.id),
    store.referralStats(user.id),
    store.listCards(lang),
    store.recentDailies(user.id, 7),
  ]);
  const d = t(ui);
  const streak = computeStreak(days, bangkokDay());
  const byId = new Map(cards.map((card) => [card.id, card]));
  const cardNames: Record<number, string> = {};
  for (const card of cards) cardNames[card.id] = card.name;
  // SPEC §5.4: streak badges at 3/7/14/30/78/100 (shareable via
  // kind:'badge'), deck = cards drawn as DAILY cards only.
  const milestones = [
    ...STREAK_TIERS.map((tier) => ({
      key: `streak-${tier}`,
      label: d.msStreakDays.replace("{n}", String(tier)),
      achieved: streak.longest >= tier,
    })),
    { key: "collection", label: d.msCollection, achieved: ownedDaily.length >= 78 },
  ];
  return c.html(
    progressPage({
      ui,
      origin: new URL(c.req.url).origin,
      streak,
      days: last14Days(days),
      owned: ownedDaily,
      cardNames,
      referrals,
      bonusOn: c.env.REFERRAL_BONUS === "1",
      milestones,
      readings: stats.readings,
      recentDaily: recent.map((r) => {
        const view = byId.get(r.cardId);
        return {
          name: view?.name ?? `#${r.cardId}`,
          image: view ? `/static/${view.imageKey}.webp` : "",
          day: r.day,
        };
      }),
    }),
  );
});

/** Last 14 Bangkok days ending today, oldest first. */
function last14Days(days: string[]): { date: string; active: boolean }[] {
  const active = new Set(days);
  // Bangkok "today": UTC + 7h, floored to a UTC day.
  const todayMs = Date.now() + 7 * 3600 * 1000;
  const today = new Date(todayMs);
  today.setUTCHours(0, 0, 0, 0);
  const out: { date: string; active: boolean }[] = [];
  for (let back = 13; back >= 0; back--) {
    const key = new Date(today.getTime() - back * 24 * 3600 * 1000).toISOString().slice(0, 10);
    out.push({ date: key, active: active.has(key) });
  }
  return out;
}

// Card library index: major arcana first, then the four suits.
// Served at /cards (UI language) and /th/cards (always Thai).
type PageCtx = {
  env?: Env;
  html: (html: string) => Response | Promise<Response>;
  req: { url: string };
};

async function cardsIndex(c: PageCtx, ui: UiLang, prefix: string, userId: string | null) {
  const lang = ui === "th" ? "th" : "en";
  const cards = c.env?.DB ? await d1TarotStore(c.env.DB).listCards(lang) : [];
  const toCard = (card: (typeof cards)[number]) => ({
    id: card.id,
    slug: card.slug,
    name: card.name,
    image: `/static/${card.imageKey}.webp`,
    image2x: `/static/${card.imageKey}@2x.webp`,
    reviewed: card.reviewed,
  });
  const d = t(ui);
  const groups = [
    { title: d.majorArcana, cards: cards.filter((x) => x.arcana === "major").map(toCard) },
  ];
  const suitTitles: Record<string, string> = {
    wands: d.suitWands,
    cups: d.suitCups,
    swords: d.suitSwords,
    pentacles: d.suitPentacles,
  };
  for (const suit of ["wands", "cups", "swords", "pentacles"]) {
    groups.push({
      title: suitTitles[suit],
      cards: cards.filter((x) => x.suit === suit).map(toCard),
    });
  }
  return c.html(
    cardsPage({
      ui,
      origin: new URL(c.req.url).origin,
      streak: await pageStreak(c.env?.DB, userId),
      groups,
      prefix,
    }),
  );
}

app.get("/cards", async (c) => cardsIndex(c, requestUiLang(c), "", (await currentUser(c))?.id ?? null));
app.get("/th/cards", async (c) => cardsIndex(c, "th", "/th", (await currentUser(c))?.id ?? null));

// Card detail: meanings by topic + prev/next; drafts carry noindex.
// Served at /cards/:slug (UI language) and /th/cards/:slug (Thai).
async function cardDetail(
  c: PageCtx & { text: (text: string, status: 404) => Response },
  ui: UiLang,
  prefix: string,
  slug: string,
  userId: string | null,
) {
  const lang = ui === "th" ? "th" : "en";
  if (!c.env?.DB) return c.text("Not found", 404);
  const store = d1TarotStore(c.env.DB);
  const card = await store.getCardBySlug(slug, lang);
  if (!card) return c.text("Not found", 404);
  const all = await store.listCards(lang);
  const idx = all.findIndex((x) => x.id === card.id);
  const dd = t(ui);
  const topicNote = (label: string, text: string | null) =>
    text ? { label, text } : null;
  const notes = [
    topicNote(dd.topicLove, card.love),
    topicNote(dd.topicCareer, card.career),
    topicNote(dd.topicMoney, card.money),
    topicNote(dd.topicHealth, card.health),
  ].filter((n): n is { label: string; text: string } => n !== null);
  return c.html(
    cardDetailPage({
      ui,
      origin: new URL(c.req.url).origin,
      streak: await pageStreak(c.env.DB, userId),
      prefix,
      card: {
        slug: card.slug,
        name: card.name,
        image: `/static/${card.imageKey}.webp`,
        image2x: `/static/${card.imageKey}@2x.webp`,
        reviewed: card.reviewed,
        keywordsUpright: card.keywordsUpright,
        keywordsReversed: card.keywordsReversed,
        upright: card.upright,
        reversed: card.reversed,
        notes,
        prev: idx > 0 ? { slug: all[idx - 1].slug, name: all[idx - 1].name } : null,
        next: idx >= 0 && idx < all.length - 1 ? { slug: all[idx + 1].slug, name: all[idx + 1].name } : null,
      },
    }),
  );
}

app.get("/cards/:slug", async (c) =>
  cardDetail(c, requestUiLang(c), "", c.req.param("slug"), (await currentUser(c))?.id ?? null));
app.get("/th/cards/:slug", async (c) =>
  cardDetail(c, "th", "/th", c.req.param("slug"), (await currentUser(c))?.id ?? null));

// Better Auth handler (social callbacks, anonymous sign-in, session, ...).
app.on(["GET", "POST"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

// Smallest authenticated probe: returns the current session user or 401.
app.get("/api/me", async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session) return c.json({ error: "unauthorized" }, 401);
  return c.json({ user: session.user, userKind: userKind(session.user as SessionUser) });
});

function questionLimit(env: Env | undefined): number {
  const n = Number(env?.DAILY_QUESTION_LIMIT ?? "1");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

/** 10-char unguessable public id (base62). Never expose readings.id. */
function newShareId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  return [...buf].map((v) => chars[v % 62]).join("");
}

function isShareId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9]{10}$/.test(value);
}

const SHARE_TARGETS = ["native", "line", "facebook", "x", "instagram", "copy", "save"] as const;

function refCookie(c: { req: { raw: Request; header: (n: string) => string | undefined } }): string | null {
  const header = c.req.header("cookie") ?? "";
  const found = header
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith("tarotnice_ref="))
    ?.slice("tarotnice_ref=".length);
  const ref = found ? decodeURIComponent(found) : "";
  if (isShareId(ref)) return ref;
  if (parseInviteRef(ref)) return ref;
  return null;
}

/**
 * Resolve any referral ref to its owner user id: personal invites
 * (`inv:<userId>`) resolve directly; reading/daily share ids resolve
 * through their share rows. Null when unknown or self-referral.
 */
async function resolveRefOwner(
  store: ReturnType<typeof d1TarotStore>,
  ref: string,
  visitorId: string,
): Promise<string | null> {
  const invitedBy = parseInviteRef(ref);
  if (invitedBy) return invitedBy === visitorId ? null : invitedBy;
  const owner = await store.shareOwner(ref);
  if (!owner || owner.userId === visitorId) return null;
  return owner.userId;
}

/** Attribute a referred visitor once (first touch wins). */
async function attributeReferral(
  c: { env: Env; req: { raw: Request; header: (n: string) => string | undefined } },
  store: ReturnType<typeof d1TarotStore>,
  userId: string,
): Promise<void> {
  const ref = refCookie(c);
  if (!ref) return;
  try {
    if (await store.getReferral(userId)) return;
    const ownerId = await resolveRefOwner(store, ref, userId);
    if (!ownerId) return;
    await store.insertReferral(userId, ref, ownerId);
    recordEvent(c.env, { name: "referral_signup", ...requestContext(c), userKind: "anon" });
  } catch {
    /* attribution is best-effort */
  }
}

/** Effective question limit: base + referral bonus (max +3/day,
 *  only when REFERRAL_BONUS is switched on). */
async function effectiveLimit(
  env: Env,
  store: ReturnType<typeof d1TarotStore>,
  userId: string,
): Promise<number> {
  const base = questionLimit(env);
  if (env.REFERRAL_BONUS !== "1") return base;
  try {
    const since = nextBangkokMidnight() - 24 * 3600 * 1000;
    const bonus = await store.countReferralBonus(userId, since);
    return base + Math.min(3, bonus);
  } catch {
    return base;
  }
}

// --- Token wallet helpers (rules in lib/wallet.ts) ---

type WalletStore = ReturnType<typeof d1TarotStore>;

async function walletState(store: WalletStore, userId: string, today: string) {
  const rows = await store.ledgerRows(userId);
  return walletBalance(
    rows.map((r): LedgerRow => ({
      delta: r.delta,
      reason: r.reason as LedgerRow["reason"],
      source: (r.source as LedgerRow["source"]) ?? null,
      day: r.day,
      createdAt: r.createdAt,
    })),
    today,
  );
}

/** Lazily grant today's free credit (idempotent per Bangkok day). */
async function ensureDailyGrant(store: WalletStore, userId: string, today: string): Promise<void> {
  try {
    await store.postLedger({
      userId,
      delta: DAILY_FREE_TOKENS,
      reason: "daily",
      ref: `daily:${today}`,
      day: today,
    });
  } catch {
    /* grant is best-effort; the balance read still succeeds */
  }
}

/** Questions the user can still ask without paying (free, then packs). */
function questionsLeft(balance: { wallet: number; dailyLeft: number }): number {
  return (
    (balance.dailyLeft >= TOKENS_PER_QUESTION ? 1 : 0) +
    Math.floor(Math.max(0, balance.wallet) / TOKENS_PER_QUESTION)
  );
}

/**
 * Design referral rule: +5 tokens when a friend finishes their first
 * reading, capped at REFERRAL_DAILY_CAP friends per Bangkok day. One
 * reward per friend ever (ledger ref = referee id). Best-effort.
 */
async function rewardReferrer(
  store: WalletStore,
  referrerId: string,
  refereeId: string,
  today: string,
): Promise<void> {
  try {
    if (referrerId === refereeId) return;
    const dayRows = await store.ledgerRowsForDay(referrerId, today);
    const todayLedger: LedgerRow[] = dayRows.map((r) => ({
      delta: r.delta,
      reason: r.reason as LedgerRow["reason"],
      source: (r.source as LedgerRow["source"]) ?? null,
      day: r.day,
      createdAt: r.createdAt,
    }));
    if (rewardsTodayCount(todayLedger, today) >= REFERRAL_DAILY_CAP) return;
    await store.postLedger({
      userId: referrerId,
      delta: REFERRAL_REWARD_TOKENS,
      reason: "referral",
      ref: refereeId,
      day: today,
    });
  } catch {
    /* reward is best-effort */
  }
}

function authedUser(c: { env: AuthEnv; req: { raw: { headers: Headers } } }) {
  return currentUser(c);
}

// Everything the client needs on load: user, prefs, streak, quota,
// Server wins over localStorage.
app.get("/api/me/summary", async (c) => {
  const ui = requestUiLang(c);
  const user = await authedUser(c);
  if (!user || !c.env?.DB) {
    return c.json({
      user: null,
      prefs: { lang: ui, theme: null, nickname: null },
      streak: { current: 0, longest: 0, activeToday: false },
      quota: { used: 0, limit: questionLimit(c.env), resetsAt: nextBangkokMidnight() },
    });
  }
  const store = d1TarotStore(c.env.DB);
  const today = bangkokDay();
  await ensureDailyGrant(store, user.id, today);
  const [prefs, used, days, balance] = await Promise.all([
    d1PrefsStore(c.env.DB).get(user.id),
    store.countReadings(user.id, today),
    store.activityDays(user.id),
    walletState(store, user.id, today),
  ]);
  return c.json({
    user: { id: user.id, email: user.email, isAnonymous: user.isAnonymous },
    prefs: prefs ?? { lang: ui, theme: null, nickname: null },
    streak: computeStreak(days, today),
    quota: { used, limit: await effectiveLimit(c.env, store, user.id), resetsAt: nextBangkokMidnight() },
    tokens: {
      balance: balance.wallet,
      freeLeft: balance.dailyLeft,
      remaining: questionsLeft(balance),
      configured: tokensConfigured(c.env),
    },
  });
});

/**
 * Public invite-code lookup for the sign-up form's Apply state
 * (design board 3): resolves a code to its owner's display name.
 * Existence of a code is not a secret — codes are printed on shares.
 */
app.get("/api/me/invite/lookup", async (c) => {
  const code = normalizeInviteCode(c.req.query("code"));
  if (!code || !c.env?.DB) return c.json({ error: "unknown_code" }, 404);
  const store = d1TarotStore(c.env.DB);
  const ownerId = await store.inviteOwner(code);
  if (!ownerId) return c.json({ error: "unknown_code" }, 404);
  const prefs = await d1PrefsStore(c.env.DB).get(ownerId);
  return c.json({ owner: true, name: prefs?.nickname ?? null });
});

/**
 * Redeem an invite code (design board 3): attribute this registered
 * user to the code's owner (first touch wins) and credit the one-off
 * +5-token joining bonus. Called after sign-up with the applied code,
 * or with the saved ref cookie when no code is typed.
 */
app.post("/api/me/invite", async (c) => {
  const user = await authedUser(c);
  if (!user || !c.env?.DB) return c.json({ error: "unauthorized" }, 401);
  if (user.isAnonymous) return c.json({ error: "registration_required" }, 403);
  let body: { code?: unknown };
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const store = d1TarotStore(c.env.DB);
  const today = bangkokDay();
  try {
    let ref: string | null = null;
    if (isInviteCode(body.code)) {
      const ownerId = await store.inviteOwner(normalizeInviteCode(body.code) as string);
      if (!ownerId) return c.json({ error: "unknown_code" }, 404);
      if (ownerId === user.id) return c.json({ error: "own_code" }, 400);
      ref = inviteRefFor(ownerId);
    } else if (typeof body.code === "string" && body.code.trim()) {
      return c.json({ error: "unknown_code" }, 404);
    } else {
      ref = refCookie(c);
    }
    if (ref) {
      if (!(await store.getReferral(user.id))) {
        const ownerId = await resolveRefOwner(store, ref, user.id);
        if (ownerId) {
          await store.insertReferral(user.id, ref, ownerId);
          recordEvent(c.env, { name: "referral_signup", ...requestContext(c), userKind: userKind(user) });
        }
      }
    }
    const referral = await store.getReferral(user.id);
    if (!referral) return c.json({ attributed: false, bonus: 0 });
    const credited = await store.postLedger({
      userId: user.id,
      delta: REFERRAL_FRIEND_BONUS_TOKENS,
      reason: "referral",
      ref: `friend-bonus:${user.id}`,
      day: today,
    });
    return c.json({ attributed: true, bonus: credited ? REFERRAL_FRIEND_BONUS_TOKENS : 0 });
  } catch {
    return c.json({ error: "invite_failed" }, 500);
  }
});

// Transaction history (Transactions tab): cursor-paginated ledger rows
// behind the All / Top-up / Daily / Tarot-reading filters.
app.get("/api/me/transactions", async (c) => {
  const user = await authedUser(c);
  if (!user || !c.env?.DB) return c.json({ error: "unauthorized" }, 401);
  const filterRaw = c.req.query("filter") ?? "all";
  if (!isTransactionFilter(filterRaw)) return c.json({ error: "bad_filter" }, 400);
  const cursorRaw = Number(c.req.query("cursor"));
  const cursor = Number.isFinite(cursorRaw) && cursorRaw > 0 ? Math.floor(cursorRaw) : null;
  const store = d1TarotStore(c.env.DB);
  const today = bangkokDay();
  const rows = await store.listTransactions({
    userId: user.id,
    reasons: reasonsForFilter(filterRaw),
    cursor,
    limit: 30,
  });
  // A daily grant is "used" when that day has a daily-source spend.
  const spentDays = new Set(
    (await store.ledgerRows(user.id))
      .filter((r) => r.reason === "reading" && r.source === "daily")
      .map((r) => r.day),
  );
  const items = rows.map((r) => ({
    delta: r.delta,
    reason: r.reason,
    source: r.source,
    day: r.day,
    createdAt: r.createdAt,
    ...(r.reason === "daily"
      ? { status: spentDays.has(r.day) ? "used" : r.day === today ? "available" : "expired" }
      : {}),
  }));
  return c.json({
    items,
    nextCursor: rows.length === 30 ? rows[rows.length - 1].createdAt : null,
  });
});

// Referrals tab (design board 1): own code/link, today's reward
// progress, totals, and per-friend states.
app.get("/api/me/referrals", async (c) => {
  const user = await authedUser(c);
  if (!user || !c.env?.DB) return c.json({ error: "unauthorized" }, 401);
  const store = d1TarotStore(c.env.DB);
  const today = bangkokDay();
  const code = await store.ensureInviteCode(user.id, inviteCodeFor(user.id));
  const origin = new URL(c.req.url).origin;
  const [friends, allRows] = await Promise.all([
    store.listReferralFriends(user.id),
    store.ledgerRows(user.id),
  ]);
  const rewarded = new Set(
    allRows.filter((r) => r.reason === "referral" && !r.ref.startsWith("friend-bonus:")).map((r) => r.ref),
  );
  const todayRows: LedgerRow[] = (await store.ledgerRowsForDay(user.id, today)).map((r) => ({
    delta: r.delta,
    reason: r.reason as LedgerRow["reason"],
    source: (r.source as LedgerRow["source"]) ?? null,
    day: r.day,
    createdAt: r.createdAt,
  }));
  const list = friends.map((f) => {
    let status: "rewarded" | "read" | "joined" = "joined";
    if (rewarded.has(f.visitorUserId)) status = "rewarded";
    else if (f.firstReadingAt) status = "read";
    else if (!f.isAnonymous) status = "joined";
    return {
      name: f.nickname,
      status,
      joinedAt: f.createdAt,
      readAt: f.firstReadingAt,
    };
  });
  return c.json({
    code,
    link: `${origin}/r/${code}`,
    rewardToday: rewardsTodayCount(todayRows, today),
    rewardCap: REFERRAL_DAILY_CAP,
    totalEarned: allRows
      .filter((r) => r.reason === "referral" && !r.ref.startsWith("friend-bonus:"))
      .reduce((sum, r) => sum + r.delta, 0),
    friends: list,
  });
});

// Token-pack checkout (nicelingo model): registered users only, prices
// are Dashboard objects referenced by env id — clients never name amounts.
app.post("/api/billing/checkout", async (c) => {
  const user = await authedUser(c);
  if (!user || !c.env?.DB) return c.json({ error: "unauthorized" }, 401);
  if (user.isAnonymous) return c.json({ error: "registration_required" }, 403);
  if (!tokensConfigured(c.env)) return c.json({ error: "billing_not_configured" }, 503);
  let body: { pack?: unknown; return?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "bad_request" }, 400);
  }
  if (!isPackId(body.pack)) return c.json({ error: "unknown_pack" }, 400);
  const pack = PACKS[body.pack];
  const priceId = packPriceId(c.env, pack.id);
  if (!priceId) return c.json({ error: "plan_not_configured" }, 503);
  const email = typeof user.email === "string" && /.+@.+\..+/.test(user.email) ? user.email : null;
  if (!email) return c.json({ error: "email_required" }, 400);
  const store = d1TarotStore(c.env.DB);
  const origin = new URL(c.req.url).origin;
  try {
    const urls = checkoutReturnUrls(origin, typeof body.return === "string" ? body.return : null);
    const customerId = await store.getStripeCustomer(user.id);
    const checkout = await createPackCheckoutSession(c.env, {
      userId: user.id,
      email,
      successUrl: urls.successUrl,
      cancelUrl: urls.cancelUrl,
      priceId,
      pack,
      customerId,
    });
    if (checkout.url) return c.json({ url: checkout.url });
    return c.json({ error: "checkout_failed" }, 502);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "checkout_failed" }, 502);
  }
});

type StripeEvent = {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      customer?: string;
      payment_intent?: string;
      client_reference_id?: string;
      metadata?: Record<string, string>;
    };
  };
};

// Stripe webhook (nicelingo model): claim the event id first (exactly
// once), verify payment server-side, then credit the ledger. Credits
// never come from the browser redirect.
app.post("/api/billing/webhook", async (c) => {
  const raw = await c.req.text();
  const ok = await verifyStripeSignature(raw, c.req.header("stripe-signature"), c.env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return c.json({ error: "invalid signature" }, 401);
  let event: StripeEvent;
  try {
    event = JSON.parse(raw);
    if (!event.id || !event.type || !event.data?.object) throw new Error("bad event");
  } catch {
    return c.json({ error: "invalid event" }, 400);
  }
  if (!c.env?.DB) return c.json({ error: "unavailable" }, 503);
  const store = d1TarotStore(c.env.DB);
  if (!(await store.claimStripeEvent(event.id, event.type, null))) {
    return c.json({ received: true, duplicate: true });
  }
  const object = event.data.object;
  const today = bangkokDay();
  try {
    if (
      (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") &&
      object.metadata?.kind === "token_pack"
    ) {
      const userId = object.metadata?.user_id ?? object.client_reference_id ?? null;
      const session = await retrieveCheckoutSession(c.env, object.id);
      const pack = packForSession(session);
      if (userId && pack && session.payment_status === "paid") {
        // Key by payment intent (fallback session id) so charge-level
        // refund/dispute events can find this credit later.
        await store.postLedger({
          userId,
          delta: pack.tokens,
          reason: "topup",
          ref: session.payment_intent ?? session.id,
          day: today,
        });
        if (typeof session.customer === "string") {
          await store.setStripeCustomer(userId, session.customer);
        }
        await store.markStripeEvent(event.id, "processed", userId);
      } else {
        // QR methods can complete unpaid; the async event credits later.
        await store.markStripeEvent(event.id, "ignored", userId);
      }
    } else if (event.type === "charge.refunded" || event.type === "charge.dispute.closed") {
      // Claw the pack back on a FULL refund (or lost dispute): top-ups
      // key by payment intent, so the charge event resolves directly.
      // Partial refunds are left for manual handling (marked ignored).
      const charge = object as typeof object & {
        status?: string; amount?: number; amount_refunded?: number;
      };
      const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
      const fullLoss =
        event.type === "charge.dispute.closed"
          ? charge.status === "lost"
          : (charge.amount ?? 0) > 0 && (charge.amount_refunded ?? 0) >= (charge.amount ?? 0);
      const topup = pi && fullLoss ? await store.ledgerByRef("topup", pi) : null;
      if (topup) {
        await store.postLedger({
          userId: topup.userId,
          delta: -topup.delta,
          reason: "refund",
          ref: object.id,
          day: today,
        });
        await store.markStripeEvent(event.id, "processed", topup.userId);
      } else {
        await store.markStripeEvent(event.id, "ignored");
      }
    } else {
      await store.markStripeEvent(event.id, "ignored");
    }
  } catch (err) {
    // Leave the event 'claimed' (not processed): Stripe retries hit the
    // duplicate path, and ops can reconcile from the event log.
    console.error(JSON.stringify({ message: "stripe webhook failed", error: err instanceof Error ? err.message : String(err) }));
    return c.json({ error: "webhook_failed" }, 500);
  }
  return c.json({ received: true });
});

// Interface prefs: UI language, Day/Night theme (NULL = auto), nickname.
app.put("/api/me/prefs", async (c) => {
  const user = await authedUser(c);
  if (!user || !c.env?.DB) return c.json({ error: "unauthorized" }, 401);
  let body: { lang?: unknown; theme?: unknown; nickname?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "bad_request" }, 400);
  }
  const prefs: { lang?: string; theme?: string | null; nickname?: string | null } = {};
  if (body.lang === "th" || body.lang === "en") prefs.lang = body.lang;
  if (body.theme === "day" || body.theme === "night") prefs.theme = body.theme;
  if (body.theme === null) prefs.theme = null;
  if (typeof body.nickname === "string") {
    const nickname = body.nickname.trim().slice(0, 40);
    prefs.nickname = nickname || null;
  }
  if (Object.keys(prefs).length === 0) return c.json({ error: "bad_request" }, 400);
  return c.json(await d1PrefsStore(c.env.DB).set(user.id, prefs));
});

// Delete everything: the user row cascades to prefs, draws, readings,
// shares, and referrals. The client clears localStorage on success.
app.delete("/api/me", async (c) => {
  const user = await authedUser(c);
  if (!user || !c.env?.DB) return c.json({ error: "unauthorized" }, 401);
  // Share images first (they can embed the user's question); the
  // user-row delete then cascades the DB side.
  try {
    const shareIds = await d1TarotStore(c.env.DB).userShareIds(user.id);
    for (const shareId of shareIds) await deleteShareImages(c.env, shareId);
  } catch {
    /* best-effort */
  }
  await drizzle(c.env.DB, { schema }).delete(schema.user).where(eq(schema.user.id, user.id));
  return c.json({ ok: true });
});

// Daily card: one per Bangkok day, idempotent. Does not count toward
// the question quota. 401 when there is no session yet \u2014 the client
// creates the anonymous session first, then retries.
// Public static files: R2 (bucket tarotnice-media) first, static assets
// as fallback, 404 when neither has the file. Card art is public (no
// gate); share pages are gated by unguessable share ids, not by this.
app.get("/static/:rest{.+}", async (c) => {
  const rest = c.req.param("rest");
  const media = c.env?.MEDIA;
  if (media) {
    const obj = await media.get(rest);
    if (obj) {
      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      return new Response(await obj.arrayBuffer(), { headers });
    }
  }
  const assets = c.env?.ASSETS;
  if (!assets) return c.text("Not found", 404);
  return assets.fetch(c.req.raw);
});

// With run_worker_first, every request reaches the worker: serve anything
// no route claimed (app shell, fonts, icons) from static assets. Must stay
// last so API/page routes match first.
app.get("*", async (c) => {
  const assets = c.env?.ASSETS;
  if (!assets) return c.text("Not found", 404);
  return assets.fetch(c.req.raw);
});

export default app;
