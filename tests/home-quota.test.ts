import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The server renders a conservative "0 of 3" quota placeholder so a
// refresh never flashes a full count; home.js replaces it with fresh
// /api/me/summary numbers, and a failed fetch simply keeps the text.
const HOME_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/app/home.js",
);

function makeClassList() {
  const set = new Set<string>();
  return {
    add: (c: string) => {
      set.add(c);
    },
    remove: (c: string) => {
      set.delete(c);
    },
    toggle: (c: string, on: boolean) => {
      if (on) set.add(c);
      else set.delete(c);
    },
    contains: (c: string) => set.has(c),
  };
}

function loadHome(fetchFn: (url: string) => Promise<{ json: () => Promise<unknown> }>) {
  const pips = [{ classList: makeClassList() }];
  const label = { textContent: "0 of 3 questions left today" };
  const row = {
    classList: makeClassList(),
    querySelectorAll: () => pips,
    querySelector: () => label,
  };
  const sandbox: Record<string, unknown> = {
    console,
    setTimeout,
    clearTimeout,
    fetch: fetchFn,
    CustomEvent: class {
      type: string;
      detail: unknown;
      constructor(type: string, init: { detail: unknown }) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    document: {
      documentElement: { lang: "en" },
      querySelector: (sel: string) => {
        if (sel === ".quota") return row;
        if (sel === "[data-streak]") return null;
        return null;
      },
      addEventListener: () => {},
      dispatchEvent: () => true,
    },
    window: { addEventListener: () => {} },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(HOME_PATH, "utf8"), sandbox, {
    filename: "home.js",
  });
  return { label, pips };
}

const tick = () => new Promise((r) => setTimeout(r, 20));

describe("quota placeholder", () => {
  it("paints fresh numbers over the zero-count placeholder", async () => {
    const { label, pips } = loadHome(async () => ({
      json: async () => ({ user: { id: "u" }, quota: { used: 1, limit: 3 }, streak: null }),
    }));
    await tick();
    await tick();
    expect(label.textContent).toBe("2 of 3 questions left today");
    expect(pips[0].classList.contains("on")).toBe(true);
  });

  it("keeps the placeholder when the fetch fails", async () => {
    const { label } = loadHome(() => Promise.reject(new Error("offline")));
    await tick();
    await tick();
    expect(label.textContent).toBe("0 of 3 questions left today");
  });
});
