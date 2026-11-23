// Daily check-in week state (Mon-Sun of the current Bangkok week).
// Pure date logic; covered by tests/staff-free unit tests in checkin.test.

export type CheckinDayStatus = "claimed" | "missed" | "today" | "upcoming" | "gotToday";

export type CheckinWeekDay = {
  /** YYYY-MM-DD (Asia/Bangkok). */
  date: string;
  /** Short weekday label, Monday-first. */
  label: string;
  status: CheckinDayStatus;
};

export const WEEKDAY_SHORT: Record<string, string[]> = {
  th: ["\u0e08", "\u0e2d", "\u0e1e", "\u0e1e\u0e24", "\u0e28", "\u0e2a", "\u0e2d\u0e32"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

function mondayOf(today: string): string {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sun
  const back = (dow + 6) % 7;
  const ms = Date.parse(`${today}T00:00:00Z`) - back * 24 * 3600 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Monday-first week containing `today`. Days before the account's first
 * day render as upcoming (never as missed): nobody misses days that
 * happened before they joined.
 */
export function checkinWeek(
  today: string,
  claimed: Set<string> | string[],
  signupDay: string | null,
  lang: "th" | "en" = "th",
): CheckinWeekDay[] {
  const have = claimed instanceof Set ? claimed : new Set(claimed);
  const labels = WEEKDAY_SHORT[lang] ?? WEEKDAY_SHORT.en;
  const monday = mondayOf(today);
  const out: CheckinWeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    let status: CheckinDayStatus;
    if (date === today && have.has(date)) status = "gotToday";
    else if (have.has(date)) status = "claimed";
    else if (signupDay && date < signupDay) status = "upcoming";
    else if (date === today) status = "today";
    else if (date > today) status = "upcoming";
    else status = "missed";
    out.push({ date, label: labels[i] ?? date, status });
  }
  return out;
}
