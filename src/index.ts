import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createAuth, isRegisteredUser, type AuthEnv } from "./lib/auth";
import * as schema from "./db/schema";
import { bangkokDay, nextBangkokMidnight } from "./lib/bangkok";
import { dailyMessage, drawDailyCard, luckyColour } from "./lib/daily";
import { computeStreak } from "./lib/streaks";
import { d1PrefsStore } from "./db/prefs-store";
import { d1TarotStore } from "./db/tarot-store";
import {
  clientCategory,
  countryOf,
  isClientEvent,
  recordEvent,
  type AnalyticsEnv,
} from "./lib/analytics";
import { contactPage, privacyPage, termsPage } from "./routes/legal";
import { homePage } from "./routes/home";
import {
  accountPage,
  forgotPasswordPage,
  registerPage,
  resetPasswordPage,
  signInPage,
} from "./routes/auth-pages";
import { countryOfRequest } from "./lib/geo";
import { isUiLang, uiLangFor, type UiLang } from "./lib/i18n";

type Env = AuthEnv &
  AnalyticsEnv & {
    AI: Ai;
    ASSETS?: Fetcher;
    MEDIA?: R2Bucket;
    DAILY_QUESTION_LIMIT?: string;
    REFERRAL_BONUS?: string;
    READING_MODEL?: string;
    DEFAULT_LANG?: string;
    TIMEZONE?: string;
    TURNSTILE_SECRET?: string;
  };

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
  const origin = new URL(c.req.url).origin;
  return c.html(homePage({ origin, uiLang: requestUiLang(c) }));
});

app.get("/robots.txt", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.text(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`, 200, {
    "Content-Type": "text/plain",
  });
});

app.get("/sitemap.xml", (c) => {
  const origin = new URL(c.req.url).origin;
  const urls = ["/", "/cards"];
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
  if (!isRegisteredUser(user)) {
    return c.redirect(`/sign-in?return=${encodeURIComponent("/account")}`, 302);
  }
  return c.html(accountPage(new URL(c.req.url).origin, user?.email ?? "", requestUiLang(c)));
});

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
  const n = Number(env?.DAILY_QUESTION_LIMIT ?? "3");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3;
}

function authedUser(c: { env: AuthEnv; req: { raw: { headers: Headers } } }) {
  return currentUser(c);
}

// Everything the client needs on load: user, prefs, streak, quota,
// and today's daily card. Server wins over localStorage.
app.get("/api/me/summary", async (c) => {
  const ui = requestUiLang(c);
  const user = await authedUser(c);
  if (!user || !c.env?.DB) {
    return c.json({
      user: null,
      prefs: { lang: ui, theme: null, nickname: null },
      streak: { current: 0, longest: 0, activeToday: false },
      quota: { used: 0, limit: questionLimit(c.env), resetsAt: nextBangkokMidnight() },
      today: { daily: null },
    });
  }
  const store = d1TarotStore(c.env.DB);
  const today = bangkokDay();
  const [prefs, used, days, daily] = await Promise.all([
    d1PrefsStore(c.env.DB).get(user.id),
    store.countReadings(user.id, today),
    store.activityDays(user.id),
    store.getDaily(user.id, today),
  ]);
  let dailyView = null;
  if (daily) {
    const card = await store.getCard(daily.cardId, daily.lang === "th" ? "th" : "en");
    if (card) {
      dailyView = {
        card: {
          id: card.id,
          slug: card.slug,
          name: card.name,
          image: `/static/${card.imageKey}.webp`,
          image2x: `/static/${card.imageKey}@2x.webp`,
          reversed: daily.reversed,
        },
        message: daily.message,
        luckyColour: luckyColour(),
        shareId: daily.shareId,
        lang: daily.lang,
      };
    }
  }
  return c.json({
    user: { id: user.id, email: user.email, isAnonymous: user.isAnonymous },
    prefs: prefs ?? { lang: ui, theme: null, nickname: null },
    streak: computeStreak(days, today),
    quota: { used, limit: questionLimit(c.env), resetsAt: nextBangkokMidnight() },
    today: { daily: dailyView },
  });
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
  await drizzle(c.env.DB, { schema }).delete(schema.user).where(eq(schema.user.id, user.id));
  return c.json({ ok: true });
});

// Daily card: one per Bangkok day, idempotent. Does not count toward
// the question quota. 401 when there is no session yet — the client
// creates the anonymous session first, then retries.
app.post("/api/daily", async (c) => {
  const user = await authedUser(c);
  if (!user || !c.env?.DB) return c.json({ error: "unauthorized" }, 401);
  let body: { lang?: unknown };
  try {
    body = await c.req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const lang = body.lang === "en" || body.lang === "th" ? body.lang : requestUiLang(c);
  const store = d1TarotStore(c.env.DB);
  const today = bangkokDay();
  const respond = async (draw: { cardId: number; reversed: boolean; message: string; lang: string; shareId: string | null }, fresh: boolean) => {
    const card = await store.getCard(draw.cardId, lang);
    if (!card) return c.json({ error: "unknown_card" }, 500);
    const days = await store.activityDays(user.id);
    recordEvent(c.env, {
      name: "daily_drawn",
      lang,
      country: countryOf(c.req.raw),
      ...clientCategory(c.req.raw),
      userKind: userKind(user),
    });
    return c.json({
      card: {
        id: card.id,
        slug: card.slug,
        name: card.name,
        image: `/static/${card.imageKey}.webp`,
        image2x: `/static/${card.imageKey}@2x.webp`,
        reversed: draw.reversed,
      },
      message: draw.message,
      luckyColour: luckyColour(),
      streak: computeStreak(days, today),
      lang,
      fresh,
    });
  };
  const existing = await store.getDaily(user.id, today);
  if (existing) return respond(existing, false);
  const { id, reversed } = drawDailyCard();
  const card = await store.getCard(id, lang);
  if (!card) return c.json({ error: "unknown_card" }, 500);
  const cached = await store.getCachedMessage(today, id, reversed, lang);
  const message =
    cached ?? (await dailyMessage(c.env, card, reversed, lang)).text;
  if (!cached) {
    try {
      await store.setCachedMessage(today, id, reversed, lang, message);
    } catch {
      /* cache is best-effort */
    }
  }
  const draw = await store.insertDaily(user.id, today, { cardId: id, reversed, message, lang });
  return respond(draw, true);
});

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
