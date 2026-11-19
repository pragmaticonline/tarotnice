import { describe, expect, it } from "vitest";
import app from "../src/index";

describe("notification defaults", () => {
  it("guests get News & offers off by default in /api/me/summary (PDPA opt-in)", async () => {
    const res = await app.request("/api/me/summary");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      prefs: { notifyPromo: boolean; notifyDaily: boolean };
    };
    expect(body.prefs.notifyPromo).toBe(false);
    expect(body.prefs.notifyDaily).toBe(true);
  });
});
