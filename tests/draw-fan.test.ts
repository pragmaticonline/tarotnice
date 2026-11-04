import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Hover-hit regression test: fanned cards overlap, so each card shows
// only a sliver — but cardAt() picked the nearest card CENTER, which
// sits buried under the neighbour. Hovering card N+1's visible body
// highlighted card N. The fix anchors each card on the middle of its
// exposed strip (mapped through the fan rotation). This drives the
// real run() fan in a stub DOM and hovers real coordinates.
const DRAW_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/app/draw.js",
);

function makeButton() {
  const cls = new Set<string>();
  const el: Record<string, unknown> = {
    style: {} as Record<string, string>,
    className: "",
    tabIndex: 0,
    children: [] as unknown[],
    firstChild: { style: {} },
    dataset: {},
    classList: {
      add: (c: string) => { cls.add(c); },
      remove: (c: string) => { cls.delete(c); },
      toggle: () => {},
      contains: (c: string) => cls.has(c),
    },
    setAttribute: () => {},
    appendChild: (c: unknown) => { (el.children as unknown[]).push(c); return c; },
    querySelector: () => null,
    addEventListener: () => {},
  };
  return el;
}

async function loadFan(drawPath: string = DRAW_PATH) {
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const children: Record<string, unknown>[] = [];
  const stage: Record<string, unknown> = {
    clientWidth: 360,
    style: {},
    innerHTML: "",
    children,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild: (c: unknown) => { children.push(c as Record<string, unknown>); return c; },
    addEventListener: (t: string, fn: (e: unknown) => void) => {
      (listeners[t] ||= []).push(fn);
    },
    getBoundingClientRect: () => ({ left: 8, top: 20 }),
    querySelector: () => null,
  };
  const sandbox: Record<string, unknown> = {
    window: { matchMedia: () => ({ matches: true }), scrollTo: () => {} },
    document: {
      createElement: () => makeButton(),
      getElementById: () => null,
      querySelector: () => null,
    },
    setTimeout,
    clearTimeout,
    navigator: {},
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(drawPath, "utf8"), sandbox, { filename: "draw.js" });
  const TarotDraw = (sandbox.window as Record<string, unknown>).TarotDraw as {
    run: (stage: unknown, opts: unknown) => Promise<unknown>;
  };
  const cards = [0, 1, 2].map((i) => ({
    name: "Card " + i, image: "/c.png", image2x: "", reversed: false,
  }));
  TarotDraw.run(stage, { cards, lang: "en", onEvent: () => {} });
  // REDUCED fan is synchronous after ~60ms; picking flips on a timer.
  for (let i = 0; i < 100; i++) {
    if (children[0] && "_fan" in (children[0] as object)) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  await new Promise((r) => setTimeout(r, 250));
  const fanOf = (i: number) => (children[i] as Record<string, { x: number; y: number }>)._fan as unknown as { x: number; y: number };
  const hover = (px: number, py: number) => {
    (listeners["pointermove"] || []).forEach((fn) =>
      fn({ clientX: 8 + px, clientY: 20 + py, pointerType: "mouse", preventDefault: () => {} }),
    );
    return children.findIndex((c) =>
      ((c.classList as { contains: (s: string) => boolean }).contains("hl")),
    );
  };
  return { children, fanOf, hover };
}

describe("fan hover hit-testing", () => {
  it("hovering a card's visible body highlights that card, not the buried neighbour", async () => {
    const t = await loadFan();
    // Row 0 is children 0..25 in deck order; fan rotation is ~0 at the
    // centre, so exposed strips are unambiguous ground truth.
    const x14 = t.fanOf(14).x;
    const x16 = t.fanOf(16).x;
    const x17 = t.fanOf(17).x;
    const py = t.fanOf(13).y + 10;
    // Middle of card 14's exposed strip: both rules agree on 14.
    expect(t.hover((t.fanOf(14).x + x16) / 2, py)).toBe(14);
    // Middle of card 16's exposed strip: the old center rule picked 15
    // (its buried center is nearer); the strip anchor picks 16.
    expect(t.hover((x16 + x17) / 2, py)).toBe(16);
    expect(x14).toBeLessThan(x16);
  }, 15000);
});
