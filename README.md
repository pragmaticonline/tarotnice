# TarotNice

Free tarot readings, every day. A mobile-first PWA (Thai UI by default,
English fully supported): a free daily card, up to 3 questions a day
answered with 3-card draws and AI readings, streaks, and one-tap
sharing to LINE / Facebook / X / Instagram.

Built on Cloudflare Workers + Hono, D1 (Drizzle), Workers AI, R2, and
Analytics Engine. No ads, no payments.

## Develop

```sh
npm install
npm run typecheck
npm test
wrangler dev            # serves http://localhost:8787, /health
```

Cloudflare credentials live in `/root/.env`
(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`):
`set -a && . /root/.env` before wrangler commands.

Quirk: with the `routes` custom domain configured, `wrangler dev`
rewrites `Origin: http://localhost:PORT` to `http://tarotnice.com`,
so cookie-bearing `/api/auth/*` POSTs 403 in dev (Better Auth origin
check). Real browsers hit the same path in production with the real
origin. To exercise auth-with-cookies locally, temporarily comment
out `routes` in `wrangler.toml` and restart dev.

## Deploy

```sh
npm run db:migrate:remote
wrangler deploy         # tarotnice.com
```

Secrets (never commit): `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`,
`LINE_MSG_CHANNEL_SECRET`, `LINE_MSG_ACCESS_TOKEN`, `TURNSTILE_SECRET`,
`MAILNICE_API_KEY`, `EMAIL_FROM`, `CF_ANALYTICS_TOKEN`.

## LINE

Two separate channels. The Login channel (`LINE_CHANNEL_ID` /
`LINE_CHANNEL_SECRET`) powers LINE sign-in on `/sign-in`, `/register`
and Account settings; the login link passes `bot_prompt=normal`, so
the LINE consent screen offers "Add as a friend".

The Official Account `@677zpuat` uses the Messaging channel
(`LINE_MSG_CHANNEL_SECRET` / `LINE_MSG_ACCESS_TOKEN`). Its webhook is
`POST https://tarotnice.com/api/line/webhook` (set in the LINE
console; signature-verified). Adding the OA sends a one-time
`LINE-XXXXXX` code worth 5 tokens, redeemable at `/billing`; friend
links across the site point at `https://line.me/R/add/@677zpuat`.
Push sends stay no-ops until `LINE_MSG_ACCESS_TOKEN` is set.

## Layout

- `src/index.ts` — Hono app, routes, API
- `src/routes/` — server-rendered pages (shell, home, legal, auth-pages)
- `src/lib/` — auth, i18n (th/en), geo, streaks, analytics, email, LINE
- `src/db/` — Drizzle schema + stores
- `content/` — card list + meanings (seeded into D1)
- `scripts/` — seed-cards, check-cards, eval-models
- `public/` — app CSS/JS, fonts, mascot, manifest, service worker
- `designs/prototype.html` — design source of truth (reference only)

Full spec: see the build package (`SPEC.md`).
