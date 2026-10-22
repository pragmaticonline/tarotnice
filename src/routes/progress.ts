// Progress: streak card + freeze note, 14-day grid, personal best,
// deck collection (78 cells), referral panel, milestone list with
// per-milestone Share buttons (Ngern praised in the sheet title).
import { escapeHtml } from "../lib/html";
import { fmt, t, type UiLang } from "../lib/i18n";
import { brandHtml, headerHtml, pageShell, siteFooterHtml } from "./shell";
import type { StreakInfo } from "../lib/streaks";

export type Milestone = { key: string; label: string; achieved: boolean };

export function progressPage(opts: {
  ui: UiLang;
  origin: string;
  streak: StreakInfo;
  days: { date: string; active: boolean }[];
  owned: number[];
  cardNames: Record<number, string>;
  referrals: { invited: number; converted: number };
  bonusOn: boolean;
  milestones: Milestone[];
  readings: number;
  /** Last 7 daily-card thumbnails (SPEC §5.4), newest first. */
  recentDaily?: { name: string; image: string; day: string }[];
}): string {
  const d = t(opts.ui);
  const head = headerHtml({ ui: opts.ui, streak: opts.streak, path: "/progress" });
  const cells = opts.days
    .map(
      (day) =>
        `<span class="cal-cell${day.active ? " on" : ""}" title="${escapeHtml(day.date)}" aria-label="${escapeHtml(day.date)}${day.active ? " ✓" : ""}"></span>`,
    )
    .join("");
  const owned = new Set(opts.owned);
  const deck = Array.from({ length: 78 }, (_, id) => {
    const name = opts.cardNames[id] ?? `#${id}`;
    return owned.has(id)
      ? `<span class="deck-cell on" title="${escapeHtml(name)}">${escapeHtml(name.split(" ").slice(-1)[0] ?? name)}</span>`
      : `<span class="deck-cell" title="${escapeHtml(name)}" aria-label="${escapeHtml(name)}">·</span>`;
  }).join("");
  const ms = opts.milestones
    .map(
      (m) =>
        `<li class="ms${m.achieved ? " on" : ""}"><span class="ms-mark" aria-hidden="true">${m.achieved ? "✓" : "○"}</span> ${escapeHtml(m.label)}` +
        (m.achieved ? ` <button type="button" class="ms-share" data-share-badge="${escapeHtml(m.key)}">${escapeHtml(d.shareBadge)}</button>` : "") +
        `</li>`,
    )
    .join("");
  return pageShell({
    title: `${d.progressTitle} · TarotNice`,
    lang: opts.ui,
    origin: opts.origin,
    noindex: true,
    body:
      `${head}<main><h1 class="display">${escapeHtml(d.progressTitle)}</h1>` +
      `<section class="panel-card"><h2>${escapeHtml(d.streakTitle)}</h2>` +
      `<p class="streak-big">🌙 <b>${opts.streak.current}</b></p>` +
      `<p class="muted">${escapeHtml(d.freezeNote)}</p>` +
      `<div class="cal" role="img" aria-label="${escapeHtml(d.calendarTitle)}">${cells}</div>` +
      `<p class="muted">${escapeHtml(d.bestTitle)}: <b>${opts.streak.longest}</b> · ${escapeHtml(d.historyTitle)}: <b>${opts.readings}</b></p></section>` +
      (opts.recentDaily && opts.recentDaily.length
        ? `<section class="panel-card"><h2>${escapeHtml(d.recentDailyTitle)}</h2><div class="recent-strip">` +
          opts.recentDaily
            .map(
              (r) =>
                `<figure class="recent-card"><img src="${escapeHtml(r.image)}" alt="${escapeHtml(r.name)}" loading="lazy"><figcaption>${escapeHtml(r.name)}</figcaption></figure>`,
            )
            .join("") +
          `</div></section>`
        : "") +
      `<section class="panel-card"><h2>${escapeHtml(d.collectionTitle)}</h2>` +
      `<p class="muted">${owned.size} / 78</p><div class="deck" role="list">${deck}</div></section>` +
      `<section class="panel-card"><h2>${escapeHtml(d.referralTitle)}</h2>` +
      `<p>${escapeHtml(fmt(d.referralLine, { invited: opts.referrals.invited, converted: opts.referrals.converted }))}</p>` +
      `<p class="muted">${escapeHtml(opts.bonusOn ? d.referralBonusOn : d.referralBonusOff)}</p></section>` +
      `<section class="panel-card"><h2>${escapeHtml(d.milestonesTitle)}</h2><ul class="ms-list">${ms}</ul></section>` +
      `</main>${siteFooterHtml(opts.ui, "/progress")}` +
      `<script src="/app/share.js" defer></script><script src="/app/progress.js" defer></script>`,
  });
}
