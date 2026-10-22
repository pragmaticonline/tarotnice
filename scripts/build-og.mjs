// Builds public/og.png (1200x630 default social preview) with the same
// resvg-wasm renderer the share images use. Run once; the PNG is
// committed so pages can reference /og.png without a worker round-trip:
//   node scripts/build-og.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg, initWasm } from "@resvg/resvg-wasm";

await initWasm(new Uint8Array(readFileSync("node_modules/@resvg/resvg-wasm/index_bg.wasm")));

const fonts = [
  "public/fonts/cormorant-garamond-latin-600.woff2",
  "public/fonts/ibm-plex-sans-thai-latin-400.woff2",
  "public/fonts/ibm-plex-sans-thai-latin-500.woff2",
  "public/fonts/ibm-plex-sans-thai-thai-400.woff2",
  "public/fonts/ibm-plex-sans-thai-thai-500.woff2",
].map((p) => new Uint8Array(readFileSync(p)));

const mascot = `data:image/png;base64,${readFileSync("public/mascot/ngern-sitting.png").toString("base64")}`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fbe9e1"/><stop offset="1" stop-color="#f6f1fa"/></linearGradient></defs><rect width="1200" height="630" fill="url(#bg)"/><image href="${mascot}" x="120" y="115" width="400" height="400" preserveAspectRatio="xMidYMid meet"/><text x="580" y="280" font-family="Cormorant Garamond, IBM Plex Sans Thai" font-size="120" font-weight="600" fill="#4a3d78">TarotNice</text><text x="584" y="360" font-family="IBM Plex Sans Thai" font-size="44" fill="#76698f">Free daily tarot readings</text><text x="584" y="430" font-family="IBM Plex Sans Thai" font-size="36" fill="#76698f">tarotnice.com</text></svg>`;

const png = new Resvg(svg, {
  font: { fontFiles: [], loadSystemFonts: false, fontBuffers: fonts },
  fitTo: { mode: "width", value: 1200 },
})
  .render()
  .asPng();
writeFileSync("public/og.png", png);
console.log(`og.png: ${png.length} bytes`);
