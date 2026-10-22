import { describe, expect, it } from "vitest";
import { bangkokDay, bangkokWeekday, nextBangkokMidnight } from "../src/lib/bangkok";

describe("bangkokDay", () => {
  it("uses Asia/Bangkok (UTC+7), not server time", () => {
    // 16:59 UTC = 23:59 Bangkok (still Oct 14); 17:00 UTC = Oct 15.
    expect(bangkokDay(new Date("2026-10-14T16:59:00Z"))).toBe("2026-10-14");
    expect(bangkokDay(new Date("2026-10-14T17:00:00Z"))).toBe("2026-10-15");
    // Midday UTC stays the same Bangkok day.
    expect(bangkokDay(new Date("2026-10-14T05:00:00Z"))).toBe("2026-10-14");
  });

  it("reports the Bangkok weekday", () => {
    // 2026-10-14 is a Wednesday.
    expect(bangkokWeekday(new Date("2026-10-14T05:00:00Z"))).toBe(3);
    expect(bangkokWeekday(new Date("2026-10-18T05:00:00Z"))).toBe(0);
  });

  it("returns a future midnight for the quota countdown", () => {
    const now = Date.now();
    const midnight = nextBangkokMidnight(new Date(now));
    expect(midnight).toBeGreaterThan(now);
    expect(midnight - now).toBeLessThanOrEqual(24 * 3600 * 1000);
    expect(bangkokDay(new Date(midnight))).not.toBe(bangkokDay(new Date(now)));
  });
});
