import { Script } from "node:vm";
import { describe, expect, it } from "vitest";
import { homePage } from "../src/routes/home";
import { cardsPage, cardDetailPage } from "../src/routes/library";
import { historyPage, historyDetailPage } from "../src/routes/history";
import { progressPage } from "../src/routes/progress";
import { shareLandingPage, unsharedPage } from "../src/routes/share";
import { contactPage, privacyPage, termsPage } from "../src/routes/legal";
import {
  accountPage,
  forgotPasswordPage,
  registerPage,
  resetPasswordPage,
  signInPage,
} from "../src/routes/auth-pages";

// Every inline <script> in every rendered page must parse. A single
// unbalanced brace once killed home.js and later the SW registration;
// neither tsc nor the leak gate can see inside template literals.
function inlineScripts(html: string): string[] {
  const out: string[] = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    if (/\bsrc=/.test(attrs)) continue;
    // JSON-LD and friends are data, not code.
    const type = /type="([^"]*)"/.exec(attrs)?.[1];
    if (type && !/javascript|module/.test(type)) continue;
    const body = m[2].trim();
    if (body) out.push(body);
  }
  return out;
}

const STREAK = { current: 2, longest: 5, activeToday: true };
const PAGES: Record<string, string> = {
  home: homePage({ origin: "https://tarotnice.com", uiLang: "en" }),
  cards: cardsPage({ ui: "en", origin: "https://tarotnice.com", streak: STREAK, groups: [] }),
  cardDetail: cardDetailPage({
    ui: "en", origin: "https://tarotnice.com", streak: STREAK,
    card: {
      slug: "the-fool", name: "The Fool", image: "/x.webp", image2x: "/x2.webp",
      reviewed: false, keywordsUpright: ["a"], keywordsReversed: ["b"],
      upright: "U", reversed: "R", notes: [], prev: null, next: null,
    },
  }),
  history: historyPage({ ui: "en", origin: "https://tarotnice.com", streak: STREAK, items: [], nextCursor: null }),
  historyDetail: historyDetailPage({
    ui: "en", origin: "https://tarotnice.com", streak: STREAK,
    reading: { id: "r1", topicLabel: "Love", question: "Q?", cards: [], aiText: "T", journal: null, status: "complete" },
  }),
  progress: progressPage({
    ui: "en", origin: "https://tarotnice.com", streak: STREAK,
    days: [], owned: [], cardNames: {}, referrals: { invited: 0, converted: 0 },
    bonusOn: false, milestones: [], readings: 0,
  }),
  shareLanding: shareLandingPage({
    kind: "reading", origin: "https://tarotnice.com", shareId: "AbC123XyZ9", ui: "en",
    cards: [], summary: "S", question: null, ogImage: "https://tarotnice.com/og.png",
  }),
  unshared: unsharedPage("https://tarotnice.com", "en"),
  terms: termsPage("en"),
  privacy: privacyPage("en"),
  contact: contactPage("en"),
  register: registerPage(undefined, "https://tarotnice.com", "en"),
  signIn: signInPage(undefined, "https://tarotnice.com", "en"),
  forgot: forgotPasswordPage("https://tarotnice.com", "en"),
  reset: resetPasswordPage("tok", "https://tarotnice.com", "en"),
  account: accountPage("https://tarotnice.com", "a@b.c", "en"),
};

describe("inline scripts parse", () => {
  it("finds inline scripts to check", () => {
    const total = Object.values(PAGES).reduce((n, html) => n + inlineScripts(html).length, 0);
    expect(total).toBeGreaterThan(10);
  });

  for (const [name, html] of Object.entries(PAGES)) {
    it(`${name}: every inline script compiles`, () => {
      for (const body of inlineScripts(html)) {
        expect(() => new Script(body), body.slice(0, 80)).not.toThrow();
      }
    });
  }

  it("registers the service worker from the shell", () => {
    expect(PAGES.home).toContain('serviceWorker.register("/sw.js")');
  });
});
