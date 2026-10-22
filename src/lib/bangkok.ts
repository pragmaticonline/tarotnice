// Asia/Bangkok day boundaries. Every "day" in TarotNice (daily card,
// question quota, streaks) is a Bangkok calendar day, computed on the
// server so visitors in any timezone share one clock.
const BKK = "Asia/Bangkok";

const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BKK,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" in Asia/Bangkok. */
export function bangkokDay(d = new Date()): string {
  return dayFmt.format(d);
}

const weekdayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: BKK,
  weekday: "short",
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 0 (Sunday) .. 6 (Saturday) in Asia/Bangkok. */
export function bangkokWeekday(d = new Date()): number {
  return WEEKDAYS.indexOf(weekdayFmt.format(d));
}

/** Epoch ms of the next Bangkok midnight (quota reset countdown). */
export function nextBangkokMidnight(d = new Date()): number {
  const bkk = new Date(d.toLocaleString("en-US", { timeZone: BKK }));
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  const offset = bkk.getTime() - utc.getTime();
  const bkkMidnight = new Date(bkk);
  bkkMidnight.setHours(24, 0, 0, 0);
  return bkkMidnight.getTime() - offset;
}
