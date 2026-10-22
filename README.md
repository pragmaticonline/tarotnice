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
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TURNSTILE_SECRET`,
`MAILNICE_API_KEY`, `EMAIL_FROM`, `CF_ANALYTICS_TOKEN`.

## Layout

- `src/index.ts` — Hono app, routes, API
- `src/routes/` — server-rendered pages (shell, home, legal, auth-pages)
- `src/lib/` — auth, i18n (th/en), geo, streaks, analytics, email
- `src/db/` — Drizzle schema + stores
- `content/` — card list + meanings (seeded into D1)
- `scripts/` — seed-cards, check-cards, eval-models
- `public/` — app CSS/JS, fonts, mascot, manifest, service worker
- `designs/prototype.html` — design source of truth (reference only)

Full spec: see the build package (`SPEC.md`).
