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

  it("moves pupils toward the mouse's actual position, clamped", () => {
    const { timers, pupils, setMousePos, stepFrame } = loadWithTracking();
    for (const fn of timers) fn();
    expect((pupils[0].style as Record<string, string>).transition).toBe("none");
    // Mouse left of the cat (pos 100 vs pupil center 200): gaze left.
    stepFrame();
    expect((pupils[0].style as Record<string, string>).transform).toContain("-2px");
    // Mouse far right: gaze clamped at +3.5px, following the mouse.
    setMousePos(400);
    stepFrame();
    expect((pupils[0].style as Record<string, string>).transform).toContain("3.5px");
  });

describe("pupil tracking", () => {
  it("tracks the mouse's rendered position instead of a timed flip", () => {
    const src = readFileSync(ASK_PATH, "utf8");
    expect(src).toContain("getBoundingClientRect");
    expect(src).toContain("requestAnimationFrame");
    // Only the no-rects fallback may use the fixed midpoint flip.
    expect(src).toContain('pupils[i].style.transition = "none"');
    expect(src).toContain("} else {\n      setTimeout(function () { look(fromLeft ? 3.5 : -3.5); }, MOUSE_RUN / 2);");
  });
});


function loadWithTracking() {
  const mouse = { pos: 100 };
  const svgEl = makeEl({
    getBoundingClientRect: () => ({ left: mouse.pos - 27, width: 54 }),
  });
  const mouseEl = makeEl({
    querySelector: (sel: string) => (sel === "svg" ? svgEl : null),
    querySelectorAll: () => [],
  });
  const pupils = [
    makeEl({ getBoundingClientRect: () => ({ left: 190, width: 20 }) }),
    makeEl({ getBoundingClientRect: () => ({ left: 190, width: 20 }) }),
  ];
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
    appendChild: (c: Record<string, unknown>) => c,
  });
  const timers: ((...a: unknown[]) => void)[] = [];
  let rafCb: ((t: number) => void) | null = null;
  const form = makeEl({ addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [] });
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
      createElement: () => mouseEl,
    },
    window: {
      TarotDraw: {},
      TarotHome: { refresh: () => {}, data: null },
      addEventListener: () => {},
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: (fn: (t: number) => void) => {
        rafCb = fn;
        return 1;
      },
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(ASK_PATH, "utf8"), sandbox, { filename: "ask.js" });
  return {
    timers,
    pupils,
    setMousePos: (x: number) => { mouse.pos = x; },
    stepFrame: () => {
      const cb = rafCb;
      rafCb = null;
      if (cb) cb(Date.now());
    },
  };
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
