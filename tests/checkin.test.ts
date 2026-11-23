import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { checkinWeek } from "../src/lib/checkin";
import { t } from "../src/lib/i18n";
import { progressPage } from "../src/routes/progress";

const STREAK = { current: 3, longest: 9, activeToday: true };

function renderWeek(ui: "en" | "th", today: string, claimed: string[], signup: string | null) {
  const { checkinWeek: wk } = { checkinWeek };
  return wk(today, claimed, signup, ui);
}

describe("checkin week (Mon-Sun, Asia/Bangkok days)", () => {
  it("marks claimed, missed, today and upcoming days", () => {
    // 2026-11-23 is a Monday; claimed today renders as gotToday.
    const week = renderWeek("en", "2026-11-23", ["2026-11-23"], "2026-11-20");
    expect(week.map((d) => d.date)).toEqual([
      "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26",
      "2026-11-27", "2026-11-28", "2026-11-29",
    ]);
    expect(week.map((d) => d.status)).toEqual([
      "gotToday", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming",
    ]);
    expect(week.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("mid-week: past unclaimed days are missed, future days upcoming", () => {
    const week = renderWeek("th", "2026-11-25", ["2026-11-23"], "2026-11-01");
    expect(week.map((d) => d.status)).toEqual([
      "claimed", "missed", "today", "upcoming", "upcoming", "upcoming", "upcoming",
    ]);
    const done = renderWeek("th", "2026-11-25", ["2026-11-25"], "2026-11-01");
    expect(done[2].status).toBe("gotToday");
    expect(week.map((d) => d.label)).toEqual(["\u0e08", "\u0e2d", "\u0e1e", "\u0e1e\u0e24", "\u0e28", "\u0e2a", "\u0e2d\u0e32"]);
  });

  it("days before signup render as upcoming, never missed", () => {
    const week = renderWeek("en", "2026-11-25", [], "2026-11-25");
    expect(week.map((d) => d.status)).toEqual([
      "upcoming", "upcoming", "today", "upcoming", "upcoming", "upcoming", "upcoming",
    ]);
  });

  it("handles weekends and year boundaries", () => {
    // 2026-11-28 is a Saturday; week still starts Monday.
    const week = renderWeek("en", "2026-11-28", [], null);
    expect(week[0].date).toBe("2026-11-23");
    expect(week[6].date).toBe("2026-11-29");
    expect(week[5].status).toBe("today");
    // 2025-12-31 is a Wednesday; week spans the new year.
    const ny = renderWeek("en", "2025-12-31", ["2025-12-29"], null);
    expect(ny.map((d) => d.date)).toEqual([
      "2025-12-29", "2025-12-30", "2025-12-31",
      "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04",
    ]);
    expect(ny[0].status).toBe("claimed");
    expect(ny[1].status).toBe("missed");
    expect(ny[2].status).toBe("today");
    expect(ny[3].status).toBe("upcoming");
  });
});

describe("checkin copy", () => {
  for (const ui of ["en", "th"] as const) {
    it(`has complete token-worded copy (${ui})`, () => {
      const d = t(ui);
      for (const key of [
        "checkinTitle", "checkinSub", "checkinClaim", "checkinDone",
        "checkinRule", "checkinToday", "checkinToast", "checkinPill",
        "checkinMenuWaiting", "checkinClaimedWord", "checkinMissedWord",
        "checkinTodayOpen", "txCheckin",
      ] as const) {
        expect(d[key].length, `${ui}.${key}`).toBeGreaterThan(0);
        expect(d[key], `${ui}.${key}`).not.toMatch(/credit/i);
      }
      expect(d.checkinToast).toContain("{n}");
      expect(d.checkinSub).toContain(ui === "en" ? "Total check-ins:" : "\u0e40\u0e0a\u0e47\u0e01\u0e2d\u0e34\u0e19\u0e41\u0e25\u0e49\u0e27\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14:");
    });
  }

  it("never mixes check-in with the reading streak", () => {
    expect(t("en").checkinTitle).not.toContain("treak");
    expect(t("th").checkinTitle).toContain("\u0e40\u0e0a\u0e47\u0e01\u0e2d\u0e34\u0e19");
    expect(t("th").checkinTitle).not.toContain("\u0e2a\u0e15\u0e23\u0e35\u0e04");
    expect(t("th").checkinTitle).not.toContain("\u0e25\u0e47\u0e2d\u0e01\u0e2d\u0e34\u0e19");
  });
});

describe("checkin card on My journey", () => {
  const base = {
    ui: "en" as const,
    origin: "https://tarotnice.com",
    streak: STREAK,
    days: [],
    owned: [],
    cardNames: {},
    referrals: { invited: 0, converted: 0 },
    bonusOn: false,
    milestones: [],
    readings: 0,
  };
  const week = checkinWeek("2026-11-25", ["2026-11-23"], "2026-11-01", "en");

  it("renders first, before the reading-streak hero", () => {
    const html = progressPage({
      ...base,
      checkin: { claimedToday: false, total: 2, week },
    });
    expect(html.indexOf('id="ci-card"')).toBeLessThan(html.indexOf("journey-hero"));
    expect(html).toContain("Daily check-in");
    expect(html).toContain("Claim today\u2019s 1 token");
    expect(html).toContain('id="ci-claim"');
    expect(html).toContain("Miss a day and that day\u2019s token is gone.");
    const stamps = html.match(/data-ci-stamp="/g)?.length ?? 0;
    expect(stamps).toBe(7);
    expect(html).toContain('data-state="today"');
    expect(html).toContain("data-aria-done");
    expect(html).toContain('id="ci-toast"');
    expect(html).toContain("Total check-ins:");
  });

  it("claimed state shows the green done box, no claim button", () => {
    const html = progressPage({
      ...base, ui: "th",
      checkin: { claimedToday: true, total: 13, week: checkinWeek("2026-11-25", ["2026-11-25"], "2026-11-01", "th") },
    });
    expect(html).toContain("id=\"ci-done\"");
    expect(html).not.toContain('id="ci-claim"');
    expect(html).toContain("\u0e23\u0e31\u0e1a\u0e41\u0e25\u0e49\u0e27\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49");
    expect(html).toContain('data-state="gotToday"');
    expect(html).toContain(">13<");
  });
});

describe("checkin wiring", () => {
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  const index = () => src("../src/index.ts");

  it("claim endpoint is idempotent and registered-only", () => {
    expect(index()).toContain('app.post("/api/checkin/claim"');
    expect(index()).toContain("registration_required");
    expect(index()).toContain("ref: `checkin:${today}`");
    expect(index()).toContain("alreadyClaimed");
    expect(index()).toContain("unclaimCheckin");
  });

  it("summary and progress carry the week state", () => {
    expect(index()).toContain("checkin: { claimedToday");
    expect(index()).toContain("checkinWeek(today, claimedSet, signupDay, ui)");
    expect(index()).toContain("checkin: {");
  });

  it("migration keys checkins on (user, day)", () => {
    expect(src("../drizzle/0013_checkins.sql")).toContain("UNIQUE");
    expect(src("../drizzle/0013_checkins.sql")).toContain("checkins_user_day");
  });

  it("ledger reason and wallet filter cover checkin", () => {
    expect(src("../src/lib/wallet.ts")).toContain('"checkin"');
    const billing = src("../public/app/billing.js");
    expect(billing).toContain('reason === "checkin"');
    expect(billing).toContain("txCheckin");
    expect(billing).toContain("Daily check-in");
  });

  it("header dot and gold journey row are wired to paint()", () => {
    const shell = src("../src/routes/shell.ts");
    expect(shell).toContain("menu-dot");
    expect(shell).toContain("data-checkin-dot");
    expect(shell).toContain("journey-row");
    expect(shell).toContain("data-checkin-pill");
    expect(shell).toContain("checkinMenuWaiting");
    const progress = src("../public/app/progress.js");
    expect(progress).toContain("/api/checkin/claim");
    expect(progress).toContain("ci-toast");
  });
});

describe("auto-refund sweeper", () => {
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

  it("runs on a 15-minute cron and keeps the default export intact", () => {
    const toml = src("../wrangler.toml");
    expect(toml).toContain("[triggers]");
    expect(toml).toContain("*/15 * * * *");
    const index = src("../src/index.ts");
    expect(index).toContain("export default app;");
    expect(index).toContain(".scheduled = async");
    expect(index).toContain("sweepStuckReadings(env.DB, Date.now()");
    expect(index).toContain('"auto_refund"');
  });

  it("marks failed first, refunds only charged rows, once each", () => {
    const sweep = src("../src/lib/sweep.ts");
    expect(sweep).toContain("AUTO_REFUND_DRAWN_AFTER_MS = 10 * 60 * 1000");
    expect(sweep).toContain("AUTO_REFUND_STREAMING_AFTER_MS = 60 * 60 * 1000");
    expect(sweep).toContain("failStuckReading");
    expect(sweep).toContain("ledgerByRef");
    expect(sweep).toContain('reason: "refund"');
    // Failed rows need no action: ids already refunded by the stream catch.
    expect(sweep).toContain("status !== \"drawn\" && row.status !== \"streaming\"");
    const store = src("../src/db/tarot-store.ts");
    expect(store).toContain("stuckReadings");
    expect(store).toContain("failStuckReading");
  });
});
