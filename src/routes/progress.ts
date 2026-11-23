// Progress: streak card + freeze note, 14-day grid, personal best,
// deck collection (78 cells), referral panel, milestone list with
// per-milestone Share buttons (Ngern praised in the sheet title).
import { escapeHtml } from "../lib/html";
import { fmt, t, type UiLang } from "../lib/i18n";
import { brandHtml, headerHtml, pageShell, siteFooterHtml, type HeaderAccount } from "./shell";
import type { StreakInfo } from "../lib/streaks";
import type { CheckinWeekDay } from "../lib/checkin";

export type Milestone = { key: string; label: string; achieved: boolean; left?: string };

export type JourneyEntry = {
  date: string; timeLabel: string; topicLabel: string;
  question: string; cardsLabel: string; id: string;
};

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
  /** Daily check-in week (Mon-Sun, Monday-first labels included). */
  checkin?: { claimedToday: boolean; total: number; week: CheckinWeekDay[] };
  /** Last 7 daily-card thumbnails (SPEC §5.4), newest first. */
  recentDaily?: { name: string; image: string; day: string }[];
  /** Readings in the calendar window, for the selected-day list. */
  entries?: JourneyEntry[];
  monthLabel?: string;
  /** Adjacent months (YYYY-MM) for the calendar arrows. */
  monthPrev?: string;
  monthNext?: string;
  /** Server-rendered header initial + token balance (no first-paint flash). */
  account?: HeaderAccount;
}): string {
  const d = t(opts.ui);
  const head = headerHtml({ ui: opts.ui, streak: opts.streak, path: "/progress", account: opts.account });
  // Design: Last 5 weeks as a Mon-Sun grid (pad the first week with
  // blanks so columns line up with weekdays).
  const firstDow = opts.days.length ? new Date(opts.days[0].date + "T00:00:00Z").getUTCDay() : 1; // 0=Sun
  const leadBlanks = (firstDow + 6) % 7; // Monday-first offset
  const trailBlanks = (7 - ((leadBlanks + opts.days.length) % 7)) % 7;
  const blank = `<span class="cal-cell blank" aria-hidden="true"></span>`;
  const cells =
    Array.from({ length: leadBlanks }, () => blank).join("") +
    opts.days
      .map(
        (day) =>
          `<button type="button" class="cal-cell${day.active ? " on" : ""}" data-cal-day="${escapeHtml(day.date)}" title="${escapeHtml(day.date)}" aria-label="${escapeHtml(day.date)}${day.active ? " ✓" : ""}">${Number(day.date.slice(8, 10))}</button>`,
      )
      .join("") +
    Array.from({ length: trailBlanks }, () => blank).join("");
  const calNav =
    opts.monthPrev && opts.monthNext
      ? `<div class="cal-nav"><a class="btn btn-outline" href="/progress?month=${escapeHtml(opts.monthPrev)}" aria-label="${escapeHtml(d.prevMonth)}">&lsaquo;</a><a class="btn btn-outline" href="/progress?month=${escapeHtml(opts.monthNext)}" aria-label="${escapeHtml(d.nextMonth)}">&rsaquo;</a></div>`
      : "";
  const entries = (opts.entries ?? [])
    .map(
      (e) =>
        `<li class="journey-entry" data-entry-day="${escapeHtml(e.date)}" hidden><span class="hist-meta"><span class="topic-pill">${escapeHtml(e.topicLabel)}</span><span class="hist-date">${escapeHtml(e.timeLabel)}</span></span> <a href="/history/${escapeHtml(e.id)}">&ldquo;${escapeHtml(e.question)}&rdquo;</a> <span class="hist-cards">${escapeHtml(e.cardsLabel)}</span> <a href="/history/${escapeHtml(e.id)}" aria-label="Open">&rsaquo;</a></li>`,
    )
    .join("");
  const ownedPct = Math.round((new Set(opts.owned).size / 78) * 100);
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
        (!m.achieved && m.left ? ` <span class="muted">${escapeHtml(m.left)}</span>` : "") +
        `</li>`,
    )
    .join("");
const CI_GEM = `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3h11l4.5 6-10 12L2 9z" fill="#8b6fe0"/><path d="M2 9h20l-10 12z" fill="#6a4fc9"/><path d="M8.5 9L12 3l3.5 6z" fill="#b9a5f5"/><path d="M12 21L8.5 9h7z" fill="#7b5cd6"/></svg>`;

function checkinCard(ui: UiLang, d: ReturnType<typeof t>, checkin: { claimedToday: boolean; total: number; week: CheckinWeekDay[] }): string {
  const sep = ui === "th" ? " " : ", ";
  const stamp = (w: CheckinWeekDay): string => {
    const state = w.status === "claimed" ? "got" : w.status === "missed" ? "miss" : w.status === "upcoming" ? "next" : w.status;
    let icon = "+1", amt = "+1", aria = w.label;
    if (state === "got") { icon = "\u2713"; aria = `${w.label} ${d.checkinClaimedWord}`; }
    else if (state === "miss") { icon = "\u2715"; amt = "\u2013"; aria = `${w.label} ${d.checkinMissedWord}`; }
    else if (state === "today") { icon = "\ud83d\udcae"; aria = `${d.checkinToday}${sep}${d.checkinTodayOpen}`; }
    else if (state === "gotToday") { icon = "\u2713"; aria = `${d.checkinToday}${sep}${d.checkinClaimedWord}`; }
    const label = state === "today" || state === "gotToday" ? d.checkinToday : w.label;
    const doneAria = state === "today" ? ` data-aria-done="${escapeHtml(`${d.checkinToday}${ui === "th" ? " " : ", "}${d.checkinClaimedWord}`)}"` : "";
    return `<div class="ci-stamp" role="listitem" data-ci-stamp="${escapeHtml(w.label)}" data-state="${state}" aria-label="${escapeHtml(aria)}"${doneAria}><span class="ci-day">${escapeHtml(label)}</span><span class="ci-mark" data-ci-icon aria-hidden="true">${icon}</span><span class="ci-amt" data-ci-amt>${amt}</span></div>`;
  };
  return `<section class="ci-card" id="ci-card" data-claimed="${checkin.claimedToday ? "true" : "false"}" aria-labelledby="ci-h">` +
    `<div><h2 class="ci-title" id="ci-h">${escapeHtml(d.checkinTitle)}</h2>` +
    `<span class="ci-sub">${escapeHtml(d.checkinSub)}<b id="ci-total">${checkin.total}</b> ${escapeHtml(checkin.total === 1 ? d.drawerDayUnit : d.drawerDays)}</span></div>` +
    `<div class="ci-grid" role="list">${checkin.week.map(stamp).join("")}</div>` +
    (checkin.claimedToday
      ? `<div class="ci-done" id="ci-done">${escapeHtml(d.checkinDone)}</div>`
      : `<button class="ci-gold" id="ci-claim" type="button" data-checkin-claim>${CI_GEM}<span>${escapeHtml(d.checkinClaim)}</span></button><div class="ci-done" id="ci-done" hidden>${escapeHtml(d.checkinDone)}</div>`) +
    `<p class="ci-rule">${escapeHtml(d.checkinRule)}</p></section>`;
}

  return pageShell({
    title: `${d.progressTitle} · TarotNice`,
    lang: opts.ui,
    origin: opts.origin,
    noindex: true,
    body:
      `${head}<main><div class="ci-toast" id="ci-toast" data-template="${escapeHtml(d.checkinToast)}" hidden></div><h1 class="display">${escapeHtml(d.drawerJourney)}</h1>` +
      checkinCard(opts.ui, d, opts.checkin ?? { claimedToday: false, total: 0, week: [] }) +
      `<section class="journey-hero"><img class="journey-cat" src="/mascot/ngern-sitting.svg" alt="" width="72" height="72">` +
      `<div class="journey-hero-main"><small>${escapeHtml(d.streakTitle)}</small>` +
      `<p class="journey-big"><b>${opts.streak.current}</b> ${escapeHtml(opts.streak.current === 1 ? d.drawerDayUnit : d.drawerDays)}</p>` +
      `<p class="journey-note">${escapeHtml(d.freezeNote)}</p></div>` +
      `<div class="journey-stats"><span><small>${escapeHtml(d.bestTitle)}</small><b>${opts.streak.longest}</b></span>` +
      `<span><small>${escapeHtml(d.historyTitle)}</small><b>${opts.readings}</b></span></div></section>` +
      `<section class="panel-card"><h2>${escapeHtml(opts.monthLabel ?? d.lastWeeksTitle)}</h2>${calNav}` +
      `<div class="cal-head" aria-hidden="true"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>` +
      `<div class="cal cal-5wk" aria-label="${escapeHtml(d.calendarTitle)}">${cells}</div>` +
      `<p class="cal-legend"><span class="cal-cell on mini" aria-hidden="true"></span> ${escapeHtml(d.drewCardsLegend)} <span class="cal-cell mini" aria-hidden="true"></span> ${escapeHtml(d.noReadingLegend)}</p>` +
      `<h3 data-journey-day-title></h3><ul class="journey-entries">${entries}</ul><p class="muted" data-journey-empty hidden>${escapeHtml(d.emptyHistory)}</p>` +
      `<p><a href="/history">${escapeHtml(d.allReadingsList)}</a></p></section>` +
      (opts.recentDaily && opts.recentDaily.length
        ? `<section class="panel-card"><h2>${escapeHtml(d.recentDailyTitle)}</h2><div class="recent-strip">` +
          opts.recentDaily
            .map(
              (r) =>
                `<figure class="recent-card"><img src="${escapeHtml(r.image)}" alt="${escapeHtml(r.name)}" loading="lazy"><figcaption>${escapeHtml(r.name)}<small>${escapeHtml(r.day)}</small></figcaption></figure>`,
            )
            .join("") +
          `</div></section>`
        : "") +
      `<section class="panel-card"><div class="collection-head"><h2>${escapeHtml(d.collectionTitle)}</h2><span class="muted">${escapeHtml(fmt(d.collectedOf, { owned: owned.size, total: 78 }))}</span></div>` +
      `<div class="collection-bar" role="img" aria-label="${ownedPct}%"><span style="width:${ownedPct}%"></span></div>` +
      `<p class="muted">${escapeHtml(d.collectionNote)} ${escapeHtml(d.collectionFullNote)}</p><p><a href="/cards">${escapeHtml(d.browseLibrary)}</a></p><div class="deck" role="list">${deck}</div></section>` +
      `<section class="panel-card"><h2>${escapeHtml(d.referralTitle)}</h2>` +
      `<p>${escapeHtml(fmt(d.referralLine, { invited: opts.referrals.invited, converted: opts.referrals.converted }))}</p>` +
      `<p class="muted">${escapeHtml(opts.bonusOn ? d.referralBonusOn : d.referralBonusOff)}</p></section>` +
      `<section class="panel-card"><h2>${escapeHtml(d.milestonesTitle)}</h2><ul class="ms-list">${ms}</ul></section>` +
      `</main>${siteFooterHtml(opts.ui, "/progress")}` +
      `<script src="/app/share.js" defer></script><script src="/app/progress.js" defer></script>`,
  });
}
