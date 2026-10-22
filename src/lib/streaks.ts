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

export function computeStreak(days: Iterable<string>, today: string): StreakInfo {
  const set = new Set(days);
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
