import { describe, expect, it } from "vitest";
import { COUNTRY_TO_LANG, countryOfRequest, langForCountry } from "../src/lib/geo";

describe("country to UI-language map", () => {
  it("maps Thailand to Thai", () => {
    expect(COUNTRY_TO_LANG.TH).toBe("th");
  });

  it("resolves only offered UI languages (th/en), case-insensitively", () => {
    expect(langForCountry("TH")).toBe("th");
    expect(langForCountry("th")).toBe("th");
    expect(langForCountry("GB")).toBe("en");
    expect(langForCountry("gb")).toBe("en");
    // Mapped but not offered as a UI language.
    expect(langForCountry("CN")).toBeNull();
    expect(langForCountry("DE")).toBeNull();
    expect(langForCountry("FI")).toBeNull();
    expect(langForCountry(null)).toBeNull();
  });

  it("reads cf.country first, then the CF-IPCountry header", () => {
    const headers = (h: Record<string, string>) => new Headers(h);
    expect(
      countryOfRequest({ headers: headers({}), cf: { country: "TH" } }),
    ).toBe("TH");
    expect(
      countryOfRequest({ headers: headers({ "cf-ipcountry": "GB" }), cf: { country: "XX" } }),
    ).toBe("GB");
  });
});
