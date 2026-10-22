import { describe, expect, it } from "vitest";
import { applyFreeze, computeStreak, localDayString } from "../src/lib/streaks";

describe("computeStreak", () => {
  it("counts consecutive days ending today or yesterday", () => {
    expect(computeStreak(["2026-10-12", "2026-10-13", "2026-10-14"], "2026-10-14")).toEqual({ current: 3, longest: 3, activeToday: true });
    expect(computeStreak(["2026-10-12", "2026-10-13"], "2026-10-14")).toEqual({ current: 2, longest: 2, activeToday: false });
    expect(computeStreak(["2026-10-10"], "2026-10-14").current).toBe(0);
    expect(computeStreak([], "2026-10-14")).toEqual({ current: 0, longest: 0, activeToday: false });
  });

  it("tracks the longest run across gaps (single miss frozen)", () => {
    const days = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05", "2026-10-06"];
    // The lone 10-04 miss is forgiven, so the run bridges to 6.
    expect(computeStreak(days, "2026-10-06").longest).toBe(6);
    const gapped = ["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07"];
    expect(computeStreak(gapped, "2026-10-07").longest).toBe(3);
  });

  it("formats local days as YYYY-MM-DD", () => {
    expect(localDayString(new Date(2026, 9, 14))).toBe("2026-10-14");
  });
});

describe("freeze (one missed day forgiven)", () => {
  it("bridges a single miss with a clean prior week", () => {
    const days = [
      "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
      "2026-10-05", "2026-10-06", "2026-10-07",
      // 08 missed
      "2026-10-09", "2026-10-10",
    ];
    expect(applyFreeze(days).has("2026-10-08")).toBe(true);
    expect(computeStreak(days, "2026-10-10")).toEqual({ current: 10, longest: 10, activeToday: true });
  });

  it("does not bridge back-to-back misses", () => {
    const days = ["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06"];
    expect(applyFreeze(days).has("2026-10-03")).toBe(false);
    expect(applyFreeze(days).has("2026-10-04")).toBe(false);
    expect(computeStreak(days, "2026-10-06").longest).toBe(2);
  });

  it("does not forgive a second miss within 7 days", () => {
    const days = [
      "2026-10-01", "2026-10-02",
      // 03 missed (prior week clean -> forgiven)
      "2026-10-04", "2026-10-05", "2026-10-06",
      // 07 missed too (prior week holds the 03 miss -> stays missing)
      "2026-10-08",
    ];
    expect(applyFreeze(days).has("2026-10-03")).toBe(true);
    expect(applyFreeze(days).has("2026-10-07")).toBe(false);
    expect(computeStreak(days, "2026-10-08")).toEqual({ current: 1, longest: 6, activeToday: true });
  });

  it("forgives two isolated misses 8+ days apart", () => {
    const days = [
      "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
      "2026-10-05", "2026-10-06", "2026-10-07",
      // 08 missed (forgiven)
      "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12",
      "2026-10-13", "2026-10-14", "2026-10-15",
      // 16 missed (prior week clean -> forgiven too)
      "2026-10-17",
    ];
    expect(applyFreeze(days).has("2026-10-08")).toBe(true);
    expect(applyFreeze(days).has("2026-10-16")).toBe(true);
    expect(computeStreak(days, "2026-10-17").current).toBe(17);
  });
});
