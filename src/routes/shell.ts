// Shared page shell: head, brand header, footer. Day/Night themes
// come from CSS custom properties on :root (see public/app/site.css);
// an inline head script sets data-mode before paint to avoid a flash.
import { analyticsBeacon } from "../lib/analytics";
import { escapeHtml } from "../lib/html";
import { UI_LANGS, fmt, t, type UiLang } from "../lib/i18n";
import type { StreakInfo } from "../lib/streaks";

// Ngern's head mark, inlined from public/mascot/ngern-head-mark.svg
// (exact bytes, plus display size and a test hook). It is also the
// favicon, app icon, and OG-image mark.
export const LOGO_SVG = `<svg data-logo="ngern" width="40" height="40" viewBox="26 0 68 70" role="img" aria-label="TarotNice"><defs><linearGradient id="ngFurM" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9d2df"/><stop offset="1" stop-color="#93a1b8"/></linearGradient><radialGradient id="ngEyeM" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#d9e98a"/><stop offset="1" stop-color="#5f9a45"/></radialGradient></defs><path d="M37 30C31 18 31 9 34 3C43 7 51 14 54 22Z" fill="url(#ngFurM)"/><path d="M83 30C89 18 89 9 86 3C77 7 69 14 66 22Z" fill="url(#ngFurM)"/><path d="M39 26C36 18 36 12 37 9C42 12 47 16 49 21Z" fill="#e3b3bb" opacity=".75"/><path d="M81 26C84 18 84 12 83 9C78 12 73 16 71 21Z" fill="#e3b3bb" opacity=".75"/><path d="M60 68C45 68 29 58 29 41C29 30 34 23 41 21C49 18 55 21 60 25C65 21 71 18 79 21C86 23 91 30 91 41C91 58 75 68 60 68Z" fill="url(#ngFurM)"/><path d="M60 25C57 30 57 36 60 40C63 36 63 30 60 25Z" fill="#c9d2df" opacity=".5"/><g><path d="M40 43C40 37 44 34 48 34C53 34 56 38 56 43C56 48 52 50 48 50C44 50 40 48 40 43Z" fill="url(#ngEyeM)"/><path d="M64 43C64 38 67 34 72 34C76 34 80 37 80 43C80 48 76 50 72 50C68 50 64 48 64 43Z" fill="url(#ngEyeM)"/><path d="M48 36.5C46.6 39 46.6 47 48 49.5C49.4 47 49.4 39 48 36.5ZM72 36.5C70.6 39 70.6 47 72 49.5C73.4 47 73.4 39 72 36.5Z" fill="#1c2419"/><circle cx="50.5" cy="39.5" r="1.7" fill="#fff"/><circle cx="74.5" cy="39.5" r="1.7" fill="#fff"/><path d="M40 42C41 36 45 34 48 34C52 34 55 36 56 40M64 40C65 36 68 34 72 34C75 34 79 36 80 42" fill="none" stroke="#3b4256" stroke-width="1.3" stroke-linecap="round"/></g><path d="M57.5 55.5h5C62.5 57 61 58.5 60 58.5S57.5 57 57.5 55.5Z" fill="#5c647c"/><path d="M60 58.5v1.5M60 60c-1 1.8-3 2.3-4.5 1.6M60 60c1 1.8 3 2.3 4.5 1.6" fill="none" stroke="#5c647c" stroke-width="1.1" stroke-linecap="round"/><g stroke="#c9d2df" stroke-width=".8" stroke-linecap="round" opacity=".9"><path d="M50 57L34 54M50 59L35 60M76 54L86 57M70 57L86 54M70 59L85 60"/></g></svg>`;

// First visit follows the Bangkok clock (Night 18:00-06:00, Day
// otherwise); a saved choice in localStorage always wins. Runs in
// <head> before first paint so the theme never flashes.
const THEME_INIT = `<script>(function(){try{var m=null;try{m=localStorage.getItem("tarotnice:mode")}catch(e){}if(m!=="day"&&m!=="night"){try{var h=Number(new Intl.DateTimeFormat("en",{hour:"numeric",hour12:false,timeZone:"Asia/Bangkok"}).format(new Date()));m=(h>=18||h<6)?"night":"day"}catch(e){m="day"}}document.documentElement.setAttribute("data-mode",m)}catch(e){}})();</script>`;

// Toggles data-mode + localStorage; signed-in visitors also persist it
// to user_prefs via PUT /api/me/prefs (best-effort, M3).
const THEME_TOGGLE = `<script>(function(){function paint(){try{var night=document.documentElement.getAttribute("data-mode")==="night";var btns=document.querySelectorAll("[data-theme-toggle]");for(var i=0;i<btns.length;i++){var b=btns[i];var d=b.querySelector("[data-theme-label]");if(d)d.textContent=night?"\u263e":"\u2600"}}catch(x){}}paint();document.addEventListener("click",function(e){var b=e.target&&e.target.closest?e.target.closest("[data-theme-toggle]"):null;if(!b)return;try{var cur=document.documentElement.getAttribute("data-mode")==="night"?"night":"day";var next=cur==="night"?"day":"night";document.documentElement.setAttribute("data-mode",next);try{localStorage.setItem("tarotnice:mode",next)}catch(x){}paint();fetch("/api/me/prefs",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({theme:next}),credentials:"include"}).catch(function(){})}catch(x){}});})();</script>`;

const DESCRIPTION = "Free tarot readings, every day. Draw your daily card and ask up to 3 questions.";

export function pageShell(opts: {
  title: string;
  origin: string;
  body: string;
  lang?: UiLang;
  /** Canonical path ("/", "/cards", ...): emits canonical + hreflang. */
  canonicalPath?: string;
  /** Private pages (sign-in, account, history): keep out of indexes. */
  noindex?: boolean;
  /** Per-page meta description; defaults to the generic tagline. */
  description?: string;
  /** Inline JSON-LD block (already stringified and escaped). */
  jsonLd?: string;
  /** Override the default /og.png preview (share landings). */
  ogImage?: string;
  /** og:locale override (share landings: th_TH / en_US). */
  ogLocale?: string;
  /** Extra <head> tags (page scripts, OG images). */
  extraHead?: string;
}): string {
  const lang = opts.lang ?? "en";
  const desc = opts.description ?? DESCRIPTION;
  const canon = opts.canonicalPath ? escapeHtml(opts.canonicalPath) : null;
  const canonical = canon
    ? `<link rel="canonical" href="${escapeHtml(opts.origin)}${canon}">`
    : "";
  const hreflang = canon
    ? `<link rel="alternate" hreflang="x-default" href="${escapeHtml(opts.origin)}${canon}">` +
      UI_LANGS.map(
        (l) =>
          `<link rel="alternate" hreflang="${l.code}" href="${escapeHtml(opts.origin)}${canon}?ui=${l.code}">`,
      ).join("")
    : "";
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${THEME_INIT}
<title>${escapeHtml(opts.title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
${opts.noindex ? `<meta name="robots" content="noindex">` : `${canonical}${hreflang}`}
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f6f1fa">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#15122b">
<meta property="og:title" content="${escapeHtml(opts.title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:image" content="${escapeHtml(opts.ogImage ?? `${opts.origin}/og.png`)}">
${opts.ogLocale ? `<meta property="og:locale" content="${escapeHtml(opts.ogLocale)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(opts.title)}">
<meta name="twitter:description" content="${escapeHtml(desc)}">
<meta name="twitter:image" content="${escapeHtml(opts.ogImage ?? `${opts.origin}/og.png`)}">
${opts.jsonLd ? `<script type="application/ld+json">${opts.jsonLd}</script>` : ""}
<link rel="icon" href="/mascot/ngern-head-mark.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/mascot/ngern-head-mark.png">
<link rel="manifest" href="/manifest.json">
<link rel="preload" href="/fonts/cormorant-garamond-latin-600.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/ibm-plex-sans-thai-thai-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/ibm-plex-sans-thai-latin-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/app/site.css">
${opts.extraHead ?? ""}
</head>
<body>
<div class="wrap">
${opts.body}
</div>
${THEME_TOGGLE}
${analyticsBeacon()}
<script src="/app/share.js" defer></script>
<script>(function(){try{if("serviceWorker" in navigator){addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){});});}}catch(e){}})();</script>
</body>
</html>`;
}

/** Wordmark with the Ngern head mark, linking home. */
export function brandHtml(): string {
  return `<a class="brand" href="/" aria-label="TarotNice home">${LOGO_SVG}<b>TarotNice</b></a>`;
}

/** Streak chip (moon + days, links /progress). Hidden until the
 *  streak is at least 1; the inline client script repaints it from
 *  merged local + server days. */
export function streakChipHtml(streak: StreakInfo, ui: UiLang, href?: string): string {
  if (streak.current < 1) return `<span class="streak-chip" data-streak hidden></span>`;
  const inner = `\U0001f319 <b>${streak.current}</b>`;
  const title = fmt(t(ui).dayStreak, { n: streak.current });
  return href
    ? `<a class="streak-chip" data-streak href="${href}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${inner}</a>`
    : `<span class="streak-chip" data-streak title="${escapeHtml(title)}">${inner}</span>`;
}

/** Day / Night toggle button (client script above does the work). */
export function themeToggleHtml(ui: UiLang): string {
  const d = t(ui);
  return `<button class="theme-toggle" type="button" data-theme-toggle data-day="${escapeHtml(d.themeDay)}" data-night="${escapeHtml(d.themeNight)}" aria-label="${escapeHtml(d.themeDay)} / ${escapeHtml(d.themeNight)}"><span data-theme-label></span></button>`;
}

/** \u0e44\u0e17\u0e22 / EN switcher: plain ?ui= links, works without JavaScript. */
export function langToggleHtml(ui: UiLang, path: string): string {
  const sep = path.includes("?") ? "&" : "?";
  const items = UI_LANGS.map(
    (l) =>
      `<a class="lang-opt" lang="${l.code}" href="${escapeHtml(path)}${sep}ui=${l.code}"${l.code === ui ? ` aria-current="true"` : ""}>${l.code === "th" ? "\u0e44\u0e17\u0e22" : "EN"}</a>`,
  ).join("");
  return `<nav class="lang-toggle" aria-label="${escapeHtml(t(ui).interfaceLanguage)}">${items}</nav>`;
}

/** Site header: wordmark, streak chip, Day/Night + \u0e44\u0e17\u0e22/EN toggles.
 *  On narrow screens the toggles wrap under the wordmark. */
/** Compact single language button for the header (full choice in footer). */
export function langButtonHtml(ui: UiLang, path: string): string {
  const other = UI_LANGS.find((l) => l.code !== ui) || UI_LANGS[0];
  const sep = path.includes("?") ? "&" : "?";
  return `<a class="lang-btn" lang="${other.code}" href="${escapeHtml(path)}${sep}ui=${other.code}" aria-label="${escapeHtml(t(ui).interfaceLanguage)}">${other.code.toUpperCase()}</a>`;
}

export function headerHtml(opts: {
  ui: UiLang;
  streak: StreakInfo;
  path?: string;
}): string {
  const path = opts.path ?? "/";
  return `<header class="site-head">${brandHtml()}<span class="head-sp"></span>${streakChipHtml(opts.streak, opts.ui, "/progress")}${themeToggleHtml(opts.ui)}${langButtonHtml(opts.ui, path)}</header>`;
}

/** Shared footer: tagline, entertainment line, legal links, one
 *  app-language control. */
export function siteFooterHtml(uiLang: UiLang = "en", path = "/"): string {
  const d = t(uiLang);
  const sep = path.includes("?") ? "&" : "?";
  const items = UI_LANGS.map(
    (l) =>
      `<a class="foot-opt" lang="${l.code}" href="${escapeHtml(path)}${sep}ui=${l.code}"${l.code === uiLang ? ` aria-current="true"` : ""}>${escapeHtml(l.ownName)}</a>`,
  ).join("");
  return `<footer class="site-foot"><div class="footer-main"><div class="foot-brand"><span class="foot-mark">${LOGO_SVG}</span><b>TarotNice</b><p class="foot-tag">${escapeHtml(d.tagline)}</p></div><nav class="foot-links" aria-label="Footer"><a class="foot-link" href="/cards">${escapeHtml(d.cardsTitle)}</a><a class="foot-link" href="/terms">${escapeHtml(d.terms)}</a><a class="foot-link" href="/privacy">${escapeHtml(d.privacy)}</a><a class="foot-link" href="/contact">${escapeHtml(d.contact)}</a></nav><div class="foot-lang"><p class="foot-label">${escapeHtml(d.appLanguage)}</p><div class="foot-opts">${items}</div></div></div><div class="footer-bottom"><p class="foot-legal">\u00a9 2026 TarotNice</p></div></footer>`;
}
