import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Every 5 idle minutes a mouse dashes across the home guide and
// Ngern's pupils glance after it: look toward entry, track across,
// release at the end while the mouse element is cleaned up.
const ASK_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/app/ask.js",
);

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
    setAttribute: noop,
    remove: noop,
    appendChild: noop,
    ...extra,
  };
  return el;
}

function loadWithMouse() {
  const pupils = [makeEl(), makeEl()];
  const appended: Record<string, unknown>[] = [];
  const guideAsk = makeEl({
    className: "guide guide-ask s-idle",
    classList: {
      add: () => {},
      remove: () => {},
      toggle: () => {},
      contains: (c: string) => c === "s-idle",
    },
    querySelector: () => null,
    querySelectorAll: (sel: string) => (sel === ".pupil" ? pupils : []),
    appendChild: (c: Record<string, unknown>) => {
      appended.push(c);
      return c;
    },
  });
  const timers: ((...a: unknown[]) => void)[] = [];
  const form = makeEl({
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  const sandbox: Record<string, unknown> = {
    console,
    setTimeout,
    clearTimeout,
    setInterval: (fn: (...a: unknown[]) => void) => {
      timers.push(fn);
      return timers.length;
    },
    clearInterval: () => {},
    history: { pushState: () => {}, back: () => {} },
    location: { search: "" },
    document: {
      readyState: "complete",
      documentElement: { lang: "en" },
      querySelector: (sel: string) => {
        if (sel === "#guide-ask .bubble") return makeEl();
        if (sel === '[data-step="1"]') return makeEl({ hidden: false });
        return null;
      },
      querySelectorAll: (sel: string) => (sel.includes("ngern-wrap") ? [makeEl()] : []),
      getElementById: (id: string) => {
        if (id === "ask-form") return form;
        if (id === "guide-ask") return guideAsk;
        return null;
      },
      addEventListener: () => {},
      createElement: () => makeEl(),
    },
    window: {
      TarotDraw: {},
      TarotHome: { refresh: () => {}, data: null },
      addEventListener: () => {},
      matchMedia: () => ({ matches: false }),
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(ASK_PATH, "utf8"), sandbox, {
    filename: "ask.js",
  });
  return { timers, pupils, appended };
}

describe("idle mouse run", () => {
  it(
    "dashes a mouse across and glances after it, then cleans up",
    async () => {
      const { timers, pupils, appended } = loadWithMouse();
      expect(timers.length).toBeGreaterThan(0);
      for (const fn of timers) fn();
      const mouse = appended.find((c) =>
        String(c.className || "").includes("mouse-run"),
      );
      expect(mouse, "mouse element appended").toBeTruthy();
      const looking = (pupils[0].style as Record<string, string>).transform || "";
      expect(looking).toContain("translate");
      await new Promise((r) => setTimeout(r, 4200));
      expect((pupils[0].style as Record<string, string>).transform).toBe("");
    },
    15000,
  );
});
