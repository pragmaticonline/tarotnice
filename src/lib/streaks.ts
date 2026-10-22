// Daily streaks + unit badges, both derived from activity days and
// lesson progress (no extra state): a streak day is any local calendar
// day with at least one completed activity.

export function localDayString(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayBefore(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type StreakInfo = {
  /** Consecutive days ending today (or yesterday, not yet broken). */
  current: number;
  longest: number;
  activeToday: boolean;
};

/**
 * Freeze rule (SPEC §5.4): one missed day is forgiven when no other
 * day was missed in the 7 days before it. Forgiven days are added to
 * the set, so current and longest streaks both bridge exactly one
 * isolated single-day gap; back-to-back misses never merge.
 */
export function applyFreeze(days: Iterable<string>): Set<string> {
  const set = new Set(days);
  if (set.size === 0) return set;
  const seen = new Set(set);
  const sorted = [...set].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  // Two passes: every decision reads the observed days only, so a
  // forgiven miss never cleans the window of a second miss — at most
  // one forgiveness per 7-day window.
  const forgiven: string[] = [];
  let cursor = first;
  while (cursor < last) {
    cursor = dayAfter(cursor);
    if (cursor >= last) break;
    if (seen.has(cursor)) continue;
    // Single miss only: both neighbours present ...
    if (!seen.has(dayBefore(cursor)) || !seen.has(dayAfter(cursor))) continue;
    // ... and no other miss in the 7 days before it.
    let clean = true;
    let back = dayBefore(cursor);
    for (let i = 0; i < 7; i++) {
      if (back < first) break;
      if (!seen.has(back)) {
        clean = false;
        break;
      }
      back = dayBefore(back);
    }
    if (clean) forgiven.push(cursor);
  }
  for (const day of forgiven) set.add(day);
  return set;
}

function dayAfter(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function computeStreak(days: Iterable<string>, today: string): StreakInfo {
  const set = applyFreeze(days);
  let longest = 0;
  let run = 0;
  const sorted = [...set].sort();
  let prev: string | null = null;
  for (const day of sorted) {
    run = prev && dayBefore(day) === prev ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = day;
  }
  let current = 0;
  let cursor = set.has(today) ? today : dayBefore(today);
  while (set.has(cursor)) {
    current++;
    cursor = dayBefore(cursor);
  }
  return { current, longest, activeToday: set.has(today) };
}
