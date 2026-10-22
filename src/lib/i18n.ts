// Interface (UI) localization: Thai (default) and English only.
// A visitor's country picks the default (Thailand -> Thai); the
// \u0e44\u0e17\u0e22/EN switcher overrides it and is remembered in the nl_ui cookie.
// NOTE: Thai strings are stored as \uXXXX escapes (see scripts);
// never commit raw Thai or Han script in code.
import { COUNTRY_TO_LANG } from "./geo";

export type UiLang = "en" | "th";

export const UI_LANGS: { code: UiLang; name: string; ownName: string; flag: string }[] = [
  { code: "en", name: "English", ownName: "English", flag: "\U0001f1ec\U0001f1e7" },
  { code: "th", name: "Thai", ownName: "\u0e44\u0e17\u0e22", flag: "\U0001f1f9\U0001f1ed" },
];

export function isUiLang(code: string | null | undefined): code is UiLang {
  return !!code && UI_LANGS.some((l) => l.code === code);
}

/** UI language for a request: cookie choice first, then the country
 *  default (Thailand -> Thai), then English. */
export function uiLangFor(input: {
  cookie?: string | null;
  country?: string | null;
}): UiLang {
  if (isUiLang(input.cookie)) return input.cookie;
  const byCountry = input.country ? COUNTRY_TO_LANG[input.country.toUpperCase()] : undefined;
  if (isUiLang(byCountry)) return byCountry;
  return "en";
}

export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

const en = {
  brandName: "TarotNice",
  tagline: "Free tarot readings, every day.",
  homeTitle: "Free tarot readings",
  homeLede: "Draw your daily card, ask a question, and let Ngern read the cards for you.",
  signIn: "Sign in", account: "Account", signOut: "Sign out",
  interfaceLanguage: "Interface language", appLanguage: "App language",
  terms: "Terms", privacy: "Privacy", contact: "Contact",
  dayStreak: "{n}-day streak",
  ask: "What would you like to ask today?",
  placeholder: "e.g. How will the new job I'm starting go?",
  topicLove: "Love", topicCareer: "Career", topicMoney: "Money", topicHealth: "Health", topicGeneral: "General",
  shuffle: "Shuffle",
  hintIdle: "Hi, I'm Ngern. Type your question, pick a topic, then tap Shuffle.",
  hintNeed: "Type your question first, then shuffle.",
  hintShuffling: "Shuffling\u2026",
  hintPick: "Choose {n} more card(s)",
  hintReveal: "Turning the cards\u2026",
  hintDone: "Here is your reading",
  hintSleep: "Ngern is resting now. New questions tomorrow.",
  quota: "{n} of 3 questions left today",
  upright: "Upright", reversed: "Reversed",
  again: "Ask again",
  share: "Share",
  shareTitle: "Share your reading",
  shareShowQ: "Show my question",
  sharePrivate: "Question kept private",
  shareCta: "Free tarot reading",
  shareText: "Here are my tarot cards today. Get a free reading at TarotNice",
  themeDay: "Day", themeNight: "Night",
  footerLine: "For reflection and entertainment.",
  createAccountHeading: "Create your free account",
  nameLabel: "Name", emailLabel: "Email", passwordLabel: "Password",
  createAccountBtn: "Create free account", alreadyRegistered: "Already registered?",
  signInHeading: "Sign in", welcomeBack: "Welcome back.",
  forgotPassword: "Forgot your password?", newToTarotNice: "New to TarotNice?",
  yourAccount: "Your account",
  guestLine: "You are browsing as a guest. Create a free account to save your readings.",
  signedInAs: "Signed in as {email}.",
  backToHome: "Back home",
  continueWithGoogle: "Continue with Google",
  saveReadingsLine: "Save your readings on any phone: sign in with Google",
  historyTitle: "History", yourReading: "Your reading",
  journalLabel: "My notes", journalSave: "Save", journalSaved: "Saved",
  deleteReading: "Delete", deleteConfirm: "Delete this reading?",
  loadMore: "Load more",
  emptyHistory: "No readings yet \u2014 draw your first cards.",
  progressTitle: "Progress", streakTitle: "Streak",
  calendarTitle: "Last 14 days", bestTitle: "Personal best",
  collectionTitle: "Card collection", referralTitle: "Invite friends",
  milestonesTitle: "Milestones",
  freezeNote: "One missed day a week keeps the streak alive.",
  msFirst: "First reading", msStreak7: "7-day streak",
  msReadings10: "10 readings", msAllTopics: "All 5 topics",
  msDaily7: "7 daily cards", msSharer: "First share",
  msStreakDays: "{n}-day streak",
  msCollection: "All 78 daily cards",
  recentDailyTitle: "Recent daily cards",
  badgeEarned: "Milestone earned on TarotNice",
  shareBadge: "Share",
  referralLine: "{invited} friends joined, {converted} drew a reading.",
  referralBonusOn: "Bonus on: each conversion adds a question today (max +3).",
  referralBonusOff: "Referral bonuses are off for now.",
  cardsTitle: "Card library", cardsLede: "All 78 cards and their meanings.",
  majorArcana: "Major Arcana",
  suitWands: "Wands", suitCups: "Cups", suitSwords: "Swords", suitPentacles: "Pentacles",
  draftNote: "Draft \u2014 under review.",
  prevCard: "Previous", nextCard: "Next",
  accountPrefs: "Preferences", nicknameLabel: "Nickname",
  themeLabel: "Theme", themeAuto: "Auto", savePrefs: "Save preferences",
  prefsSaved: "Saved.", deleteData: "Delete my data",
  deleteDataConfirm: "Delete your account and all readings? This cannot be undone.",
  deleteDataDone: "Deleted. See you again sometime.",
};

export type UiDict = typeof en;

const th: UiDict = {
  brandName: "TarotNice",
  tagline: "\u0e14\u0e39\u0e14\u0e27\u0e07\u0e44\u0e1e\u0e48\u0e17\u0e32\u0e42\u0e23\u0e15\u0e4c\u0e1f\u0e23\u0e35\u0e17\u0e38\u0e01\u0e27\u0e31\u0e19",
  homeTitle: "\u0e14\u0e39\u0e14\u0e27\u0e07\u0e44\u0e1e\u0e48\u0e17\u0e32\u0e42\u0e23\u0e15\u0e4c\u0e1f\u0e23\u0e35",
  homeLede: "\u0e08\u0e31\u0e48\u0e27\u0e44\u0e1e\u0e48\u0e1b\u0e23\u0e30\u0e08\u0e33\u0e27\u0e31\u0e19 \u0e16\u0e32\u0e21\u0e04\u0e33\u0e16\u0e32\u0e21 \u0e41\u0e25\u0e49\u0e27\u0e43\u0e2b\u0e49\u0e40\u0e07\u0e34\u0e19\u0e0a\u0e48\u0e27\u0e22\u0e2d\u0e48\u0e32\u0e19\u0e44\u0e1e\u0e48\u0e43\u0e2b\u0e49\u0e04\u0e38\u0e13",
  signIn: "\u0e40\u0e02\u0e49\u0e32\u0e2a\u0e39\u0e48\u0e23\u0e30\u0e1a\u0e1a", account: "\u0e1a\u0e31\u0e0d\u0e0a\u0e35", signOut: "\u0e2d\u0e2d\u0e01\u0e08\u0e32\u0e01\u0e23\u0e30\u0e1a\u0e1a",
  interfaceLanguage: "\u0e20\u0e32\u0e29\u0e32\u0e2b\u0e19\u0e49\u0e32\u0e08\u0e2d", appLanguage: "\u0e20\u0e32\u0e29\u0e32\u0e02\u0e2d\u0e07\u0e41\u0e2d\u0e1b",
  terms: "\u0e02\u0e49\u0e2d\u0e01\u0e33\u0e2b\u0e19\u0e14\u0e01\u0e32\u0e23\u0e43\u0e0a\u0e49\u0e07\u0e32\u0e19", privacy: "\u0e19\u0e42\u0e22\u0e1a\u0e32\u0e22\u0e04\u0e27\u0e32\u0e21\u0e40\u0e1b\u0e47\u0e19\u0e2a\u0e48\u0e27\u0e19\u0e15\u0e31\u0e27", contact: "\u0e15\u0e34\u0e14\u0e15\u0e48\u0e2d\u0e40\u0e23\u0e32",
  dayStreak: "\u0e15\u0e48\u0e2d\u0e40\u0e19\u0e37\u0e48\u0e2d\u0e07 {n} \u0e27\u0e31\u0e19",
  ask: "\u0e2d\u0e22\u0e32\u0e01\u0e16\u0e32\u0e21\u0e2d\u0e30\u0e44\u0e23\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49?",
  placeholder: "\u0e40\u0e0a\u0e48\u0e19 \u0e07\u0e32\u0e19\u0e43\u0e2b\u0e21\u0e48\u0e17\u0e35\u0e48\u0e01\u0e33\u0e25\u0e31\u0e07\u0e08\u0e30\u0e40\u0e23\u0e34\u0e48\u0e21 \u0e08\u0e30\u0e40\u0e1b\u0e47\u0e19\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e44\u0e23?",
  topicLove: "\u0e04\u0e27\u0e32\u0e21\u0e23\u0e31\u0e01", topicCareer: "\u0e01\u0e32\u0e23\u0e07\u0e32\u0e19", topicMoney: "\u0e01\u0e32\u0e23\u0e40\u0e07\u0e34\u0e19", topicHealth: "\u0e2a\u0e38\u0e02\u0e20\u0e32\u0e1e", topicGeneral: "\u0e17\u0e31\u0e48\u0e27\u0e44\u0e1b",
  shuffle: "\u0e2a\u0e31\u0e1a\u0e44\u0e1e\u0e48",
  hintIdle: "\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35 \u0e40\u0e23\u0e32\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e07\u0e34\u0e19 \u0e1e\u0e34\u0e21\u0e1e\u0e4c\u0e04\u0e33\u0e16\u0e32\u0e21 \u0e40\u0e25\u0e37\u0e2d\u0e01\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07 \u0e41\u0e25\u0e49\u0e27\u0e41\u0e15\u0e30 \u201c\u0e2a\u0e31\u0e1a\u0e44\u0e1e\u0e48\u201d",
  hintNeed: "\u0e1e\u0e34\u0e21\u0e1e\u0e4c\u0e04\u0e33\u0e16\u0e32\u0e21\u0e01\u0e48\u0e2d\u0e19\u0e19\u0e30 \u0e41\u0e25\u0e49\u0e27\u0e04\u0e48\u0e2d\u0e22\u0e2a\u0e31\u0e1a\u0e44\u0e1e\u0e48",
  hintShuffling: "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e2a\u0e31\u0e1a\u0e44\u0e1e\u0e48\u2026",
  hintPick: "\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e44\u0e1e\u0e48\u0e2d\u0e35\u0e01 {n} \u0e43\u0e1a",
  hintReveal: "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e40\u0e1b\u0e34\u0e14\u0e44\u0e1e\u0e48\u2026",
  hintDone: "\u0e19\u0e35\u0e48\u0e04\u0e37\u0e2d\u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13",
  hintSleep: "\u0e40\u0e07\u0e34\u0e19\u0e02\u0e2d\u0e1e\u0e31\u0e01\u0e01\u0e48\u0e2d\u0e19\u0e19\u0e30 \u0e04\u0e33\u0e16\u0e32\u0e21\u0e43\u0e2b\u0e21\u0e48\u0e1e\u0e23\u0e38\u0e48\u0e07\u0e19\u0e35\u0e49",
  quota: "\u0e40\u0e2b\u0e25\u0e37\u0e2d {n}/3 \u0e04\u0e33\u0e16\u0e32\u0e21\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49",
  upright: "\u0e44\u0e1e\u0e48\u0e15\u0e31\u0e49\u0e07", reversed: "\u0e44\u0e1e\u0e48\u0e01\u0e25\u0e31\u0e1a\u0e2b\u0e31\u0e27",
  again: "\u0e16\u0e32\u0e21\u0e43\u0e2b\u0e21\u0e48",
  share: "\u0e41\u0e0a\u0e23\u0e4c\u0e14\u0e27\u0e07",
  shareTitle: "\u0e41\u0e0a\u0e23\u0e4c\u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22",
  shareShowQ: "\u0e41\u0e2a\u0e14\u0e07\u0e04\u0e33\u0e16\u0e32\u0e21\u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19",
  sharePrivate: "\u0e04\u0e33\u0e16\u0e32\u0e21\u0e16\u0e39\u0e01\u0e0b\u0e48\u0e2d\u0e19\u0e44\u0e27\u0e49",
  shareCta: "\u0e14\u0e39\u0e14\u0e27\u0e07\u0e44\u0e1e\u0e48\u0e17\u0e32\u0e42\u0e23\u0e15\u0e4c\u0e1f\u0e23\u0e35",
  shareText: "\u0e14\u0e39\u0e44\u0e1e\u0e48\u0e17\u0e32\u0e42\u0e23\u0e15\u0e4c\u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49 \u0e25\u0e2d\u0e07\u0e14\u0e39\u0e14\u0e27\u0e07\u0e1f\u0e23\u0e35\u0e17\u0e35\u0e48 TarotNice",
  themeDay: "\u0e01\u0e25\u0e32\u0e07\u0e27\u0e31\u0e19", themeNight: "\u0e01\u0e25\u0e32\u0e07\u0e04\u0e37\u0e19",
  footerLine: "\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e1a\u0e31\u0e19\u0e40\u0e17\u0e34\u0e07\u0e41\u0e25\u0e30\u0e01\u0e32\u0e23\u0e17\u0e1a\u0e17\u0e27\u0e19\u0e15\u0e19\u0e40\u0e2d\u0e07",
  createAccountHeading: "\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e1f\u0e23\u0e35",
  nameLabel: "\u0e0a\u0e37\u0e48\u0e2d", emailLabel: "\u0e2d\u0e35\u0e40\u0e21\u0e25", passwordLabel: "\u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19",
  createAccountBtn: "\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e1f\u0e23\u0e35", alreadyRegistered: "\u0e21\u0e35\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e41\u0e25\u0e49\u0e27\u0e43\u0e0a\u0e48\u0e44\u0e2b\u0e21?",
  signInHeading: "\u0e40\u0e02\u0e49\u0e32\u0e2a\u0e39\u0e48\u0e23\u0e30\u0e1a\u0e1a", welcomeBack: "\u0e22\u0e34\u0e19\u0e14\u0e35\u0e15\u0e49\u0e2d\u0e19\u0e23\u0e31\u0e1a\u0e01\u0e25\u0e31\u0e1a\u0e21\u0e32",
  forgotPassword: "\u0e25\u0e37\u0e21\u0e23\u0e2b\u0e31\u0e2a\u0e1c\u0e48\u0e32\u0e19?", newToTarotNice: "\u0e43\u0e2b\u0e21\u0e48\u0e01\u0e31\u0e1a TarotNice?",
  yourAccount: "\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13",
  guestLine: "\u0e04\u0e38\u0e13\u0e01\u0e33\u0e25\u0e31\u0e07\u0e43\u0e0a\u0e49\u0e07\u0e32\u0e19\u0e41\u0e1a\u0e1a\u0e1c\u0e39\u0e49\u0e40\u0e22\u0e35\u0e48\u0e22\u0e21\u0e0a\u0e21 \u0e2a\u0e23\u0e49\u0e32\u0e07\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e1f\u0e23\u0e35\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13",
  signedInAs: "\u0e40\u0e02\u0e49\u0e32\u0e2a\u0e39\u0e48\u0e23\u0e30\u0e1a\u0e1a\u0e43\u0e19\u0e0a\u0e37\u0e48\u0e2d {email}",
  backToHome: "\u0e01\u0e25\u0e31\u0e1a\u0e2b\u0e19\u0e49\u0e32\u0e41\u0e23\u0e01",
  continueWithGoogle: "\u0e14\u0e33\u0e40\u0e19\u0e34\u0e19\u0e01\u0e32\u0e23\u0e15\u0e48\u0e2d\u0e14\u0e49\u0e27\u0e22 Google",
  saveReadingsLine: "\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e44\u0e27\u0e49\u0e17\u0e38\u0e01\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07: \u0e40\u0e02\u0e49\u0e32\u0e2a\u0e39\u0e48\u0e23\u0e30\u0e1a\u0e1a\u0e14\u0e49\u0e27\u0e22 Google",
  historyTitle: "\u0e1b\u0e23\u0e30\u0e27\u0e31\u0e15\u0e34", yourReading: "\u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13",
  journalLabel: "\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19", journalSave: "\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01", journalSaved: "\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e41\u0e25\u0e49\u0e27",
  deleteReading: "\u0e25\u0e1a", deleteConfirm: "\u0e25\u0e1a\u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22\u0e19\u0e35\u0e49?",
  loadMore: "\u0e14\u0e39\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e40\u0e15\u0e34\u0e21",
  emptyHistory: "\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22 \u0e08\u0e31\u0e48\u0e27\u0e44\u0e1e\u0e48\u0e41\u0e23\u0e01\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e40\u0e25\u0e22",
  progressTitle: "\u0e04\u0e27\u0e32\u0e21\u0e01\u0e49\u0e32\u0e27\u0e2b\u0e19\u0e49\u0e32", streakTitle: "\u0e2a\u0e15\u0e23\u0e35\u0e04",
  calendarTitle: "14 \u0e27\u0e31\u0e19\u0e25\u0e48\u0e32\u0e2a\u0e38\u0e14", bestTitle: "\u0e14\u0e35\u0e17\u0e35\u0e48\u0e2a\u0e38\u0e14",
  collectionTitle: "\u0e04\u0e2d\u0e25\u0e40\u0e25\u0e01\u0e0a\u0e31\u0e19\u0e44\u0e1e\u0e48", referralTitle: "\u0e0a\u0e27\u0e19\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e19",
  milestonesTitle: "\u0e40\u0e2b\u0e15\u0e38\u0e01\u0e32\u0e23\u0e13\u0e4c\u0e2a\u0e33\u0e04\u0e31\u0e0d",
  freezeNote: "\u0e02\u0e32\u0e14\u0e44\u0e14\u0e49 1 \u0e27\u0e31\u0e19\u0e15\u0e48\u0e2d\u0e2a\u0e31\u0e1b\u0e14\u0e32\u0e2b\u0e4c\u0e42\u0e14\u0e22\u0e2a\u0e15\u0e23\u0e35\u0e04\u0e44\u0e21\u0e48\u0e2b\u0e25\u0e38\u0e14",
  msFirst: "\u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22\u0e41\u0e23\u0e01", msStreak7: "\u0e2a\u0e15\u0e23\u0e35\u0e04 7 \u0e27\u0e31\u0e19",
  msReadings10: "\u0e2d\u0e48\u0e32\u0e19\u0e44\u0e1e\u0e48 10 \u0e04\u0e23\u0e31\u0e49\u0e07", msAllTopics: "\u0e04\u0e23\u0e1a 5 \u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d",
  msDaily7: "\u0e44\u0e1e\u0e48\u0e1b\u0e23\u0e30\u0e08\u0e33\u0e27\u0e31\u0e19 7 \u0e27\u0e31\u0e19", msSharer: "\u0e41\u0e0a\u0e23\u0e4c\u0e04\u0e23\u0e31\u0e49\u0e07\u0e41\u0e23\u0e01",
  msStreakDays: "\u0e2a\u0e15\u0e23\u0e35\u0e04 {n} \u0e27\u0e31\u0e19",
  msCollection: "\u0e44\u0e1e\u0e48\u0e1b\u0e23\u0e30\u0e08\u0e33\u0e27\u0e31\u0e19\u0e04\u0e23\u0e1a\u0e17\u0e31\u0e49\u0e07 78 \u0e43\u0e1a",
  recentDailyTitle: "\u0e44\u0e1e\u0e48\u0e23\u0e32\u0e22\u0e27\u0e31\u0e19\u0e25\u0e48\u0e32\u0e2a\u0e38\u0e14",
  badgeEarned: "\u0e23\u0e32\u0e07\u0e27\u0e31\u0e25\u0e17\u0e35\u0e48\u0e44\u0e14\u0e49\u0e08\u0e32\u0e01 TarotNice",
  shareBadge: "\u0e41\u0e0a\u0e23\u0e4c",
  referralLine: "\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e19\u0e40\u0e02\u0e49\u0e32\u0e23\u0e48\u0e27\u0e21 {invited} \u0e04\u0e19 \u0e21\u0e35 {converted} \u0e04\u0e19\u0e14\u0e39\u0e14\u0e27\u0e07\u0e41\u0e25\u0e49\u0e27",
  referralBonusOn: "\u0e42\u0e1a\u0e19\u0e31\u0e2a\u0e40\u0e1b\u0e34\u0e14\u0e2d\u0e22\u0e39\u0e48: \u0e17\u0e38\u0e01\u0e04\u0e19\u0e17\u0e35\u0e48\u0e14\u0e39\u0e14\u0e27\u0e07\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e04\u0e33\u0e16\u0e32\u0e21\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49\u0e43\u0e2b\u0e49\u0e04\u0e38\u0e13 (\u0e2a\u0e39\u0e07\u0e2a\u0e38\u0e14 +3)",
  referralBonusOff: "\u0e42\u0e1a\u0e19\u0e31\u0e2a\u0e0a\u0e27\u0e19\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e19\u0e1b\u0e34\u0e14\u0e2d\u0e22\u0e39\u0e48\u0e15\u0e2d\u0e19\u0e19\u0e35\u0e49",
  cardsTitle: "\u0e2b\u0e49\u0e2d\u0e07\u0e2a\u0e21\u0e38\u0e14\u0e44\u0e1e\u0e48", cardsLede: "\u0e44\u0e1e\u0e48\u0e17\u0e31\u0e49\u0e07 78 \u0e43\u0e1a\u0e41\u0e25\u0e30\u0e04\u0e27\u0e32\u0e21\u0e2b\u0e21\u0e32\u0e22",
  majorArcana: "\u0e40\u0e21\u0e40\u0e08\u0e2d\u0e23\u0e4c\u0e2d\u0e32\u0e23\u0e4c\u0e04\u0e32\u0e19\u0e32",
  suitWands: "\u0e44\u0e21\u0e49\u0e40\u0e17\u0e49\u0e32", suitCups: "\u0e16\u0e49\u0e27\u0e22", suitSwords: "\u0e14\u0e32\u0e1a", suitPentacles: "\u0e40\u0e2b\u0e23\u0e35\u0e22\u0e0d",
  draftNote: "\u0e09\u0e1a\u0e31\u0e1a\u0e23\u0e48\u0e32\u0e07 \u0e2d\u0e22\u0e39\u0e48\u0e23\u0e30\u0e2b\u0e27\u0e48\u0e32\u0e07\u0e15\u0e23\u0e27\u0e08",
  prevCard: "\u0e01\u0e48\u0e2d\u0e19\u0e2b\u0e19\u0e49\u0e32", nextCard: "\u0e16\u0e31\u0e14\u0e44\u0e1b",
  accountPrefs: "\u0e01\u0e32\u0e23\u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32", nicknameLabel: "\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e25\u0e48\u0e19",
  themeLabel: "\u0e18\u0e35\u0e21", themeAuto: "\u0e2d\u0e31\u0e15\u0e42\u0e19\u0e21\u0e31\u0e15\u0e34", savePrefs: "\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e01\u0e32\u0e23\u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32",
  prefsSaved: "\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e41\u0e25\u0e49\u0e27", deleteData: "\u0e25\u0e1a\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19",
  deleteDataConfirm: "\u0e25\u0e1a\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e41\u0e25\u0e30\u0e04\u0e33\u0e17\u0e33\u0e19\u0e32\u0e22\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14? \u0e22\u0e49\u0e2d\u0e19\u0e01\u0e25\u0e31\u0e1a\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49",
  deleteDataDone: "\u0e25\u0e1a\u0e41\u0e25\u0e49\u0e27 \u0e44\u0e27\u0e49\u0e40\u0e08\u0e2d\u0e01\u0e31\u0e19\u0e43\u0e2b\u0e21\u0e48",
};

export function t(lang: UiLang): UiDict {
  return lang === "th" ? th : en;
}
