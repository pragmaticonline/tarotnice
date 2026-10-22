// Asia/Bangkok day boundaries. Every "day" in TarotNice (daily card,
// question quota, streaks) is a Bangkok calendar day. Bangkok is a
// fixed UTC+7 with no DST, so all boundaries are pure epoch math —
// no locale parsing, identical in every runtime timezone.
const OFFSET_MS = 7 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/** "YYYY-MM-DD" in Asia/Bangkok. */
export function bangkokDay(d = new Date()): string {
  return new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** 0 (Sunday) .. 6 (Saturday) in Asia/Bangkok.
 *  Epoch day 0 (1970-01-01) was a Thursday. */
export function bangkokWeekday(d = new Date()): number {
  const days = Math.floor((d.getTime() + OFFSET_MS) / DAY_MS);
  return (((days + 4) % 7) + 7) % 7;
}

/** Epoch ms of the next Bangkok midnight (quota reset countdown). */
/** Bangkok hour bucket "YYYY-MM-DDTHH" for per-IP hourly rate caps. */
export function bangkokHour(d = new Date()): string {
  return new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 13);
}

export function nextBangkokMidnight(d = new Date()): number {
  const shifted = d.getTime() + OFFSET_MS;
  return (Math.floor(shifted / DAY_MS) + 1) * DAY_MS - OFFSET_MS;
}
