import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { createAuth, isRegisteredUser, type AuthEnv } from "./lib/auth";
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
