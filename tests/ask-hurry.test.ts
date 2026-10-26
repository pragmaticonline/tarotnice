import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Tapping the idle home cat nudges a slow starter ("Take your time —
// but the cards are waiting") and yields back to the idle hint. Gated
// on s-idle so working/shuffling states keep their bubble text.
const ASK_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/app/ask.js",
);

const IDLE = "idle-hint";
const HURRY = "Take your time \u2014 but the cards are waiting. Type your question below!";

function makeEl(extra: Record<string, unknown> = {}) {
  const noop = () => {};
  const el: Record<string, unknown> = {
    innerHTML: "",
    textContent: "",
    className: "",
    dataset: {},
    style: {},
    disabled: false,
    hidden: false,
    value: "",
    classList: {
      add: noop,
      remove: noop,
      toggle: noop,
      contains: () => false,
    },
    addEventListener: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    ...extra,
  };
  return el;
}

function loadIdle() {
  const guideAskBubble = { textContent: IDLE };
  const added: string[] = [];
  const guideAsk = makeEl({
    className: "guide guide-ask s-idle",
    classList: {
      add: (c: string) => {
        added.push(c);
      },
      remove: () => {},
      contains: (c: string) => c === "s-idle",
    },
    querySelector: () => guideAskBubble,
  });
  const clicks: Record<string, ((e: unknown) => void)[]> = {};
  const wrap = makeEl({
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      (clicks[type] = clicks[type] || []).push(fn);
    },
    closest: (sel: string) => (sel === "#guide-ask" ? guideAsk : null),
  });
  const form = makeEl({
    addEventListener: noopSafe(),
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  const sandbox: Record<string, unknown> = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    history: { pushState: () => {}, back: () => {} },
    location: { search: "" },
    document: {
      readyState: "complete",
      documentElement: { lang: "en" },
      querySelector: (sel: string) => {
        if (sel === "#guide-ask .bubble") return guideAskBubble;
        if (sel === '[data-step="1"]') return makeEl({ hidden: false });
        return null;
      },
      querySelectorAll: (sel: string) => (sel.includes("ngern-wrap") ? [wrap] : []),
      getElementById: (id: string) => (id === "ask-form" ? form : null),
      addEventListener: () => {},
      createElement: () => makeEl(),
    },
    window: {
      TarotDraw: {},
      TarotHome: { refresh: () => {}, data: null },
      addEventListener: () => {},
    },
  };
  function noopSafe(): (type: string, fn: (e: unknown) => void) => void {
    return () => {};
  }
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(ASK_PATH, "utf8"), sandbox, {
    filename: "ask.js",
  });
  return { guideAskBubble, clicks, added };
}

describe("idle cat nudge", () => {
  it(
    "shows a hurry-up on tap, then restores the idle hint",
    async () => {
      const { guideAskBubble, clicks, added } = loadIdle();
      expect(clicks["click"]?.length ?? 0).toBeGreaterThan(0);
      for (const fn of clicks["click"]) fn({});
      expect(guideAskBubble.textContent).toBe(HURRY);
      expect(added).toContain("s-nudge");
      await new Promise((r) => setTimeout(r, 2800));
      expect(guideAskBubble.textContent).toBe(IDLE);
    },
    15000,
  );
});
