import { describe, expect, it } from "vitest";
import app from "../src/index";

describe("notification defaults", () => {
  it("guests get News & offers on by default in /api/me/summary", async () => {
    const res = await app.request("/api/me/summary");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      prefs: { notifyPromo: boolean; notifyDaily: boolean };
    };
    expect(body.prefs.notifyPromo).toBe(true);
    expect(body.prefs.notifyDaily).toBe(true);
  });
});
