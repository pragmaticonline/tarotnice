import { describe, expect, it } from "vitest";
import { t, type UiLang } from "../src/lib/i18n";
import { maskName } from "../src/lib/invite";
import { sessionReceipt, type CheckoutSession } from "../src/lib/stripe";
import { forgotPasswordPage, resetPasswordPage, signInPage } from "../src/routes/auth-pages";
import { billingCancelPage, billingSuccessPage, invitePage } from "../src/routes/billing";
import { termsPage } from "../src/routes/legal";
import { cardDetailPage, cardsPage, type LibraryDetail } from "../src/routes/library";
import { notFoundPage } from "../src/routes/shell";
import { shareLandingPage } from "../src/routes/share";

describe("maskName (invite privacy)", () => {
  it("keeps at most three characters and adds the mask", () => {
    expect(maskName("Pimchanok")).toBe("Pim•••");
    expect(maskName("Kan")).toBe("Kan•••");
    expect(maskName("  ")).toBeNull();
    expect(maskName(null)).toBeNull();
  });
});

describe("sessionReceipt (payment result + wallet receipts)", () => {
  it("reads amount, method and receipt URL from the expanded charge", () => {
    const session = {
      id: "cs_1",
      payment_status: "paid",
      amount_total: 19900,
      currency: "thb",
      customer_details: { email: "a@example.com" },
      payment_intent: {
        id: "pi_1",
        latest_charge: {
          receipt_url: "https://pay.stripe.com/receipts/r1",
          amount: 19900,
          currency: "thb",
          payment_method_details: { type: "promptpay" },
        },
      },
      metadata: { tokens: "200" },
    } as CheckoutSession;
    expect(sessionReceipt(session)).toEqual({
      amount: 19900,
      currency: "thb",
      paymentMethod: "promptpay",
      receiptUrl: "https://pay.stripe.com/receipts/r1",
      email: "a@example.com",
      paymentIntentId: "pi_1",
    });
  });

  it("degrades gracefully for an unexpanded session", () => {
    const receipt = sessionReceipt({ id: "cs_2", payment_intent: "pi_2" } as CheckoutSession);
    expect(receipt.paymentIntentId).toBe("pi_2");
    expect(receipt.receiptUrl).toBeNull();
  });
});

describe("auth boards", () => {
  it("sign-in is social-first with the guest-move line and LINE when configured", () => {
    const html = signInPage(null, "", "en", { google: true, line: true });
    expect(html).toContain("Readings you made as a guest on this device move into your account.");
    expect(html).toContain("Continue with LINE");
    expect(html).toContain("or use email");
    expect(html).toContain("Email or password is incorrect");
    expect(html.indexOf("Continue with Google")).toBeLessThan(html.indexOf('id="signin-form"'));
  });

  it("forgot password has the sent state with the 30-minute line", () => {
    const html = forgotPasswordPage("", "en");
    expect(html).toContain("Check your inbox");
    expect(html).toContain("It works for 30 minutes");
    expect(html).toContain("Send again");
  });

  it("reset with no token shows the expired panel up front", () => {
    const html = resetPasswordPage("", "", "en");
    expect(html).toContain("This link has expired. Send a new one.");
    expect(html).not.toContain('id="reset-form"');
  });

  it("reset with a token asks for confirmation and states the rule", () => {
    const html = resetPasswordPage("tok123", "", "en");
    expect(html).toContain("Confirm new password");
    expect(html).toContain("At least 8 characters. Mix letters and numbers.");
    expect(html).toContain("Passwords don't match.");
  });
});

describe("library boards", () => {
  it("index renders search, counted suit tabs and the empty state hook", () => {
    const html = cardsPage({
      ui: "en",
      origin: "",
      groups: [
        { title: "Major Arcana", key: "major", cards: [{ slug: "the-fool", name: "The Fool", image: "/x.webp", reviewed: true }] },
        { title: "Cups", key: "cups", cards: [{ slug: "ace-of-cups", name: "Ace of Cups", image: "/y.webp", reviewed: true }] },
      ],
      streak: { current: 0, longest: 0, activeToday: false },
    });
    expect(html).toContain('id="lib-search"');
    expect(html).toContain("Major Arcana 1");
    expect(html).toContain("Cups 1");
    expect(html).toContain('id="lib-empty"');
    expect(html).toContain("All 78 tarot cards");
  });

  it("detail has the eyebrow, orientation toggle and ask CTA", () => {
    const card: LibraryDetail = {
      slug: "the-fool",
      name: "The Fool",
      arcanaLabel: "MAJOR ARCANA · 0",
      image: "/x.webp",
      image2x: "/x2.webp",
      reviewed: true,
      upright: "New beginnings.",
      reversed: "Recklessness.",
      keywordsUpright: ["beginnings", "trust"],
      keywordsReversed: ["haste"],
      notes: [],
      prev: { slug: "the-world", name: "The World" },
      next: { slug: "the-magician", name: "The Magician" },
    };
    const html = cardDetailPage({ ui: "en", origin: "", card, streak: { current: 0, longest: 0, activeToday: false } });
    expect(html).toContain("MAJOR ARCANA · 0");
    expect(html).toContain('data-orient="reversed"');
    expect(html).toContain("kw-chip");
    expect(html).toContain("Drew this card? Ask Ngern");
    expect(html).toContain("/cards/the-world"); // wrap-around prev
  });
});

describe("share landing board", () => {
  it("names the owner, keeps the full reading private, and hides an unshared question", () => {
    const html = shareLandingPage({
      kind: "reading",
      origin: "https://tarotnice.com",
      shareId: "s1",
      ui: "en",
      cards: [{ id: 0, slug: "the-fool", name: "The Fool", image: "/f.webp", image2x: "/f2.webp", reversed: false }],
      summary: "A fresh start is forming.",
      question: null,
      ogImage: "/og.png",
      ownerName: "Maew",
    });
    expect(html).toContain("Maew shared a reading with you");
    expect(html).toContain("The full reading is private to Maew.");
    expect(html).toContain("At a glance");
    expect(html).toContain("Draw my cards");
    expect(html).not.toContain("blockquote");
  });
});

describe("terms board", () => {
  it("has tabs, the updated line, anchors and all six sections", () => {
    const html = termsPage("en");
    expect(html).toContain("Last updated 1 November 2026");
    expect(html).toContain("ON THIS PAGE");
    for (const id of ["what", "advice", "account", "tokens", "privacy", "contact"]) {
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`href="#${id}"`);
    }
    expect(html).toContain("Purchased tokens do not expire and are non-refundable except where the law requires.");
    expect(html).not.toContain("daily card plus 3 questions a day");
  });
});

describe("payment result boards", () => {
  it("success shows tokens added, balance, amount, method and receipt link", () => {
    const html = billingSuccessPage({
      ui: "en",
      origin: "",
      returnTo: "/",
      state: "verified",
      detail: {
        tokens: 200, balance: 225, amount: 19900, currency: "thb",
        paymentMethod: "promptpay", receiptUrl: "https://pay.stripe.com/receipts/r1", email: "a@example.com",
      },
    });
    expect(html).toContain("200 tokens added. Your balance is now 225");
    expect(html).toContain("PromptPay");
    expect(html).toContain("Receipt sent to a@example.com");
    expect(html).toContain("View receipt");
    expect(html).toContain("Continue my question");
  });

  it("cancel says no money was taken and the question is saved", () => {
    const html = billingCancelPage({ ui: "en", origin: "", returnTo: "/" });
    expect(html).toContain("No money was taken. Your question is still saved");
    expect(html).toContain("Try again");
    expect(html).toContain("Had a problem paying? Contact us");
  });
});

describe("invite + 404 boards", () => {
  it("invite page renders code, share actions and stat tiles", () => {
    const html = invitePage({ ui: "en", origin: "" });
    expect(html).toContain("Your friend gets a bonus question.");
    expect(html).toContain('id="stat-joined"');
    expect(html).toContain('id="stat-earned"');
    expect(html).toContain("Share on LINE");
    expect(html).toContain('href="/terms"');
  });

  it("invite board parity: purple hero card, share grid, 3-col stats, no Facebook", () => {
    for (const ui of ["en", "th"] as const) {
      const html = invitePage({ ui, origin: "" });
      expect(html).toContain("hero-card invite-hero");
      expect(html).toContain("share-grid");
      expect(html).toContain("btn-line");
      expect(html).toContain("btn-gold");
      expect(html).toContain("invite-stats-card");
      expect(html).toContain("stat-read");
      expect(html).toContain('id="invite-code"');
      expect(html).toContain('id="friend-list"');
      expect(html).not.toMatch(/facebook/i);
    }
  });

  it("404 page is the not-in-the-deck board with both CTAs", () => {
    const html = notFoundPage({ ui: "en", origin: "" });
    expect(html).toContain("This page is not in the deck");
    expect(html).toContain("ngern-sleeping.svg");
    expect(html).toContain("Ask a question");
    expect(html).toContain("Browse the cards");
  });
});

describe("tokens wording everywhere, never credits", () => {
  const langs: UiLang[] = ["en", "th"];
  const card: LibraryDetail = {
    slug: "the-fool",
    name: "The Fool",
    arcanaLabel: "MAJOR ARCANA · 0",
    image: "/x.webp",
    image2x: "/x2.webp",
    reviewed: true,
    upright: "New beginnings.",
    reversed: "Recklessness.",
    keywordsUpright: ["beginnings"],
    keywordsReversed: ["haste"],
    notes: [],
    prev: { slug: "the-world", name: "The World" },
    next: { slug: "the-magician", name: "The Magician" },
  };
  const groups = [
    { title: "Major Arcana", key: "major", cards: [{ slug: "the-fool", name: "The Fool", image: "/x.webp", reviewed: true }] },
    { title: "Cups", key: "cups", cards: [{ slug: "ace-of-cups", name: "Ace of Cups", image: "/y.webp", reviewed: true }] },
  ];

  for (const ui of langs) {
    it(`no credits wording on any board (${ui})`, () => {
      const pages = [
        signInPage(null, "", ui, { google: true, line: true }),
        forgotPasswordPage("", ui),
        resetPasswordPage("", "", ui),
        cardsPage({ ui, origin: "", groups, streak: { current: 0, longest: 0, activeToday: false } }),
        cardDetailPage({ ui, origin: "", card, streak: { current: 0, longest: 0, activeToday: false } }),
        shareLandingPage({
          kind: "reading",
          origin: "https://tarotnice.com",
          shareId: "s1",
          ui,
          cards: [{ id: 0, slug: "the-fool", name: "The Fool", image: "/f.webp", image2x: "/f2.webp", reversed: false }],
          summary: "A fresh start is forming.",
          question: null,
          ogImage: "/og.png",
          ownerName: "Maew",
        }),
        termsPage(ui),
        billingSuccessPage({
          ui,
          origin: "",
          returnTo: "/",
          state: "verified",
          detail: {
            tokens: 200, balance: 225, amount: 19900, currency: "thb",
            paymentMethod: "promptpay", receiptUrl: "https://pay.stripe.com/receipts/r1", email: "a@example.com",
          },
        }),
        billingCancelPage({ ui, origin: "", returnTo: "/" }),
        invitePage({ ui, origin: "" }),
        notFoundPage({ ui, origin: "" }),
      ];
      for (const html of pages) {
        expect(html).not.toMatch(/credit/i);
        // Thai loanword for "credit", escaped like all TH copy.
        expect(html).not.toContain("\u0e40\u0e04\u0e23\u0e40\u0e14\u0e34\u0e15");
      }
    });
  }

  it("billing invite tab uses the board copy: +5 tokens per first reading", () => {
    expect(t("en").inviteSub).toBe(
      "Your friend gets a bonus question. You get +5 tokens when they finish their first reading.",
    );
    expect(t("th").inviteSub).toContain("+5 \u0e42\u0e17\u0e40\u0e04\u0e19");
  });
});
