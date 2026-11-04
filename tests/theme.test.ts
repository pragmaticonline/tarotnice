import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import app from "../src/index";

// Cream surfaces keep a cream background in both themes, so their text
// must use card ink — body ink turns near-white in night mode and
// vanishes on cream (sign-in guest note, journal/prefs fields).
const siteCss = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/app/site.css"),
  "utf8",
);

function rule(src: string, sel: string): string {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return src.match(new RegExp(esc + "\\{[^}]*\\}"))?.[0] ?? "";
}

describe("theme readability", () => {
  it("auth card text uses card ink so night mode stays readable on cream", async () => {
    const html = await (await app.request("/sign-in")).text();
    expect(rule(html, ".auth-card")).toContain("color:var(--card-ink)");
    // The "or use email" divider is muted on the page, but page-muted
    // turns pale in night mode — inside the card it must stay dark.
    expect(rule(html, ".auth-card .auth-or")).toContain("color:var(--card-ink)");
  });

  it("journal and prefs fields use card ink on their cream surfaces", () => {
    expect(rule(siteCss, "#journal-form textarea")).toContain("color:var(--card-ink)");
    expect(rule(siteCss, "#prefs-form select,#prefs-form input")).toContain("color:var(--card-ink)");
  });

  it("contact card heading stays light on its dark card", async () => {
    const html = await (await app.request("/contact")).text();
    // The h2 inherits the purple accent, which blends into the purple card.
    expect(rule(html, ".contact-card h2")).toContain("color:#f4eefc");
  });

  it("faq titles use card ink on their cream cards in night mode", async () => {
    const html = await (await app.request("/contact")).text();
    expect(rule(html, ".faq summary")).toContain("color:var(--card-ink)");
  });

  it("contact lede keeps its gap under the title", async () => {
    const html = await (await app.request("/contact")).text();
    expect(rule(html, "p.lede")).not.toContain("margin-top:-");
  });
});
