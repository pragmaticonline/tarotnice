import { describe, expect, it } from "vitest";
import app, { bangkokMonth, monthGridDays, parseCalMonth } from "../src/index";
import { historyDetailPage, historyPage, summaryPreview } from "../src/routes/history";
import { progressPage } from "../src/routes/progress";
import { cardDetailPage, cardsPage } from "../src/routes/library";
import { badgeLandingPage } from "../src/routes/share";

const STREAK = { current: 3, longest: 9, activeToday: true };

describe("historyPage", () => {
  it("lists readings newest-first with a cursor link", () => {
    const html = historyPage({
      ui: "en",
      origin: "https://tarotnice.com",
      streak: STREAK,
      items: [
        {
          id: "r1", day: "2026-10-22", topic: "love", topicLabel: "Love",
          question: "Should we move in?",
          cards: [{ name: "The Lovers", reversed: false, image: "/static/cards/major-06.webp", reversedLabel: "Reversed" }],
          summary: "Trust the slow build.", status: "complete", createdAt: 2,
        },
        {
          id: "r0", day: "2026-10-21", topic: "career", topicLabel: "Career",
          question: "New job?", cards: [], summary: null, status: "failed", createdAt: 1,
        },
      ],
      nextCursor: 1,
    });
    expect(html).toContain("Should we move in?");
    expect(html).toContain("Trust the slow build.");
    expect(html).toContain("/history/r1");
    expect(html).toContain("failed");
    expect(html).toContain("/history?cursor=1");
    expect(html).toContain("noindex");
    expect(html.indexOf("/history/r1")).toBeLessThan(html.indexOf("/history/r0"));
    // Design board D: search, topic chips, month groups, card thumbs.
    expect(html).toContain("data-history-search");
    expect(html).toContain('data-topic-filter="love"');
    expect(html).toContain("data-month-group");
    expect(html).toContain("hist-thumb");
    expect(html).toContain("New reading");
  });

  it("shows the empty state without a cursor link", () => {
    const html = historyPage({ ui: "th", origin: "https://tarotnice.com", streak: STREAK, items: [], nextCursor: null });
    expect(html).not.toContain("cursor=");
    expect(html).toContain('href="/"');
  });

  it("escapes question HTML", () => {
    const html = historyPage({
      ui: "en", origin: "https://tarotnice.com", streak: STREAK,
      items: [{
        id: "r1", day: "2026-10-22", topic: "love", topicLabel: "Love",
        question: "<img src=x onerror=1>", cards: [], summary: null, status: "complete", createdAt: 1,
      }],
      nextCursor: null,
    });
    expect(html).not.toContain("<img src=x onerror=1>");
    expect(html).toContain("&lt;img");
  });
});

describe("historyDetailPage", () => {
  const reading = {
    id: "r1", topicLabel: "Love", question: "Should we move in?",
    cards: [
      { name: "The Lovers", image: "/static/cards/major-06.webp", image2x: "/static/cards/major-06@2x.webp", reversed: false, reversedLabel: "Reversed" },
      { name: "The Tower", image: "/static/cards/major-16.webp", image2x: "/static/cards/major-16@2x.webp", reversed: true, reversedLabel: "Reversed" },
    ],
    aiText: "Full interpretation here.", journal: "My note.", status: "complete",
  };

  it("renders text, cards, journal, share + delete controls", () => {
    const html = historyDetailPage({ ui: "en", origin: "https://tarotnice.com", streak: STREAK, reading });
    expect(html).toContain("Full interpretation here.");
    expect(html).toContain("The Tower");
    expect(html).toContain("My note.");
    expect(html).toContain("data-share-reading");
    expect(html).toContain("data-delete-reading");
    expect(html).toContain('id="journal-form"');
    expect(html).toContain("noindex");
    expect(html).toContain("/app/share.js");
    expect(html).toContain("/app/history.js");
  });

  it("caps the journal at 500 chars and escapes everything", () => {
    const html = historyDetailPage({
      ui: "en", origin: "https://tarotnice.com", streak: STREAK,
      reading: { ...reading, question: "<b>q</b>", journal: "<i>j</i>" },
    });
    expect(html).toContain('maxlength="500"');
    expect(html).not.toContain("<b>q</b>");
    expect(html).toContain("&lt;b&gt;q&lt;/b&gt;");
    expect(html).toContain("&lt;i&gt;j&lt;/i&gt;");
  });

  it("parses labelled sections like the live reading and strips Summary", () => {
    const aiText = [
      "Overview: You stand at a crossroads.",
      "1 \u00b7 Situation \u2014 **The Fool**\nA new beginning calls.",
      "**Guidance:** Trust your own pace.",
      "**What to do:**\n- Write it down\n- Tell a friend",
      "**What next:** A quieter week follows.",
      "**Explore further:**\n- What should I watch for?\n- How do I prepare?",
      "Summary: Trust the slow build.",
    ].join("\n\n");
    const html = historyDetailPage({
      ui: "en", origin: "https://tarotnice.com", streak: STREAK,
      reading: { ...reading, aiText, summary: "Trust the slow build." },
    });
    expect(html).toContain("sec-guidance");
    expect(html).toContain("Trust your own pace.");
    expect(html).toContain("sec-advice");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>Write it down</li>");
    expect(html).toContain("sec-follow");
    expect(html).toContain("/?prefill=What%20should%20I%20watch%20for%3F");
    expect(html).not.toContain("**Guidance:**");
    expect(html).not.toContain("<p>**");
    expect(html).not.toContain("- Write it down");
    expect(html).not.toContain("Summary:");
  });

  it("parses Thai section labels too", () => {
    const aiText = [
      "\u0e20\u0e32\u0e1e\u0e23\u0e27\u0e21: \u0e04\u0e38\u0e13\u0e22\u0e37\u0e19\u0e2d\u0e22\u0e39\u0e48\u0e17\u0e35\u0e48\u0e17\u0e32\u0e07\u0e41\u0e22\u0e01",
      "**\u0e04\u0e33\u0e41\u0e19\u0e30\u0e19\u0e33:** \u0e44\u0e27\u0e49\u0e43\u0e08\u0e15\u0e31\u0e27\u0e40\u0e2d\u0e07",
      "**\u0e2a\u0e23\u0e38\u0e1b:** \u0e44\u0e27\u0e49\u0e43\u0e08\u0e15\u0e31\u0e27\u0e40\u0e2d\u0e07",
    ].join("\n\n");
    const html = historyDetailPage({
      ui: "th", origin: "https://tarotnice.com", streak: STREAK,
      reading: { ...reading, aiText, summary: null },
    });
    expect(html).toContain("sec-guidance");
    expect(html).not.toContain("**\u0e04\u0e33\u0e41\u0e19\u0e30\u0e19\u0e33:**");
    expect(html).not.toContain("\u0e2a\u0e23\u0e38\u0e1b:");
  });

  it("summaryPreview strips markdown and the Overview label", () => {
    expect(summaryPreview("Trust the slow build.")).toBe("Trust the slow build.");
    expect(summaryPreview("**Overview:** Trust the slow build.")).toBe("Trust the slow build.");
    expect(summaryPreview("**\u0e20\u0e32\u0e1e\u0e23\u0e27\u0e21:** \u0e44\u0e27\u0e49\u0e43\u0e08\u0e15\u0e31\u0e27\u0e40\u0e2d\u0e07")).toBe("\u0e44\u0e27\u0e49\u0e43\u0e08\u0e15\u0e31\u0e27\u0e40\u0e2d\u0e07");
    expect(summaryPreview(null)).toBeNull();
    expect(summaryPreview("  ")).toBeNull();
  });
});

describe("progressPage", () => {
  const days = Array.from({ length: 14 }, (_, i) => ({
    date: `2026-10-${String(9 + i).padStart(2, "0")}`,
    active: i % 2 === 0,
  }));
  const cardNames: Record<number, string> = { 0: "The Fool", 1: "The Magician" };

  it("renders streak, 14-day grid, 78-cell deck, referrals, milestones", () => {
    const html = progressPage({
      ui: "en", origin: "https://tarotnice.com", streak: STREAK, days,
      owned: [0, 1], cardNames,
      referrals: { invited: 2, converted: 1 }, bonusOn: false,
      milestones: [
        { key: "first", label: "First reading", achieved: true },
        { key: "streak7", label: "7-day streak", achieved: false },
      ],
      readings: 5,
    });
    expect(html).toContain("noindex");
    expect(html).toContain("2 / 78");
    expect(html).toContain("2 friends joined, 1 drew a reading.");
    expect(html).toContain("data-share-badge=\"first\"");
    expect(html).not.toContain("data-share-badge=\"streak7\"");
    expect(html).toContain("The Fool");
    const cells = html.match(/cal-cell/g)?.length ?? 0;
    expect(cells).toBeGreaterThanOrEqual(14);
    // Design board F: streak hero, 5-week grid, collection bar.
    expect(html).toContain("journey-hero");
    expect(html).toContain("Last 5 weeks");
    expect(html).toContain("collection-bar");
    expect(html).toContain("2 / 78 collected");
    const deck = html.match(/deck-cell/g)?.length ?? 0;
    expect(deck).toBeGreaterThanOrEqual(78);
  });

  it("builds month helpers on Bangkok boundaries", () => {
    expect(parseCalMonth("2026-11")).toBe("2026-11");
    expect(parseCalMonth(" 2026-02 ")).toBe("2026-02");
    expect(parseCalMonth(undefined)).toBeNull();
    expect(parseCalMonth("nov")).toBeNull();
    expect(parseCalMonth("2026-13")).toBeNull();
    expect(parseCalMonth("1999-12")).toBeNull();
    // UTC+7: 17:00Z on the 31st is already the 1st in Bangkok.
    expect(bangkokMonth(new Date(Date.UTC(2025, 11, 31, 17, 0, 0)))).toBe("2026-01");
    expect(bangkokMonth(new Date(Date.UTC(2025, 11, 31, 16, 59, 0)))).toBe("2025-12");
    const nov = monthGridDays(new Set(["2026-11-04"]), "2026-11");
    expect(nov).toHaveLength(30);
    expect(nov[0].date).toBe("2026-11-01");
    expect(nov[29].date).toBe("2026-11-30");
    expect(nov.filter((d) => d.active).map((d) => d.date)).toEqual(["2026-11-04"]);
    expect(monthGridDays(new Set(), "2026-02")).toHaveLength(28);
  });

  it("renders a full labelled month with padded weeks and arrows", () => {
    const days = monthGridDays(new Set(["2026-11-04"]), "2026-11");
    const html = progressPage({
      ui: "en", origin: "https://tarotnice.com", streak: STREAK, days,
      owned: [], cardNames: {},
      referrals: { invited: 0, converted: 0 }, bonusOn: false,
      milestones: [], readings: 1,
      monthLabel: "November 2026", monthPrev: "2026-10", monthNext: "2026-12",
    });
    expect(html).toContain("November 2026");
    // 30 day buttons, none from October or December.
    expect(html.match(/data-cal-day="/g)?.length ?? 0).toBe(30);
    expect(html).not.toContain("2026-10-");
    expect(html).not.toContain("2026-12-");
    // Nov 2026 starts on a Sunday: 6 lead + 6 trail blanks pad the grid.
    expect(html.match(/cal-cell blank/g)?.length ?? 0).toBe(12);
    expect(html).toContain('href="/progress?month=2026-10"');
    expect(html).toContain('href="/progress?month=2026-12"');
    expect(html).toContain('aria-label="Previous month"');
  });
});

describe("library pages", () => {
  const card = {
    id: 0, slug: "the-fool", name: "The Fool",
    image: "/static/cards/major-00.webp", image2x: "/static/cards/major-00@2x.webp",
    reviewed: false,
  };

  it("cardsPage groups major first with draft marks", () => {
    const html = cardsPage({
      ui: "en", origin: "https://tarotnice.com", streak: STREAK,
      groups: [
        { title: "Major Arcana", cards: [card] },
        { title: "Wands", cards: [] },
      ],
    });
    expect(html).toContain("Major Arcana");
    expect(html).toContain("/cards/the-fool");
    expect(html).toContain("Draft");
    expect(html).toContain('rel="canonical"');
    expect(html).toContain("/cards");
  });

  it("cardDetailPage noindexes drafts but indexes reviewed cards", () => {
    const base = {
      slug: "the-fool", name: "The Fool",
      image: "/static/cards/major-00.webp", image2x: "/static/cards/major-00@2x.webp",
      keywordsUpright: ["beginnings"], keywordsReversed: ["recklessness"],
      upright: "Go.", reversed: "Wait.",
      notes: [{ label: "Love", text: "New spark." }],
      prev: null, next: { slug: "the-magician", name: "The Magician" },
    };
    const draft = cardDetailPage({ ui: "en", origin: "https://tarotnice.com", streak: STREAK, card: { ...base, reviewed: false } });
    expect(draft).toContain("noindex");
    expect(draft).toContain("New spark.");
    expect(draft).toContain("/cards/the-magician");
    expect(draft).toContain("application/ld+json");
    const live = cardDetailPage({ ui: "en", origin: "https://tarotnice.com", streak: STREAK, card: { ...base, reviewed: true } });
    expect(live).not.toContain("noindex");
    expect(live).toContain('rel="canonical"');
  });
});

describe("spec milestones + badge shares (M2)", () => {
  it("renders streak-tier badges with share buttons only when achieved", () => {
    const html = progressPage({
      ui: "en", origin: "https://tarotnice.com",
      streak: { current: 5, longest: 9, activeToday: true },
      days: [], owned: [0], cardNames: { 0: "The Fool" },
      referrals: { invited: 0, converted: 0 }, bonusOn: false,
      milestones: [
        { key: "streak-3", label: "3-day streak", achieved: true },
        { key: "streak-14", label: "14-day streak", achieved: false },
        { key: "collection", label: "All 78 daily cards", achieved: false },
      ],
      readings: 3,
      recentDaily: [{ name: "The Fool", image: "/static/cards/major-00.webp", day: "2026-10-22" }],
    });
    expect(html).toContain('data-share-badge="streak-3"');
    expect(html).not.toContain('data-share-badge="streak-14"');
    expect(html).not.toContain('data-share-badge="collection"');
    expect(html).toContain("Recent daily cards");
    expect(html).toContain("/static/cards/major-00.webp");
  });

  it("badge landing renders label + CTA and 404s unknown ids at the route", async () => {
    const html = badgeLandingPage({
      origin: "https://tarotnice.com", shareId: "AbC123XyZ9", ui: "en",
      label: "7-day streak", ogImage: "https://tarotnice.com/b/AbC123XyZ9/og.png",
    });
    expect(html).toContain("7-day streak");
    expect(html).toContain("noindex");
    expect(html).toContain("/?ref=AbC123XyZ9");
    expect((await app.request("/b/ZZZZZZZZZZ")).status).toBe(410);
    expect((await app.request("/api/share", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "badge", ref: "streak-7" }),
    })).status).toBe(401);
  });
});

describe("Thai card URLs (M3)", () => {
  it("serves /th/cards in Thai with a /th canonical", async () => {
    const idx = await app.request("/th/cards");
    expect(idx.status).toBe(200);
    const idxHtml = await idx.text();
    expect(idxHtml).toContain('lang="th"');
    expect(idxHtml).toContain('rel="canonical" href="http://localhost/th/cards"');
    const page = cardsPage({
      ui: "th", origin: "https://tarotnice.com",
      streak: { current: 0, longest: 0, activeToday: false },
      groups: [{ title: "Major", cards: [{ id: 0, slug: "the-fool", name: "X", image: "/i.webp", image2x: "/i2.webp", reviewed: false }] }],
      prefix: "/th",
    });
    expect(page).toContain('href="/th/cards/the-fool"');
    // Without a DB the detail route 404s, same as /cards/:slug.
    expect((await app.request("/th/cards/nope-nope")).status).toBe(404);
  });

  it("sitemap carries both language trees", async () => {
    const xml = await (await app.request("/sitemap.xml")).text();
    expect(xml).toContain("/th/cards");
    expect(xml).toContain("/cards");
  });
});

describe("M8 route guards (no session)", () => {
  it("redirects signed-in areas to sign-in", async () => {
    for (const path of ["/history", "/history/abc", "/progress"]) {
      const res = await app.request(path, { redirect: "manual" });
      expect(res.status).toBe(302);
      expect(res.headers.get("location") ?? "").toContain("/sign-in?return=");
    }
  });

  it("requires auth for history APIs", async () => {
    expect((await app.request("/api/readings")).status).toBe(401);
    expect((await app.request("/api/readings/abc", { method: "DELETE" })).status).toBe(401);
    expect((await app.request("/api/readings/abc/journal", {
      method: "PUT", headers: { "content-type": "application/json" }, body: "{}",
    })).status).toBe(401);
  });

  it("serves the public library + sitemap without a session", async () => {
    const cards = await app.request("/cards");
    expect(cards.status).toBe(200);
    expect(await cards.text()).toContain("Card library");
    expect((await app.request("/cards/no-such-card")).status).toBe(404);
    const sitemap = await app.request("/sitemap.xml");
    expect(sitemap.status).toBe(200);
    const xml = await sitemap.text();
    expect(xml).toContain("/cards");
    expect(xml).not.toContain("/history");
    expect(xml).not.toContain("/progress");
  });
});
