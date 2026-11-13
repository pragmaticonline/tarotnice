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

// Account drawer behaviour: paints the header token chip + drawer
// profile from /api/me/summary, opens/closes the drawer, swaps to the
// settings sub-view, saves nickname, handles theme/language/sign-out.
const AUTH_LINK = `<script>(function(){
function q(s){return document.querySelector(s)}function qa(s){return document.querySelectorAll(s)}
function paint(d){try{
 if(d.tokens){var total=Math.max(0,d.tokens.freeLeft||0)+Math.max(0,d.tokens.balance||0);var chips=qa("[data-token-chip]");for(var j=0;j<chips.length;j++){chips[j].hidden=false;var n=chips[j].querySelector("[data-token-count]");if(n)n.textContent=String(total)}var c=q("[data-drawer-tokens]");if(c)c.textContent=String(total);var w=q("[data-drawer-wallet-count]");if(w)w.textContent=String(total)}
 if(d.streak){var sc=d.streak.current||0;var st=q("[data-drawer-streak]");if(st)st.textContent=String(sc);var un=q("[data-drawer-day-unit]");if(un)un.textContent=sc===1?un.getAttribute("data-one"):un.getAttribute("data-many")}
 if(typeof d.historyCount==="number"){var hc=q("[data-drawer-history-count]");if(hc){hc.hidden=d.historyCount===0;hc.textContent=String(d.historyCount)}}
 var reg=d.user&&!d.user.isAnonymous;window.__tnRegistered=!!reg;
 var nick=(d.prefs&&d.prefs.nickname)||"";
 var name=nick||(reg?String(d.user.email||"").split("@")[0]:"");
 var nm=q("[data-drawer-name]");if(nm)nm.textContent=reg?name:"TarotNice";
 var em=q("[data-drawer-email]");if(em)em.textContent=reg?(d.user.email||""):"";
 var em2=q("[data-drawer-email2]");if(em2)em2.value=reg?(d.user.email||""):"";
 var nm2=q("[data-drawer-name2]");if(nm2)nm2.textContent=reg?name:"TarotNice";
 var em3=q("[data-drawer-email3]");if(em3)em3.textContent=reg?(d.user.email||""):"";
 var mem=q("[data-drawer-member]");if(mem){if(reg&&d.user.createdAt){try{var dt=new Date(d.user.createdAt);var loc=document.documentElement.lang==="th"?"th-TH":"en-GB";var when=dt.toLocaleDateString(loc,{month:"short",year:"numeric"});mem.textContent=(mem.getAttribute("data-template")||"").replace("{date}",when).replace("{n}",String(d.historyCount||0))}catch(x){mem.textContent=""}}else mem.textContent=""}
 var ver=q("[data-drawer-verified]");if(ver)ver.hidden=!(reg&&d.user.emailVerified);
 var wb=q("[data-drawer-wallet-balance]");if(wb&&d.tokens)wb.textContent=String(Math.max(0,d.tokens.balance||0));
 var fl=q("[data-drawer-free-line]");if(fl&&d.tokens)fl.textContent=(fl.getAttribute("data-template")||"").replace("{free}",String(Math.max(0,d.tokens.freeLeft||0)));
 var provs=(d.user&&d.user.providers)||[];var states=qa("[data-provider-state]");for(var pi=0;pi<states.length;pi++){var pv=states[pi].getAttribute("data-provider-state");var on=provs.indexOf(pv)>=0;states[pi].textContent=on?states[pi].getAttribute("data-on")||"Connected":"";var lb=states[pi].parentNode.querySelector("[data-link-provider]");if(lb)lb.hidden=on}
 var lineRow=q("[data-line-row]");if(lineRow)lineRow.hidden=!(d.authProviders&&d.authProviders.line);
 if(d.prefs){var np=q("[data-notify='notifyPromo']");if(np)np.checked=!!d.prefs.notifyPromo}
 var ni=q("[data-drawer-nick]");if(ni&&nick)ni.value=nick;
 var av=qa("[data-avatar-initial]");for(var i=0;i<av.length;i++)av[i].textContent=(name||"T").charAt(0).toUpperCase();
 var guest=q("[data-drawer-guest]");if(guest)guest.hidden=!!reg;
 var prof=q("[data-drawer-profile]");if(prof)prof.hidden=!reg;
 var so=q("[data-drawer-signout]");if(so)so.hidden=!reg;
 var stBtn=q("[data-drawer-settings-open]");if(stBtn)stBtn.hidden=!reg;
}catch(x){}}
function load(){fetch("/api/me/summary",{credentials:"include"}).then(function(r){return r.json()}).then(paint).catch(function(){})}
function openDrawer(){var d=q("[data-drawer]"),b=q("[data-drawer-backdrop]");if(d){d.hidden=false;requestAnimationFrame(function(){d.classList.add("open")})}if(b)b.hidden=false;showMain();load()}
function closeDrawer(){var d=q("[data-drawer]"),b=q("[data-drawer-backdrop]");if(d){d.classList.remove("open");setTimeout(function(){d.hidden=true},220)}if(b)b.hidden=true}
function showMain(){var m=q("[data-drawer-main]"),s=q("[data-drawer-settings]"),w=q("[data-drawer-wallet]");if(m)m.hidden=false;if(s)s.hidden=true;if(w)w.hidden=true}
function showSettings(){var m=q("[data-drawer-main]"),s=q("[data-drawer-settings]"),w=q("[data-drawer-wallet]");if(m)m.hidden=true;if(s)s.hidden=false;if(w)w.hidden=true}
function showWallet(){var m=q("[data-drawer-main]"),s=q("[data-drawer-settings]"),w=q("[data-drawer-wallet]");if(m)m.hidden=true;if(s)s.hidden=true;if(w)w.hidden=false}
function setTheme(mode){var root=document.documentElement;if(mode==="auto"){try{localStorage.removeItem("tarotnice:mode")}catch(e){}var h=6;try{h=Number(new Intl.DateTimeFormat("en",{hour:"numeric",hour12:false,timeZone:"Asia/Bangkok"}).format(new Date()))}catch(e){}root.setAttribute("data-mode",(h>=18||h<6)?"night":"day");putTheme(null)}else{root.setAttribute("data-mode",mode);try{localStorage.setItem("tarotnice:mode",mode)}catch(e){}putTheme(mode)}markTheme()}
function putTheme(v){fetch("/api/me/prefs",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({theme:v}),credentials:"include"}).catch(function(){})}
function markTheme(){var saved=null;try{saved=localStorage.getItem("tarotnice:mode")}catch(e){}var cur=saved||"auto";var bs=qa("[data-theme-choice]");for(var i=0;i<bs.length;i++)bs[i].setAttribute("aria-pressed",bs[i].getAttribute("data-theme-choice")===cur?"true":"false")}
document.addEventListener("click",function(e){var t=e.target&&e.target.closest?e.target:null;if(!t)return;
 if(t.closest("[data-token-chip]")){location.href=window.__tnRegistered?"/billing":"/sign-in?return=%2Fbilling";return}
 var o=t.closest("[data-drawer-open]");if(o){openDrawer();return}
 if(t.closest("[data-drawer-close]")||t.closest("[data-drawer-backdrop]")){closeDrawer();return}
 if(t.closest("[data-drawer-settings-open]")){showSettings();return}
 if(t.closest("[data-drawer-wallet-open]")){showWallet();return}
 if(t.closest("[data-drawer-back]")){showMain();return}
 var lp=t.closest("[data-link-provider]");if(lp){var prov=lp.getAttribute("data-link-provider");fetch("/api/auth/link-social",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({provider:prov,callbackURL:location.pathname})}).then(function(r){return r.json().catch(function(){return{}})}).then(function(data){if(data&&data.url)location.href=data.url}).catch(function(){});return}
 var th=t.closest("[data-theme-choice]");if(th){setTheme(th.getAttribute("data-theme-choice"));return}
 if(t.closest("[data-drawer-save]")){var ni=q("[data-drawer-nick]");var sv=t.closest("[data-drawer-save]");fetch("/api/me/prefs",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({nickname:ni?ni.value:""}),credentials:"include"}).then(function(){if(sv){sv.textContent=sv.getAttribute("data-saved-label")||sv.textContent;setTimeout(function(){sv.textContent=sv.getAttribute("data-save-label")||sv.textContent},2000)}load()}).catch(function(){});return}
 if(t.closest("[data-drawer-signout]")){fetch("/api/auth/sign-out",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:"{}"}).then(function(){location.href="/"}).catch(function(){location.href="/"});return}
 if(t.closest("[data-drawer-delete]")){var dc=q("[data-delete-confirm]");if(dc)dc.hidden=false;return}
 if(t.closest("[data-delete-cancel]")){var dc2=q("[data-delete-confirm]");if(dc2)dc2.hidden=true;return}
 if(t.closest("[data-drawer-delete-forever]")){fetch("/api/me",{method:"DELETE",credentials:"include"}).then(function(){try{localStorage.clear()}catch(x){}location.href="/"}).catch(function(){});return}
});
document.addEventListener("change",function(e){var n=e.target&&e.target.closest?e.target.closest("[data-notify]"):null;if(!n)return;var body={};body[n.getAttribute("data-notify")]=!!n.checked;fetch("/api/me/prefs",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(body),credentials:"include"}).catch(function(){})});
document.addEventListener("keydown",function(e){if(e.key==="Escape")closeDrawer()});
var langs=qa("[data-drawer-lang]");for(var i=0;i<langs.length;i++){langs[i].setAttribute("href",location.pathname+"?ui="+langs[i].getAttribute("data-drawer-lang"));if(langs[i].getAttribute("data-drawer-lang")===document.documentElement.lang)langs[i].setAttribute("aria-current","true")}
markTheme();load();
})();</script>`;

const DESCRIPTION = "Free tarot readings, every day. Draw your daily card and ask a free question every day.";

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
${drawerHtml(lang)}
${THEME_TOGGLE}
${AUTH_LINK}
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
  const inner = `🌙 <b>${streak.current}</b>`;
  const title = fmt(t(ui).dayStreak, { n: streak.current });
  return href
    ? `<a class="streak-chip" data-streak href="${href}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${inner}</a>`
    : `<span class="streak-chip" data-streak title="${escapeHtml(title)}">${inner}</span>`;
}

/** Auth entry in the header: Sign in (guests) -> Account (registered,
 *  swapped client-side by AUTH_LINK). Reuses the lang-btn pill style. */
export function authLinkHtml(ui: UiLang): string {
  const d = t(ui);
  return `<a class="lang-btn head-auth" data-auth-link data-account-label="${escapeHtml(d.account)}" href="/sign-in">${escapeHtml(d.signIn)}</a>`;
}

/** Signed-in header facts, rendered on the server so the first
 *  paint already shows the right initial and balance (the client
 *  script repaints them from /api/me/summary anyway). */
export type HeaderAccount = { initial: string; tokens: number | null } | null;

/** Token amount at the top of the screen (free + wallet). A known
 *  balance renders visibly on the server; otherwise the count stays
 *  hidden until client hydration fills it. */
export function tokenChipHtml(ui: UiLang, tokens?: number | null): string {
  const d = t(ui);
  if (tokens == null) {
    return `<button type="button" class="lang-btn token-chip" data-token-chip hidden aria-label="${escapeHtml(d.billingTitle)}"><span class="moonstone" aria-hidden="true"></span><b data-token-count>0</b></button>`;
  }
  return `<button type="button" class="lang-btn token-chip" data-token-chip aria-label="${escapeHtml(d.billingTitle)}"><span class="moonstone" aria-hidden="true"></span><b data-token-count>${tokens}</b></button>`;
}

/** Header menu button (design: hamburger + avatar initial in a pill). */
export function drawerButtonHtml(ui: UiLang, initial?: string): string {
  const d = t(ui);
  return `<button class="menu-btn" type="button" data-drawer-open aria-label="${escapeHtml(d.yourAccount)}"><span aria-hidden="true">&#9776;</span><span class="avatar-dot" data-avatar-initial aria-hidden="true">${escapeHtml(initial ?? "T")}</span></button>`;
}

export function headerHtml(opts: {
  ui: UiLang;
  streak: StreakInfo;
  path?: string;
  account?: HeaderAccount;
}): string {
  const account = opts.account ?? null;
  return `<header class="site-head">${brandHtml()}<span class="head-sp"></span>${tokenChipHtml(opts.ui, account?.tokens ?? null)}${drawerButtonHtml(opts.ui, account?.initial)}</header>`;
}

/** Account drawer (design boards A-C): profile, tokens/streak, menu,
 *  preferences, and an account-settings sub-view. Values are painted
 *  client-side from /api/me/summary by the AUTH_LINK script. */
export function drawerHtml(ui: UiLang): string {
  const d = t(ui);
  return `<div class="drawer-backdrop" data-drawer-backdrop hidden></div>
<aside class="drawer" data-drawer hidden aria-label="${escapeHtml(d.yourAccount)}">
<div data-drawer-main>
  <div class="drawer-head">
    <span class="avatar-dot avatar-lg" data-avatar-initial aria-hidden="true">T</span>
    <span class="drawer-id" data-drawer-profile hidden><b data-drawer-name>TarotNice</b><small data-drawer-email></small></span>
    <button class="drawer-x" type="button" data-drawer-close aria-label="Close">&times;</button>
  </div>
  <div data-drawer-guest>
    <p class="drawer-guest-line">${escapeHtml(d.drawerGuest)}</p>
    <p class="drawer-guest-btns"><a class="btn btn-primary" href="/sign-in">${escapeHtml(d.signIn)}</a> <a class="btn btn-outline" href="/register">${escapeHtml(d.drawerCreate)}</a></p>
  </div>
  <p><a class="btn btn-primary drawer-ask" href="/">&#10038; ${escapeHtml(d.drawerAsk)}</a></p>
  <div class="drawer-stats">
    <button type="button" class="drawer-stat" data-drawer-wallet-open><small>${escapeHtml(d.drawerTokens)}</small><b><span class="moonstone" aria-hidden="true"></span><span data-drawer-tokens>0</span></b></button>
    <a class="drawer-stat" href="/progress"><small>${escapeHtml(d.drawerStreak)}</small><b><span data-drawer-streak>0</span> <span data-drawer-day-unit data-one="${escapeHtml(d.drawerDayUnit)}" data-many="${escapeHtml(d.drawerDays)}">${escapeHtml(d.drawerDays)}</span></b></a>
  </div>
  <nav class="drawer-nav">
    <a href="/history">${escapeHtml(d.historyTitle)} <span class="drawer-count" data-drawer-history-count hidden></span></a>
    <a href="/progress">${escapeHtml(d.drawerJourney)}</a>
    <a href="/invite">${escapeHtml(d.refTab)} <span class="drawer-pill">${escapeHtml(d.invitePill)}</span></a>
    <a class="line-friends-link" href="https://line.me/R/add/@tarotnice" target="_blank" rel="noopener"><span class="drawer-line-icon" aria-hidden="true"></span>${escapeHtml(d.lineFriends)}</a>
    <a href="/cards">${escapeHtml(d.cardsTitle)}</a>
    <button type="button" data-drawer-settings-open>${escapeHtml(d.drawerSettings)} <span aria-hidden="true">&rsaquo;</span></button>
    <button type="button" data-drawer-wallet-open>${escapeHtml(d.drawerWallet)} <span class="drawer-sub"><span class="moonstone" aria-hidden="true"></span><span data-drawer-wallet-count>0</span></span></button>
  </nav>
  <h3 class="drawer-h">${escapeHtml(d.accountPrefs)}</h3>
  <p class="drawer-label">${escapeHtml(d.appLanguage)}</p>
  <div class="seg" role="group"><a data-drawer-lang="th" href="/?ui=th">\u0e44\u0e17\u0e22</a><a data-drawer-lang="en" href="/?ui=en">English</a></div>
  <p class="drawer-label">${escapeHtml(d.themeLabel)}</p>
  <div class="seg" role="group"><button type="button" data-theme-choice="auto">${escapeHtml(d.themeAuto)}</button><button type="button" data-theme-choice="day">${escapeHtml(d.themeDay)}</button><button type="button" data-theme-choice="night">${escapeHtml(d.themeNight)}</button></div>
  <nav class="drawer-nav drawer-foot-nav">
    <a href="/contact">${escapeHtml(d.drawerHelp)}</a>
    <button type="button" data-drawer-signout>${escapeHtml(d.signOut)}</button>
  </nav>
  <p class="drawer-legal"><a href="/terms">${escapeHtml(d.terms)}</a> &middot; <a href="/privacy">${escapeHtml(d.privacy)}</a></p>
</div>
<div data-drawer-wallet hidden>
  <p class="drawer-back-row"><button type="button" data-drawer-back>&lsaquo; ${escapeHtml(d.walletCardTitle)}</button></p>
  <section class="balance-card drawer-wallet-card">
    <p class="balance-row"><span>${escapeHtml(d.tokenBalanceLabel)}</span><b data-drawer-wallet-balance>0</b></p>
    <p class="drawer-hint" data-drawer-free-line data-template="${escapeHtml(d.freeTokensLine)}"></p>
  </section>
  <p><a class="btn btn-primary drawer-save" href="/billing">${escapeHtml(d.topUpTokens)}</a></p>
  <p><a class="btn btn-outline drawer-save" href="/billing#activity">${escapeHtml(d.seeAllActivity)}</a></p>
</div>
<div data-drawer-settings hidden>
  <p class="drawer-back-row"><button type="button" data-drawer-back>&lsaquo; ${escapeHtml(d.drawerSettings)}</button></p>
  <div class="drawer-head">
    <span class="avatar-dot avatar-lg" data-avatar-initial aria-hidden="true">T</span>
    <span class="drawer-id"><b data-drawer-name2>TarotNice</b><small data-drawer-email3></small><small data-drawer-member data-template="${escapeHtml(d.memberSince)}"></small></span>
  </div>
  <h3 class="drawer-h">${escapeHtml(d.profileTitle)}</h3>
  <label class="drawer-field">${escapeHtml(d.nicknameLabel)}<input data-drawer-nick maxlength="40"></label>
  <p class="drawer-hint">${escapeHtml(d.drawerNickHint)}</p>
  <p><button class="btn btn-primary drawer-save" type="button" data-drawer-save data-save-label="${escapeHtml(d.saveChanges)}" data-saved-label="${escapeHtml(d.savedBtn)}">${escapeHtml(d.saveChanges)}</button></p>
  <label class="drawer-field">${escapeHtml(d.drawerEmail)}<input data-drawer-email2 readonly></label>
  <p class="drawer-hint" data-drawer-verified hidden><span class="verified-pill">${escapeHtml(d.verified)}</span></p>
  <h3 class="drawer-h">${escapeHtml(d.signInMethods)}</h3>
  <div class="drawer-methods">
    <p class="drawer-method"><span><b>G</b> Google</span><span class="drawer-method-state" data-provider-state="google" data-on="${escapeHtml(d.connected)}"></span><button type="button" class="btn btn-outline" data-link-provider="google" hidden>${escapeHtml(d.connect)}</button></p>
    <p class="drawer-method" data-line-row hidden><span><b>L</b> LINE</span><span class="drawer-method-state" data-provider-state="line" data-on="${escapeHtml(d.connected)}"></span><button type="button" class="btn btn-outline" data-link-provider="line" hidden>${escapeHtml(d.connect)}</button></p>
  </div>
  <h3 class="drawer-h">${escapeHtml(d.notificationsTitle)}</h3>
  <label class="drawer-toggle"><span><b>${escapeHtml(d.notifyPromoLabel)}</b><small>${escapeHtml(d.notifyPromoSub)}</small></span><input type="checkbox" data-notify="notifyPromo"></label>
  <h3 class="drawer-h drawer-danger">${escapeHtml(d.dangerZone)}</h3>
  <p class="drawer-hint">${escapeHtml(d.deleteAccountCopy)}</p>
  <p><button class="btn btn-danger" type="button" data-drawer-delete>${escapeHtml(d.deleteData)}</button></p>
  <div data-delete-confirm hidden>
    <p class="drawer-hint"><b>${escapeHtml(d.deleteForeverQ)}</b></p>
    <p class="drawer-guest-btns"><button class="btn btn-danger" type="button" data-drawer-delete-forever>${escapeHtml(d.deleteForever)}</button> <button class="btn btn-outline" type="button" data-delete-cancel>${escapeHtml(d.cancelBtn)}</button></p>
  </div>
</div>
</aside>`;
}

/** Shared footer (design boards): brand left, legal links right,
 *  centered \u00a9 line. Language and theme live in the drawer. */
/** 404 page (design board: "This page is not in the deck"). */
export function notFoundPage(opts: { ui: UiLang; origin: string }): string {
  const d = t(opts.ui);
  const head = headerHtml({
    ui: opts.ui,
    streak: { current: 0, longest: 0, activeToday: false },
    path: "/404",
  });
  const body = `<main class="notfound">
<p class="nf-code">ERROR 404</p>
<img src="/mascot/ngern-sleeping.svg" alt="Ngern sleeping" width="120" height="120">
<h1 class="display">${escapeHtml(d.notFoundTitle)}</h1>
<p>${escapeHtml(d.notFoundText)}</p>
<p><a class="btn btn-primary" href="/">${escapeHtml(d.askQuestionCta)}</a> <a class="btn btn-outline" href="/cards">${escapeHtml(d.browseCards)}</a></p>
</main>`;
  return pageShell({
    title: `TarotNice — ${d.notFoundTitle}`,
    lang: opts.ui,
    origin: opts.origin,
    noindex: true,
    body: `${head}${body}${siteFooterHtml(opts.ui, "/404")}`,
  });
}

export function siteFooterHtml(uiLang: UiLang = "en", _path = "/"): string {
  const d = t(uiLang);
  return `<footer class="site-foot"><div class="footer-main"><div class="foot-brand"><span class="foot-mark">${LOGO_SVG}</span><b>TarotNice</b></div><nav class="foot-links" aria-label="Footer"><a class="foot-link" href="/cards">${escapeHtml(d.cardsTitle)}</a><a class="foot-link" href="/terms">${escapeHtml(d.terms)}</a><a class="foot-link" href="/privacy">${escapeHtml(d.privacy)}</a><a class="foot-link" href="/contact">${escapeHtml(d.contact)}</a></nav></div><div class="footer-bottom"><p class="foot-legal">\u00a9 2026 TarotNice</p></div></footer>`;
}
