import { describe, expect, it } from "vitest";
import { computeStreak, localDayString } from "../src/lib/streaks";

describe("computeStreak", () => {
  it("counts consecutive days ending today or yesterday", () => {
    expect(computeStreak(["2026-10-12", "2026-10-13", "2026-10-14"], "2026-10-14")).toEqual({ current: 3, longest: 3, activeToday: true });
    expect(computeStreak(["2026-10-12", "2026-10-13"], "2026-10-14")).toEqual({ current: 2, longest: 2, activeToday: false });
    expect(computeStreak(["2026-10-10"], "2026-10-14").current).toBe(0);
    expect(computeStreak([], "2026-10-14")).toEqual({ current: 0, longest: 0, activeToday: false });
  });

  it("tracks the longest run across gaps", () => {
    const days = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05", "2026-10-06"];
    expect(computeStreak(days, "2026-10-06").longest).toBe(3);
  });

  it("formats local days as YYYY-MM-DD", () => {
    expect(localDayString(new Date(2026, 9, 14))).toBe("2026-10-14");
  });
});
