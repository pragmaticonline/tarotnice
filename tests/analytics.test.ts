import { describe, expect, it } from "vitest";
import app from "../src/index";
import {
  analyticsBeacon,
  isAnalyticsEvent,
  isClientEvent,
  recordEvent,
  type AnalyticsEnv,
} from "../src/lib/analytics";

type DataPoint = {
  indexes?: string[];
  blobs?: string[];
  doubles?: number[];
};

function fakeEnv() {
  const points: DataPoint[] = [];
  const env: AnalyticsEnv = {
    EVENTS: {
      writeDataPoint: (p: DataPoint) => points.push(p),
    } as AnalyticsEngineDataset,
  };
  return { env, points };
}

describe("recordEvent", () => {
  it("writes the documented schema, with no identifier fields", () => {
    const { env, points } = fakeEnv();
    recordEvent(env, {
      name: "share_target",
      lang: "TH",
      topic: "love",
      kind: "reading",
      detail: "line",
      country: "th",
      device: "Mobile",
      browser: "Chrome",
      userKind: "anon",
    });
    expect(points).toHaveLength(1);
    expect(points[0].indexes).toEqual(["share_target"]);
    expect(points[0].blobs).toEqual([
      "share_target",
      "th",
      "love",
      "reading",
      "line",
      "",
      "TH",
      "Mobile",
      "Chrome",
      "anon",
    ]);
    expect(points[0].doubles).toEqual([1, 0]);
  });

  it("never records question text or identifiers", () => {
    const { env, points } = fakeEnv();
    recordEvent(env, {
      name: "reading_completed",
      lang: "th",
      topic: "career",
      detail: "ok",
    });
    const raw = JSON.stringify(points[0]);
    expect(raw).not.toContain("user_");
    expect(raw).not.toContain("@");
  });

  it("drops unknown events and survives a missing binding", () => {
    const { env, points } = fakeEnv();
    expect(() =>
      recordEvent(env, { name: "checkout_started" as never }),
    ).not.toThrow();
    expect(points).toHaveLength(0);
    expect(() => recordEvent({}, { name: "page_view" })).not.toThrow();
    expect(() => recordEvent(undefined, { name: "page_view" })).not.toThrow();
  });
});

describe("event taxonomy", () => {
  it("accepts the tarot event set and nothing billing-shaped", () => {
    for (const name of [
      "page_view",
      "language_selected",
      "daily_drawn",
      "reading_completed",
      "share_open",
      "share_target",
      "share_landing",
      "share_cta_click",
      "referral_signup",
      "referral_converted",
      "limit_hit",
      "rate_limited",
    ]) {
      expect(isAnalyticsEvent(name)).toBe(true);
    }
    expect(isAnalyticsEvent("checkout_started")).toBe(false);
    expect(isAnalyticsEvent("score_attempt")).toBe(false);
  });

  it("lets browsers report only safe client events", () => {
    for (const name of ["page_view", "language_selected", "share_open", "share_cta_click"]) {
      expect(isClientEvent(name)).toBe(true);
    }
    expect(isClientEvent("share_target")).toBe(false);
    expect(isClientEvent("reading_completed")).toBe(false);
  });

  it("beacons page views to /_t/events", () => {
    expect(analyticsBeacon()).toContain("/_t/events");
    expect(analyticsBeacon()).not.toContain("_nicelingo");
  });
});

describe("POST /_t/events", () => {
  it("rejects cross-origin and oversized beacons", async () => {
    const noOrigin = await app.request("/_t/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "page_view", path: "/" }),
    });
    expect(noOrigin.status).toBe(403);
    const big = await app.request("http://localhost/_t/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        "content-length": "2049",
      },
      body: "x".repeat(2049),
    });
    expect(big.status).toBe(413);
  });

  it("rejects non-client events", async () => {
    const res = await app.request("http://localhost/_t/events", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ event: "share_target", detail: "line" }),
    });
    expect(res.status).toBe(400);
  });
});
