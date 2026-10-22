// Geo-IP default UI language. A visitor's country (Cloudflare
// cf.country / CF-IPCountry) picks the default UI language when they
// have not chosen one yet: Thailand -> Thai, everyone else -> English.
// An explicit choice (cookie, account preference, the \u0e44\u0e17\u0e22/EN switcher)
// always wins over this guess.
import { isUiLang } from "./i18n";

export const COUNTRY_TO_LANG: Record<string, string> = {
  TH: "th",
  GB: "en", US: "en", IE: "en", AU: "en", NZ: "en", CA: "en", ZA: "en", SG: "en",
  ES: "es", MX: "es", AR: "es", CO: "es", PE: "es", VE: "es", CL: "es",
  GT: "es", EC: "es", BO: "es", DO: "es", HN: "es", PY: "es", SV: "es",
  NI: "es", CR: "es", PA: "es", UY: "es", CU: "es",
  DE: "de", AT: "de", CH: "de",
  FR: "fr", BE: "fr", LU: "fr", MC: "fr",
  CN: "zh", TW: "zh", HK: "zh", MO: "zh",
};

/** UI language for a visitor country, or null when the country is
 *  unmapped or maps to a language TarotNice does not offer (only th
 *  and en exist, so only TH resolves; everything else falls back to
 *  English in uiLangFor). */
export function langForCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  const lang = COUNTRY_TO_LANG[country.toUpperCase()];
  if (!lang || !isUiLang(lang)) return null;
  return lang;
}

/** Visitor country from the Cloudflare request context, falling back
 *  to the CF-IPCountry header (also handy in tests). */
export function countryOfRequest(req: { headers: Headers; cf?: unknown }): string | null {
  const cf = req.cf as { country?: string } | undefined;
  // "XX" is Cloudflare's unknown-country marker (also Miniflare's
  // default in local dev): treat it as no signal and let the header
  // fallback speak, so local TH/GB contexts can be simulated.
  const country = cf?.country && cf.country !== "XX" ? cf.country : null;
  return country ?? req.headers.get("cf-ipcountry") ?? null;
}
