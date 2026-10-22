// Browser check for the card-selection fan (SPEC §8): drives the real
// home page in headless Chromium, asks a question, and asserts the fan
// stays inside the stage and three picks flip + stream a reading.
//
//   node scripts/check-fan.mjs [url]   (default http://127.0.0.1:8788/)
//
// Uses the first Chromium found: $CHROME, the Playwright cache, or
// `chromium`/`google-chrome` on PATH. Exits non-zero on any failure.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const URL_TO_TEST = process.argv[2] || "http://127.0.0.1:8788/";
const PORT = 9713;

function findChrome() {
  const candidates = [
    process.env.CHROME,
    join(homedir(), ".cache/ms-playwright/chromium-1234/chrome-linux64/chrome"),
    "/snap/bin/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || "chromium";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
function chk(name, ok, detail) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) fails.push(name);
}

const profile = join(tmpdir(), "tarotnice-fan-check");
const { rmSync, mkdirSync } = await import("node:fs");
rmSync(profile, { recursive: true, force: true });
mkdirSync(profile, { recursive: true });

const proc = spawn(findChrome(), [
  "--headless=new", "--no-sandbox", "--disable-gpu",
  `--remote-debugging-port=${PORT}`, "--remote-debugging-address=127.0.0.1",
  "--window-size=390,844", `--user-data-dir=${profile}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

let ws;
function send(method, params = {}, sessionId) {
  const id = Math.floor(Math.random() * 1e9);
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id === id) {
        ws.removeEventListener("message", onMsg);
        if (m.error) reject(new Error(JSON.stringify(m.error)));
        else resolve(m.result);
      }
    };
    ws.addEventListener("message", onMsg);
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

async function main() {
  let targets = null;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      targets = await res.json();
      if (targets.length) break;
    } catch {}
    await sleep(300);
  }
  if (!targets) throw new Error("devtools endpoint never came up");
  const page = targets.find((t) => t.type === "page");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });
  const sid = (await send("Target.attachToTarget", { targetId: page.id, flatten: true })).sessionId;
  const S = (p) => send(p.method, p.params || {}, sid);
  const ev = async (expr) => {
    const r = await S({ method: "Runtime.evaluate", params: { expression: expr, awaitPromise: true, returnByValue: true } });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
    return r.result.value;
  };
  await S({ method: "Page.enable" });
  await S({ method: "Runtime.enable" });
  await S({ method: "Page.navigate", params: { url: URL_TO_TEST } });
  await sleep(5000);

  await ev(`(function(){ var q=document.getElementById('q'); q.value='How will the new job go?'; q.dispatchEvent(new Event('input',{bubbles:true})); (document.querySelector('#ask-form button[type=submit]')||document.querySelector('#ask-form .btn-primary')).click(); return true; })()`);

  // Wait until the fan reaches picking state (bubble tells us).
  let bubble = "";
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    bubble = await ev(`(document.querySelector('#guide .bubble')||{}).textContent || ''`);
    if (/Choose|more card|เลือก/.test(bubble)) break;
  }
  chk("fan reaches picking state", /Choose|more card|เลือก/.test(bubble), bubble);

  // C1: nothing of the reading may exist before the picks — no card
  // name blocks rendered, no stream opened yet.
  const prePick = JSON.parse(await ev(`JSON.stringify({
    rcBlocks: document.querySelectorAll('#reading .rc').length,
    flipped: document.querySelectorAll('#draw-stage .card.flipped').length
  })`));
  chk("no reading rendered before picks", prePick.rcBlocks === 0 && prePick.flipped === 0,
    `rc=${prePick.rcBlocks} flipped=${prePick.flipped}`);

  const geo = JSON.parse(await ev(`JSON.stringify((function(){
    var stage = document.getElementById('draw-stage');
    var sr = stage.getBoundingClientRect();
    var cards = Array.prototype.map.call(stage.querySelectorAll('.card'), function(c){
      var r = c.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom };
    });
    return { stage: { l: sr.left, r: sr.right, t: sr.top, b: sr.bottom },
      count: cards.length,
      pickable: stage.querySelectorAll('.card.pickable').length,
      minL: Math.min.apply(null, cards.map(function(c){return c.l;})),
      maxR: Math.max.apply(null, cards.map(function(c){return c.r;})),
      maxB: Math.max.apply(null, cards.map(function(c){return c.b;})) };
  })())`));
  chk("78 cards dealt", geo.count === 78, `count=${geo.count}`);
  chk("all cards pickable", geo.pickable === 78, `pickable=${geo.pickable}`);
  chk("fan inside stage horizontally", geo.minL >= geo.stage.l - 1 && geo.maxR <= geo.stage.r + 1,
    `cards ${geo.minL.toFixed(0)}..${geo.maxR.toFixed(0)} vs stage ${geo.stage.l.toFixed(0)}..${geo.stage.r.toFixed(0)}`);
  chk("fan inside stage vertically", geo.maxB <= geo.stage.b + 2,
    `fan bottom ${geo.maxB.toFixed(0)} vs stage bottom ${geo.stage.b.toFixed(0)}`);

  // Pick three cards via real clicks (center of each card).
  for (let nPicker = 0; nPicker < 3; nPicker++) {
    const pt = JSON.parse(await ev(`JSON.stringify((function(){
      var c = document.querySelector('#draw-stage .card.pickable');
      if (!c) return null;
      var r = c.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + Math.min(24, r.height / 2) };
    })())`));
    if (!pt) throw new Error("no pickable card to click");
    await S({ method: "Input.dispatchMouseEvent", params: { type: "mousePressed", x: pt.x, y: pt.y, button: "left", clickCount: 1 } });
    await S({ method: "Input.dispatchMouseEvent", params: { type: "mouseReleased", x: pt.x, y: pt.y, button: "left", clickCount: 1 } });
    await sleep(1200);
  }

  let flipped = 0;
  let readingText = "";
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    flipped = await ev(`document.querySelectorAll('#draw-stage .card.flipped').length`);
    readingText = await ev(`(document.querySelector('#reading .rtext')||{}).textContent || ''`);
    if (flipped >= 3 && readingText.length > 40) break;
  }
  chk("three cards flipped", flipped >= 3, `flipped=${flipped}`);
  chk("reading streamed", readingText.length > 40, `chars=${readingText.length}`);

  ws.close();
  proc.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch { /* browser may still hold the profile; /tmp is disposable */ }
  if (fails.length) { console.error(`\nCHECK FAILED: ${fails.join(", ")}`); process.exit(1); }
  console.log("\nFAN CHECK PASSED");
}

main().catch((e) => { console.error("ERROR", e.message); proc.kill(); process.exit(1); });
