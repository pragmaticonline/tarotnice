// My journey: daily check-in first, then streak, month calendar with
// topic dots, 78-card collection, milestones and invite panel. Layout,
// copy and motion mirror the My-journey design files (inline styles).
import { escapeHtml } from "../lib/html";
import { fmt, t, type UiLang } from "../lib/i18n";
import { headerHtml, pageShell, siteFooterHtml, type HeaderAccount } from "./shell";
import type { StreakInfo } from "../lib/streaks";
import type { CheckinWeekDay } from "../lib/checkin";
import { fmtDay } from "./billing";

export type Milestone = { key: string; icon: string; label: string; sub: string; pct: number; done: boolean };

export type JourneyEntry = {
  date: string; time: string; topic: string; topicLabel: string;
  question: string; cardsLabel: string; id: string;
};

export type CalDay = { date: string; active: boolean; selected: boolean; isToday: boolean; topics: string[] };

const TOPIC_COLORS: Record<string, string> = {
  love: "#c2477a", career: "#4a3d78", money: "#b0832f", health: "#2f7a43", general: "#2c5a85",
};

const MJ_WEEK: Record<UiLang, string[]> = {
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  th: ["\u0e08", "\u0e2d", "\u0e1e", "\u0e1e\u0e24", "\u0e28", "\u0e2a", "\u0e2d\u0e32"],
};

const ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI"];
const RANK = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "P", "Kn", "Q", "K"];

const CI_GEM = `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3h11l4.5 6-10 12L2 9z" fill="#8b6fe0"/><path d="M2 9h20l-10 12z" fill="#6a4fc9"/><path d="M8.5 9L12 3l3.5 6z" fill="#b9a5f5"/><path d="M12 21L8.5 9h7z" fill="#7b5cd1"/></svg>`;

type StampState = "got" | "miss" | "today" | "gotToday" | "next";

function stampStyle(state: StampState): { bg: string; border: string; lblFg: string; wt: number; icon: string; iconBg: string; iconFg: string; iconBorder: string; amt: string; amtFg: string; anim: string } {
  const base = { wt: 500, anim: "none" };
  if (state === "got") return { ...base, bg: "#f6e7c4", border: "1px solid #e2bf72", lblFg: "#6b5f85", icon: "\u2713", iconBg: "#b0832f", iconFg: "#fffaf2", iconBorder: "0", amt: "+1", amtFg: "#8a6a2a" };
  if (state === "miss") return { ...base, bg: "#f1ece2", border: "1px dashed #d8ccb4", lblFg: "#a79fb8", icon: "\u2715", iconBg: "transparent", iconFg: "#b9b0c7", iconBorder: "1.5px dashed #cfc5d9", amt: "\u2013", amtFg: "#a79fb8" };
  if (state === "today") return { ...base, wt: 700, bg: "linear-gradient(160deg,#fff1cc,#f3d68f)", border: "2px solid #b0832f", lblFg: "#2e2547", icon: "\ud83d\udcae", iconBg: "#fffaf0", iconFg: "#4a3d78", iconBorder: "1.5px solid #b0832f", amt: "+1", amtFg: "#2e2547", anim: "tnPulse 1.8s infinite" };
  if (state === "gotToday") return { ...base, wt: 700, bg: "#4a3d78", border: "2px solid #4a3d78", lblFg: "#f3dca6", icon: "\u2713", iconBg: "#f3dca6", iconFg: "#4a3d78", iconBorder: "0", amt: "+1", amtFg: "#fffaf2" };
  return { ...base, bg: "#ffffff", border: "1px solid #efe5cf", lblFg: "#8a7fa3", icon: "\u00b7", iconBg: "#f6f1fa", iconFg: "#b9b0c7", iconBorder: "0", amt: "+1", amtFg: "#8a7fa3" };
}

function checkinCard(ui: UiLang, d: ReturnType<typeof t>, checkin: { claimedToday: boolean; total: number; week: CheckinWeekDay[] }): string {
  const sep = ui === "th" ? " " : ", ";
  const stamp = (w: CheckinWeekDay): string => {
    const state: StampState = w.status === "claimed" ? "got" : w.status === "missed" ? "miss" : w.status === "today" ? "today" : w.status === "gotToday" ? "gotToday" : "next";
    const v = stampStyle(state);
    const label = state === "today" || state === "gotToday" ? d.checkinToday : w.label;
    const aria = state === "today" ? `${d.checkinToday}${sep}${d.checkinTodayOpen}` : `${label}`;
    const doneAria = state === "today" ? ` data-aria-done="${escapeHtml(`${d.checkinToday}${ui === "th" ? " " : ", "}${d.checkinClaimedWord}`)}"` : "";
    return `<div role="listitem" aria-label="${escapeHtml(aria)}"${doneAria} data-ci-stamp="${escapeHtml(w.label)}" data-state="${state}" style="min-width:0;padding:8px 2px 7px;border-radius:12px;border:${v.border};background:${v.bg};display:flex;flex-direction:column;align-items:center;gap:5px;animation:${v.anim}">` +
      `<span style="font-size:12px;font-weight:${v.wt};color:${v.lblFg};white-space:nowrap">${escapeHtml(label)}</span>` +
      `<span aria-hidden="true" data-ci-icon style="width:26px;height:26px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;background:${v.iconBg};color:${v.iconFg};border:${v.iconBorder}">${v.icon}</span>` +
      `<span style="font-size:12px;font-weight:600;color:${v.amtFg}">${v.amt}</span></div>`;
  };
  const claimed = checkin.claimedToday;
  return `<section aria-labelledby="ci-h" id="ci-card" data-claimed="${claimed ? "true" : "false"}" style="background:#fffaf0;border:1.5px solid ${claimed ? "#e3d6b8" : "#e2bf72"};border-radius:20px;padding:18px 16px;display:flex;flex-direction:column;gap:14px;${claimed ? "" : "box-shadow:0 6px 20px rgba(176,131,47,.18)"}">` +
    `<div style="display:flex;flex-direction:column;gap:2px"><h2 id="ci-h" style="margin:0;font-size:20px;font-weight:600;color:#4a3d78">${escapeHtml(d.checkinTitle)}</h2>` +
    `<span style="font-size:13px;line-height:1.5;color:#6b5f85">${escapeHtml(d.checkinSub)}<b id="ci-total" style="margin:0 4px;color:#2e2547">${checkin.total}</b>${escapeHtml(d.drawerDays)}</span></div>` +
    `<div role="list" style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px">${checkin.week.map(stamp).join("")}</div>` +
    (claimed
      ? `<div id="ci-done" style="display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:52px;padding:0 12px;border-radius:12px;background:#eef7f0;border:1px solid #cfe8d6;color:#2f7a43;font-size:15px;font-weight:600;text-align:center">${escapeHtml(d.checkinDone)}</div>`
      : `<button type="button" id="ci-claim" data-checkin-claim style="display:inline-flex;align-items:center;justify-content:center;gap:10px;height:52px;border:1px solid #b0832f;border-radius:12px;background:linear-gradient(135deg,#f6e2b0 0%,#e2bf72 100%);color:#2e2547;font-size:16px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(176,131,47,.28)">${CI_GEM}<span>${escapeHtml(d.checkinClaim)}</span></button><div id="ci-done" hidden style="align-items:center;justify-content:center;gap:8px;min-height:52px;padding:0 12px;border-radius:12px;background:#eef7f0;border:1px solid #cfe8d6;color:#2f7a43;font-size:15px;font-weight:600;text-align:center">${escapeHtml(d.checkinDone)}</div>`) +
    `<span style="font-size:12px;line-height:1.5;color:#8a7fa3">${escapeHtml(d.checkinRule)}</span></section>`;
}
const STREAK_IMG = "/img/streak-flame.png";

const TOPIC_KEYS = ["love", "career", "money", "health", "general"] as const;

function streakCard(ui: UiLang, d: ReturnType<typeof t>, streak: StreakInfo, readings: number, tokens: number, drewToday: boolean): string {
  return `<section aria-label="${escapeHtml(d.streakTitle)}" style="background:#4a3d78;color:#fffaf2;border-radius:20px;padding:20px;display:flex;flex-direction:column;gap:16px">` +
    `<div style="display:flex;align-items:center;gap:16px">` +
    `<img src="${STREAK_IMG}" alt="" width="64" height="76" style="flex:none;width:64px;height:76px">` +
    `<div style="flex:1 1 auto;display:flex;flex-direction:column;gap:2px;min-width:0">` +
    `<span style="font-size:13px;color:#e6dcf7">${escapeHtml(d.streakTitle)}</span>` +
    `<span style="font-size:34px;line-height:1.1;font-weight:600;color:#f3dca6">${streak.current} ${escapeHtml(streak.current === 1 ? d.drawerDayUnit : d.drawerDays)}</span>` +
    `<span style="font-size:13px;line-height:1.5;color:#e6dcf7">${escapeHtml(d.freezeNote)}</span>` +
    `</div></div>` +
    `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">` +
    `<div style="padding:10px 12px;border-radius:12px;background:rgba(255,250,242,.06);display:flex;flex-direction:column;gap:2px"><span style="font-size:12px;color:#e6dcf7">${escapeHtml(d.bestTitle)}</span><span style="font-size:20px;font-weight:600">${streak.longest}</span></div>` +
    `<div style="padding:10px 12px;border-radius:12px;background:rgba(255,250,242,.06);display:flex;flex-direction:column;gap:2px"><span style="font-size:12px;color:#e6dcf7">${escapeHtml(d.mjReadings)}</span><span style="font-size:20px;font-weight:600">${readings}</span></div>` +
    `<div style="padding:10px 12px;border-radius:12px;background:rgba(255,250,242,.06);display:flex;flex-direction:column;gap:2px"><span style="font-size:12px;color:#e6dcf7">${escapeHtml(d.drawerTokens)}</span><span style="font-size:20px;font-weight:600">${tokens}</span></div>` +
    `</div>` +
    (drewToday ? "" :
      `<a href="/" style="display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:48px;padding:0 16px;border-radius:12px;background:#f3dca6;color:#2e2547;text-decoration:none;font-size:15px;font-weight:600"><span>${escapeHtml(d.mjKeepStreak)}</span><span aria-hidden="true">›</span></a>`) +
    `</section>`;
}

function calendarCard(ui: UiLang, d: ReturnType<typeof t>, cal: { ym: string; prev: string; next: string; label: string; suit: string; days: { date: string; active: boolean; selected: boolean; isToday: boolean; topics: string[] }[] }, selectedDay: string, entries: JourneyEntry[]): string {
  const dayNum = (iso: string) => String(Number(iso.slice(8, 10)));
  const lead = (() => {
    const [y, m] = cal.ym.split("-").map(Number);
    return (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  })();
  const blanks = Array.from({ length: lead }, () => `<span aria-hidden="true"></span>`).join("");
  const trail = (7 - ((lead + cal.days.length) % 7)) % 7;
  const trailHtml = Array.from({ length: trail }, () => `<span aria-hidden="true"></span>`).join("");
  const cells = cal.days.map((d0) => {
    const has = d0.active;
    const sel = d0.selected;
    const bg = has ? "#f6e7c4" : "#ffffff";
    const border = sel ? "2px solid #4a3d78" : has ? "1px solid #e2bf72" : "1px solid #efe5cf";
    const dots = d0.topics.slice(0, 3).map((t0) => `<span style="width:6px;height:6px;border-radius:999px;background:${TOPIC_COLORS[t0] ?? "#8a7fa3"}"></span>`).join("");
    const aria = `${Number(d0.date.slice(8, 10))} ${cal.label}${has ? ` \u00b7 ${d0.topics.length}` : ""}`;
    return `<a href="/progress?month=${cal.ym}&amp;day=${d0.date}${cal.suit !== "all" ? `&amp;suit=${cal.suit}` : ""}" aria-label="${escapeHtml(aria)}" aria-pressed="${sel ? "true" : "false"}" style="min-width:0;padding:4px 0;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;background:${bg};border:${border};color:#2e2547;text-decoration:none;${d0.isToday ? "box-shadow:inset 0 0 0 2px #4a3d78;" : ""}font-weight:${has || d0.isToday ? 600 : 400}">` +
      `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;border-radius:999px;font-size:14px">${dayNum(d0.date)}</span>` +
      `<span style="display:flex;gap:3px;height:6px" aria-hidden="true">${dots}</span></a>`;
  }).join("");
  const legend = (["love", "career", "money", "health", "general"] as const)
    .map((k) => `<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:999px;background:${TOPIC_COLORS[k]}"></span>${escapeHtml(MJ_TOPICS[ui][k] ?? k)}</span>`)
    .join("");
  const evs = entries.map((e) =>
    `<a href="/history/${escapeHtml(e.id)}" style="display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:12px;border:1px solid #e3d6b8;background:#ffffff;text-decoration:none;color:#2e2547">` +
    `<span aria-hidden="true" style="flex:none;width:4px;align-self:stretch;border-radius:999px;background:${TOPIC_COLORS[e.topic] ?? "#8a7fa3"}"></span>` +
    `<span style="flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:3px">` +
    `<span style="font-size:12px;color:#6b5f85">${escapeHtml(e.time)} \u00b7 ${escapeHtml(e.topicLabel)}</span>` +
    `<span style="font-size:15px;line-height:1.4;font-weight:500;color:#4a3d78">\u201c${escapeHtml(e.question)}\u201d</span>` +
    `<span style="font-size:12px;color:#6b5f85">${escapeHtml(e.cardsLabel)}</span></span>` +
    `<span aria-hidden="true" style="flex:none;color:#4a3d78">\u203a</span></a>`).join("");
  const empty = entries.length === 0
    ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap"><span style="font-size:14px;color:#6b5f85">${escapeHtml(d.mjNoReading)}</span><a href="/" style="display:inline-flex;align-items:center;min-height:40px;padding:0 14px;border-radius:10px;background:#4a3d78;color:#fffaf2;text-decoration:none;font-size:14px;font-weight:600">${escapeHtml(d.drawerAsk)}</a></div>`
    : "";
  return `<section aria-label="${escapeHtml(cal.label)}" style="background:#fffaf0;border:1px solid #e3d6b8;border-radius:20px;padding:20px;display:flex;flex-direction:column;gap:14px">` +
    `<div style="display:flex;align-items:center;gap:8px"><h2 style="flex:1 1 auto;margin:0;font-size:20px;font-weight:600;color:#4a3d78">${escapeHtml(cal.label)}</h2>` +
    `<a href="/progress?month=${cal.prev}${cal.suit !== "all" ? `&amp;suit=${cal.suit}` : ""}" aria-label="${escapeHtml(d.prevMonth)}" style="width:44px;height:44px;border:1px solid #e3d6b8;border-radius:12px;background:#ffffff;color:#2e2547;font-size:18px;display:inline-flex;align-items:center;justify-content:center;text-decoration:none">\u2039</a>` +
    `<a href="/progress?month=${cal.next}${cal.suit !== "all" ? `&amp;suit=${cal.suit}` : ""}" aria-label="${escapeHtml(d.nextMonth)}" style="width:44px;height:44px;border:1px solid #e3d6b8;border-radius:12px;background:#ffffff;color:#2e2547;font-size:18px;display:inline-flex;align-items:center;justify-content:center;text-decoration:none">\u203a</a></div>` +
    `<div aria-hidden="true" style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;text-align:center;font-size:12px;font-weight:600;color:#6b5f85">${MJ_WEEK[ui].map((w) => `<span>${w}</span>`).join("")}</div>` +
    `<div role="grid" aria-label="${escapeHtml(cal.label)}" style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px">${blanks}${cells}${trailHtml}</div>` +
    `<div style="display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:#5e5277">${legend}</div>` +
    `<div style="border-top:1px solid #efe5cf;padding-top:14px;display:flex;flex-direction:column;gap:10px">` +
    `<span style="font-size:15px;font-weight:600">${escapeHtml(fmtDay(selectedDay, ui))}</span>${empty}${evs}</div></section>`;
}
const MJ_TOPICS: Record<UiLang, Record<string, string>> = {
  en: { love: "Love", career: "Career", money: "Money", health: "Health", general: "General" },
  th: { love: "\u0e04\u0e27\u0e32\u0e21\u0e23\u0e31\u0e01", career: "\u0e01\u0e32\u0e23\u0e07\u0e32\u0e19", money: "\u0e40\u0e07\u0e34\u0e19", health: "\u0e2a\u0e38\u0e02\u0e20\u0e32\u0e1e", general: "\u0e17\u0e31\u0e48\u0e27\u0e44\u0e1b" },
};

const SUIT_KEYS = ["major", "wands", "cups", "swords", "pentacles"] as const;

function collectionCard(
  ui: UiLang, d: ReturnType<typeof t>,
  owned: Set<number>, names: Record<number, string>, images: Record<number, string>,
  suit: string, month: string, day: string,
): string {
  const suitOf = (id: number): string => (images[id] ?? "").split("/").pop()!.split(".")[0].split("-")[0] ?? "";
  const groups = SUIT_KEYS.map((key, gi) => {
    const ids: number[] = [];
    for (let id = 0; id < 78; id++) if (suitOf(id) === key) ids.push(id);
    return { key, ids };
  });
  const glabel = [d.mjG0, d.mjG1, d.mjG2, d.mjG3, d.mjG4];
  const chips = [{ key: "all", label: d.mjAll, count: `${owned.size}/78` }]
    .concat(groups.map((g, gi) => {
      const n = g.ids.filter((id) => owned.has(id)).length;
      return { key: g.key, label: glabel[gi], count: `${n}/${g.ids.length}` };
    }));
  const chipHtml = chips
    .map((c) => {
      const on = suit === c.key;
      const href = `/progress?month=${month}&amp;day=${day}&amp;suit=${c.key}`;
      return `<a href="${href}" aria-pressed="${on ? "true" : "false"}" style="display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 12px;border-radius:999px;text-decoration:none;font-size:13px;border:1px solid ${on ? "#4a3d78" : "#d6cbe0"};background:${on ? "#4a3d78" : "#ffffff"};color:${on ? "#fffaf2" : "#2e2547"}"><span>${escapeHtml(c.label)}</span><span style="font-weight:600">${escapeHtml(c.count)}</span></a>`;
    })
    .join("");
  const shown = suit === "all" ? groups : groups.filter((g) => g.key === suit);
  const ownedCount = owned.size;
  const pct = Math.round((ownedCount / 78) * 100);
  const groupsHtml = shown
    .map((g, gi) => {
      const n = g.ids.filter((id) => owned.has(id)).length;
      const done = n === g.ids.length;
      const gpct = g.ids.length ? Math.round((n / g.ids.length) * 100) : 0;
      const cards = g.ids
        .map((id, i) => {
          const has = owned.has(id);
          const name = names[id] ?? `#${id}`;
          const mark = g.key === "major" ? ROMAN[i] ?? "" : RANK[i] ?? "";
          const title = has ? name : `${name} \u2013 ${d.mjLocked}`;
          return `<span role="listitem" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}" style="position:relative;display:block;aspect-ratio:0.58;border-radius:6px;overflow:hidden;border:1px solid ${has ? "#b0832f" : "#e3d6b8"};background:#3b2f6b;${has ? "box-shadow:0 2px 6px rgba(74,61,120,.25)" : ""}">` +
            `<img src="${has ? images[id] ?? "/static/cards/back.webp" : "/static/cards/back.webp"}" alt="" loading="lazy" style="display:block;width:100%;height:100%;object-fit:cover;opacity:${has ? 1 : 0.32}">` +
            (has ? "" : `<span aria-hidden="true" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fffaf2;font-family:'Cormorant Garamond',Georgia,serif;font-size:14px;font-weight:600;text-shadow:0 1px 2px rgba(0,0,0,.5)">${escapeHtml(mark)}</span>`) +
            `</span>`;
        })
        .join("");
      return `<div style="display:flex;flex-direction:column;gap:10px;padding-top:12px;border-top:1px solid #efe5cf">` +
        `<button type="button" data-coll-toggle aria-expanded="true" style="display:flex;align-items:center;gap:10px;min-height:40px;padding:0;border:0;background:transparent;color:#2e2547;cursor:pointer;text-align:left">` +
        `<span style="flex:1 1 auto;display:flex;flex-direction:column;gap:4px;min-width:0">` +
        `<span style="display:flex;justify-content:space-between;gap:8px;font-size:15px;font-weight:600"><span>${escapeHtml(glabel[SUIT_KEYS.indexOf(g.key)])}</span><span style="font-weight:500;color:${done ? "#2f7a43" : "#6b5f85"}">${n}/${g.ids.length}</span></span>` +
        `<span style="height:4px;border-radius:999px;background:#eee5d2;overflow:hidden"><span style="display:block;height:100%;width:${gpct}%;background:${done ? "#2f7a43" : "#c49a3c"}"></span></span></span>` +
        `<span aria-hidden="true" data-coll-chevron style="flex:none;color:#6b5f85;font-size:14px;transition:transform .15s">\u25be</span></button>` +
        `<div role="list" data-coll-grid style="display:grid;grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:8px 6px">${cards}</div></div>`;
    })
    .join("");
  return `<section aria-label="${escapeHtml(d.collectionTitle)}" style="background:#fffaf0;border:1px solid #e3d6b8;border-radius:20px;padding:20px;display:flex;flex-direction:column;gap:14px">` +
    `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap">` +
    `<h2 style="margin:0;font-size:20px;font-weight:600;color:#4a3d78">${escapeHtml(d.collectionTitle)}</h2>` +
    `<span style="font-size:14px;color:#6b5f85"><b style="color:#2e2547">${ownedCount}</b> / 78 ${escapeHtml(d.mjUnit)}</span></div>` +
    `<div role="img" aria-label="${pct}%" style="height:8px;border-radius:999px;background:#eadfc6;overflow:hidden"><span style="display:block;height:100%;width:${pct}%;border-radius:999px;background:linear-gradient(90deg,#c49a3c,#e2bf72)"></span></div>` +
    `<p style="margin:0;font-size:14px;line-height:1.55;color:#5e5277">${escapeHtml(d.mjColNote)}</p>` +
    `<div style="display:flex;flex-wrap:wrap;gap:6px">${chipHtml}</div>` +
    `${groupsHtml}` +
    `<a href="/cards" style="align-self:flex-start;display:inline-flex;align-items:center;min-height:40px;font-size:14px;font-weight:600">${escapeHtml(d.mjLibrary)}</a></section>`;
}

function milestonesCard(d: ReturnType<typeof t>, ms: Milestone[]): string {
  const rows = ms
    .map(
      (m) =>
        `<div style="padding:12px;border-radius:14px;border:1px solid ${m.done ? "#cfe8d6" : "#efe5cf"};background:${m.done ? "#eef7f0" : "#ffffff"};display:flex;flex-direction:column;gap:8px">` +
        `<div style="display:flex;align-items:center;gap:10px">` +
        `<span aria-hidden="true" style="flex:none;width:36px;height:36px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:16px;background:${m.done ? "#2f7a43" : "#efe7f7"};color:${m.done ? "#ffffff" : "#4a3d78"}">${m.done ? "\u2713" : m.icon}</span>` +
        `<span style="display:flex;flex-direction:column;min-width:0"><span style="font-size:14px;font-weight:600;line-height:1.35">${escapeHtml(m.label)}</span><span style="font-size:12px;color:#6b5f85">${escapeHtml(m.sub)}</span></span></div>` +
        `<span style="height:6px;border-radius:999px;background:#eee5d2;overflow:hidden"><span style="display:block;height:100%;width:${m.pct}%;background:${m.done ? "#2f7a43" : "#c49a3c"}"></span></span></div>`,
    )
    .join("");
  return `<section aria-label="${escapeHtml(d.mjMsTitle)}" style="background:#fffaf0;border:1px solid #e3d6b8;border-radius:20px;padding:20px;display:flex;flex-direction:column;gap:14px">` +
    `<h2 style="margin:0;font-size:20px;font-weight:600;color:#4a3d78">${escapeHtml(d.mjMsTitle)}</h2>` +
    `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">${rows}</div></section>`;
}

function inviteCard(ui: UiLang, d: ReturnType<typeof t>, invite: { code: string; link: string; invited: number; converted: number; earned: number }): string {
  const shareUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(invite.link)}`;
  return `<section aria-label="${escapeHtml(d.mjInvTitle)}" style="background:#efe7f7;border:1px solid #d9cbee;border-radius:20px;padding:20px;display:flex;flex-direction:column;gap:14px">` +
    `<div style="display:flex;align-items:flex-start;gap:12px">` +
    `<span aria-hidden="true" style="flex:none;width:44px;height:44px;border-radius:12px;background:#4a3d78;display:inline-flex;align-items:center;justify-content:center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f3dca6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="13" rx="2"></rect><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1.5S9 8 12 8zM12 8c2-4 6-4 6-1.5S15 8 12 8z"></path></svg></span>` +
    `<div style="display:flex;flex-direction:column;gap:4px"><h2 style="margin:0;font-size:20px;font-weight:600;color:#4a3d78">${escapeHtml(d.mjInvTitle)}</h2>` +
    `<p style="margin:0;font-size:14px;line-height:1.55;color:#4a4062">${escapeHtml(d.mjInvSub)}</p></div></div>` +
    `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;text-align:center">` +
    `<div style="padding:10px 6px;border-radius:12px;background:#fffaf0;display:flex;flex-direction:column;gap:2px"><span style="font-size:20px;font-weight:600;color:#4a3d78">${invite.invited}</span><span style="font-size:12px;color:#6b5f85">${escapeHtml(d.mjJoined)}</span></div>` +
    `<div style="padding:10px 6px;border-radius:12px;background:#fffaf0;display:flex;flex-direction:column;gap:2px"><span style="font-size:20px;font-weight:600;color:#4a3d78">${invite.converted}</span><span style="font-size:12px;color:#6b5f85">${escapeHtml(d.mjDrew)}</span></div>` +
    `<div style="padding:10px 6px;border-radius:12px;background:#fffaf0;display:flex;flex-direction:column;gap:2px"><span style="font-size:20px;font-weight:600;color:#4a3d78">${invite.earned}</span><span style="font-size:12px;color:#6b5f85">${escapeHtml(d.mjEarned)}</span></div>` +
    `</div>` +
    `<div style="display:flex;flex-wrap:wrap;gap:10px">` +
    `<a href="${shareUrl}" target="_blank" rel="noopener" style="flex:1 1 180px;display:inline-flex;align-items:center;justify-content:center;gap:8px;height:48px;border-radius:12px;background:#06c755;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600"><svg viewBox="0 0 40 36" width="24" height="22" aria-hidden="true"><path d="M20 3c-9.4 0-17 6-17 13.3 0 4.3 2.8 8 7 10.1-.3 1.1-1.1 3.9-3.9 4.9 0 0 4.1.3 7.7-2 .9.2 3.5.6 6.2.6 9.4 0 17-6 17-13.3S29.4 3 20 3z" fill="#fff"/><text x="20" y="20.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="9" font-weight="900" fill="#06C755">LINE</text></svg>${escapeHtml(d.mjShareLine)}</a>` +
    `<button type="button" data-copy-invite="${escapeHtml(invite.link)}" data-copied="${escapeHtml(d.copiedBtn)}" style="flex:1 1 180px;height:48px;border:1.5px solid #4a3d78;border-radius:12px;background:#fffaf0;color:#4a3d78;font-size:15px;font-weight:600;cursor:pointer">${escapeHtml(d.mjCopyLink)}</button>` +
    `</div></section>`;
}
export function progressPage(opts: {
  ui: UiLang;
  origin: string;
  streak: StreakInfo;
  /** Current Bangkok month (YYYY-MM) + grid days with topic dots. */
  calMonth: string;
  calDays: CalDay[];
  monthLabel: string;
  monthPrev: string;
  monthNext: string;
  selectedDay: string;
  suitFilter: string;
  /** Readings for the selected day, newest first. */
  entries: JourneyEntry[];
  /** Owned card ids (daily draws). */
  owned: number[];
  cardNames: Record<number, string>;
  /** Card id → R2 image key for owned-card faces. */
  cardImage: Record<number, string>;
  invite: { code: string; link: string; invited: number; converted: number; earned: number; rewardToday: number; rewardCap: number };
  milestones: Milestone[];
  readings: number;
  tokens: number;
  drewToday: boolean;
  /** Daily check-in week (Monday-first labels included). */
  checkin?: { claimedToday: boolean; total: number; week: CheckinWeekDay[] };
  /** Server-rendered header initial + token balance (no first-paint flash). */
  account?: HeaderAccount;
}): string {
  const d = t(opts.ui);
  const ui = opts.ui;
  const head = headerHtml({ ui: opts.ui, streak: opts.streak, path: "/progress", account: opts.account });
  const todayCap = fmt(d.mjTodayCap, { n: opts.invite.rewardToday, cap: opts.invite.rewardCap });
  return pageShell({
    title: `${d.drawerJourney} · TarotNice`,
    lang: opts.ui,
    origin: opts.origin,
    noindex: true,
    extraHead: `<script>window.__tnProgressCopy=${JSON.stringify({ copied: d.copiedBtn })};</script>`,
    body:
      `${head}<main style="flex:1 1 auto;width:100%;max-width:640px;margin:0 auto;box-sizing:border-box;padding:24px 16px 56px;display:flex;flex-direction:column;gap:16px">` +
      `<div id="ci-toast" data-template="${escapeHtml(d.checkinToast)}" hidden role="status" style="position:fixed;top:84px;left:50%;transform:translateX(-50%);z-index:9;align-items:center;gap:8px;padding:10px 16px;border-radius:999px;background:#2e2547;color:#fffaf2;font-size:14px;font-weight:600;box-shadow:0 8px 24px rgba(46,37,71,.3);white-space:nowrap;animation:tnPop 2.6s ease forwards"></div>` +
      `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><h1 style="flex:1 1 auto;margin:0;font-size:28px;line-height:1.2;font-weight:600;color:#4a3d78">${escapeHtml(d.drawerJourney)}</h1>` +
      `<a href="/history" style="display:inline-flex;align-items:center;min-height:40px;font-size:14px;font-weight:600">${escapeHtml(d.mjAllReadings)}</a></div>` +
      checkinCard(ui, d, opts.checkin ?? { claimedToday: false, total: 0, week: [] }) +
      streakCard(ui, d, opts.streak, opts.readings, opts.tokens, opts.drewToday) +
      calendarCard(ui, d, {
        ym: opts.calMonth, prev: opts.monthPrev, next: opts.monthNext, label: opts.monthLabel, suit: opts.suitFilter,
        days: opts.calDays,
      }, opts.selectedDay, opts.entries) +
      collectionCard(ui, d, new Set(opts.owned), opts.cardNames, opts.cardImage, opts.suitFilter, opts.calMonth, opts.selectedDay) +
      milestonesCard(d, opts.milestones) +
      inviteCard(ui, d, opts.invite) +
      `</main>${siteFooterHtml(opts.ui, "/progress")}` +
      `<script src="/app/progress.js" defer></script>`,
  });
}
