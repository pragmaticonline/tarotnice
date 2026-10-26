import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Refresh flashes the server-rendered optimistic "3 of 3" until
// /api/me/summary lands. The quota row must shimmer (is-loading) from
// fetch start until fresh numbers paint — or the fetch fails, in which
// case the server text stays and the shimmer must still clear.
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
  const rowClasses = makeClassList();
  const label = { textContent: "3 of 3 questions left today" };
  const row = {
    classList: rowClasses,
    querySelectorAll: () => [{ classList: makeClassList() }],
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
  return { rowClasses, label };
}

const tick = () => new Promise((r) => setTimeout(r, 20));

describe("quota loading shimmer", () => {
  it("shimmers until fresh quota paints", async () => {
    let resolveFetch!: (v: { json: () => Promise<unknown> }) => void;
    const gate = new Promise<{ json: () => Promise<unknown> }>((r) => {
      resolveFetch = r;
    });
    const { rowClasses, label } = loadHome(() => gate);
    await tick();
    expect(rowClasses.contains("is-loading")).toBe(true);
    resolveFetch({
      json: async () => ({ user: { id: "u" }, quota: { used: 1, limit: 3 }, streak: null }),
    });
    await tick();
    await tick();
    expect(label.textContent).toBe("2 of 3 questions left today");
    expect(rowClasses.contains("is-loading")).toBe(false);
  });

  it("clears the shimmer when the fetch fails", async () => {
    const { rowClasses } = loadHome(() => Promise.reject(new Error("offline")));
    await tick();
    await tick();
    expect(rowClasses.contains("is-loading")).toBe(false);
  });
});
