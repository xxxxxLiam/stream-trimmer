/**
 * File: run-channel.cjs
 * Path: audit/run-2/area-H/run-channel.cjs
 * Description: The channel-data exporter screen, which the brief lists as a
 *   surface to check "if you can reach it". A public build strips it at compile
 *   time, so this run reaches it by building the OWNER shape of the app into a
 *   scratchpad COPY of the tree and launching that copy — the audited tree is
 *   neither built nor modified. Measures H-11 (white on accent in the scope
 *   segmented control), the panel's scrollers and their reachability, and the
 *   panel's contrast and token inventory.
 *
 *   Set up beforehand, outside the repo:
 *     cp the tree to <scratch>/owner-build, then in that copy
 *     VITE_ENABLE_CHANNEL_DATA=1 VITE_OWNER_MACHINES='*' VITE_OWNER_SALT=... \
 *       npm run build && node scripts/build-server.cjs
 *
 *   Audit-only; no product code is touched.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const { buildStubRoot } = require("./lib/stub.cjs");

const OUT = path.join(__dirname, "out");
const DATA = path.join(OUT, "data");
const STUB = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubH2R2";
const OWNER = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/owner-build";
const PROBE = fs.readFileSync(path.join(__dirname, "lib", "probe.js"), "utf8");

/** The shared harness launcher, pointed at the owner COPY instead of the repo. */
async function launchOwner(label, seed) {
  const outDir = path.join(OUT, label);
  fs.mkdirSync(outDir, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `clipper-${label}-`));
  fs.writeFileSync(path.join(userDataDir, "settings.json"), JSON.stringify(seed || {}, null, 2));
  const logs = { stdout: [], stderr: [], console: [], pageErrors: [] };
  const app = await electron.launch({
    executablePath: path.join("/home/user/stream-trimmer", "node_modules", "electron", "dist", "electron"),
    args: [path.join(OWNER, "electron", "main.cjs"), `--user-data-dir=${userDataDir}`, "--no-sandbox", "--disable-gpu"],
    cwd: STUB,
    env: { ...process.env, VITE_ENABLE_CHANNEL_DATA: "1", VITE_OWNER_MACHINES: "*", VITE_OWNER_SALT: "audit-run2-area-h-salt" },
  });
  app.process().stdout.on("data", (d) => logs.stdout.push(String(d)));
  app.process().stderr.on("data", (d) => logs.stderr.push(String(d)));
  const deadline = Date.now() + 45000;
  let win = null;
  while (!win && Date.now() < deadline) {
    for (const w of app.windows()) {
      let u = ""; try { u = w.url(); } catch { continue; }
      if (u.includes("127.0.0.1") || u.includes("localhost:8080")) { win = w; break; }
    }
    if (!win) await new Promise((r) => setTimeout(r, 250));
  }
  if (!win) { await app.close().catch(() => {}); throw new Error("no window\n" + logs.stderr.join("")); }
  win.on("console", (m) => logs.console.push(`[${m.type()}] ${m.text()}`));
  win.on("pageerror", (e) => logs.pageErrors.push(String(e)));
  await win.waitForLoadState("domcontentloaded");
  let n = 0;
  const shot = async (name) => {
    const f = path.join(outDir, `${String(++n).padStart(2, "0")}-${name}.png`);
    await win.screenshot({ path: f });
    return f;
  };
  return { app, win, shot, logs, outDir, close: async () => {
    fs.writeFileSync(path.join(outDir, "logs.json"), JSON.stringify(logs, null, 2));
    await app.close().catch(() => {});
  } };
}

const setSize = async (a, w, h) => {
  await a.app.evaluate(async ({ BrowserWindow }, s) => {
    const win = BrowserWindow.getAllWindows().filter((b) => !b.isDestroyed()).pop();
    win.setContentSize(s.w, s.h);
  }, { w, h });
  await a.win.waitForTimeout(400);
  return a.win.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
};

(async () => {
  buildStubRoot(STUB);
  fs.mkdirSync(DATA, { recursive: true });
  const log = [];
  const say = (s) => { console.log(s); log.push(s); };
  const out = {};

  const a = await launchOwner("channel", { "clipper.dataDirConfirmed": true, "clipper.signInSkipped": true });
  await a.win.waitForSelector("header", { timeout: 25000 });
  await a.win.waitForTimeout(2500);
  await setSize(a, 1280, 800);
  const link = await a.win.evaluate(() => Boolean(document.getElementById("ui-channel-link")));
  say(`owner build reached: #ui-channel-link present = ${link}`);
  if (!link) {
    say("the exporter entry point is absent even in this owner build — NOT PROVABLE HERE");
    say(JSON.stringify({ console: a.logs.console.slice(-6), errors: a.logs.pageErrors.slice(-4) }));
    await a.shot("no-channel-link");
    await a.close();
    fs.writeFileSync(path.join(DATA, "channel.txt"), log.join("\n"));
    return;
  }
  await a.win.evaluate(() => document.getElementById("ui-channel-link")?.click());
  await a.win.waitForTimeout(1500);
  await a.shot("channel-screen");
  await a.win.evaluate(PROBE);
  const buf = await a.win.screenshot();
  await a.win.evaluate((u) => window.__H.loadShot(u), "data:image/png;base64," + buf.toString("base64"));

  const d = await a.win.evaluate(() => ({
    text: window.__H.textContrast(),
    icons: window.__H.iconContrast(),
    semantics: window.__H.semantics(),
    scrollers: window.__H.scrollers(),
    tokens: window.__H.tokens(),
    layout: window.__H.layout(),
    // The scope segmented control H-11 named.
    scope: [...document.querySelectorAll("button")]
      .filter((b) => /^(all|comments|transcripts|recent|last)/i.test((b.innerText || "").trim()))
      .map((b) => { const s = getComputedStyle(b);
        return { text: (b.innerText || "").trim().slice(0, 20), color: s.color,
          background: s.backgroundColor, ariaPressed: b.getAttribute("aria-pressed"),
          cls: String(b.className || "").slice(0, 70), fontSize: s.fontSize }; }),
    ids: (() => { const m = new Map();
      for (const e of document.querySelectorAll("[id]")) m.set(e.id, (m.get(e.id) || 0) + 1);
      return { total: m.size, dupes: [...m.entries()].filter(([, v]) => v > 1) }; })(),
  }));
  const fails = d.text.filter((t) => t.bothFail);
  say(`\ntext nodes ${d.text.length}  bothFail ${fails.length}  iconFail ${d.icons.filter((i) => !i.pass).length}`);
  for (const f of fails) {
    say(`  FAIL ${f.ratio}:1 (css ${f.ratioCss}:1) need ${f.need}  ${f.colorHex} on ${f.bgPixelHex}/${f.bgCssHex}  ` +
      `${f.fontSize}px/${f.fontWeight}  "${f.text}"  ${f.path}`);
  }
  say(`\nscope segmented control:`);
  for (const s of d.scope) say(`  "${s.text}" color=${s.color} bg=${s.background} pressed=${s.ariaPressed} ${s.fontSize}`);
  say(`\ntokens: radii=[${d.tokens.radii.map((r) => r.value).join(" ")}] sizes=[${d.tokens.fontSizes.map((r) => r.value).join(" ")}]`);
  say(`text colours: ${d.tokens.textColors.map((c) => `${c.value}x${c.count}`).join(" ")}`);
  say(`ids: ${d.ids.total}, duplicates ${JSON.stringify(d.ids.dupes)}`);
  say(`\nscrollers on the exporter screen:`);
  for (const s of d.scrollers) {
    say(`  ${(s.id ? "#" + s.id : s.path).padEnd(50)} hiddenY=${s.hiddenY} gutterY=${s.gutterY} ` +
      `sb-width=${s.scrollbarWidthCss} visibleBar=${s.visibleBar} tabIndex=${s.tabIndex}`);
  }
  // Wheel + keyboard on the exporter's own scroller, at a short window.
  await setSize(a, 1000, 600);
  await a.win.waitForTimeout(500);
  const reach = await a.win.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find((e) => {
      const s = getComputedStyle(e);
      return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 4 && e.clientHeight > 120;
    });
    if (!el) return null;
    el.setAttribute("data-h2", "chan");
    el.scrollTop = 0;
    return { what: el.id ? "#" + el.id : el.tagName.toLowerCase() + "." +
      String(el.className || "").split(/\s+/).slice(0, 2).join("."),
      max: el.scrollHeight - el.clientHeight, tabIndex: el.tabIndex,
      gutter: el.offsetWidth - el.clientWidth };
  });
  if (reach) {
    await a.win.mouse.move(500, 350);
    for (let i = 0; i < 20; i++) { await a.win.mouse.wheel(0, 400); await a.win.waitForTimeout(50); }
    const w = await a.win.evaluate(() => Math.round(document.querySelector('[data-h2="chan"]').scrollTop));
    await a.win.evaluate(() => { document.querySelector('[data-h2="chan"]').scrollTop = 0; document.activeElement?.blur?.(); });
    let tabs = 0, landed = false;
    for (let i = 0; i < 60; i++) {
      await a.win.keyboard.press("Tab"); tabs = i + 1;
      landed = await a.win.evaluate(() => {
        const el = document.querySelector('[data-h2="chan"]');
        return Boolean(el && document.activeElement && (el === document.activeElement || el.contains(document.activeElement)));
      });
      if (landed) break;
    }
    let kb = null;
    if (landed) {
      for (let i = 0; i < 8; i++) { await a.win.keyboard.press("PageDown"); await a.win.waitForTimeout(60); }
      kb = await a.win.evaluate(() => Math.round(document.querySelector('[data-h2="chan"]').scrollTop));
    }
    say(`\nexporter scroller at 1000x600: ${reach.what} hidden=${reach.max} gutter=${reach.gutter} ` +
      `wheel->${w} tabReached=${landed} (after ${tabs} Tab) PgDn->${kb}`);
    out.reach = { ...reach, wheel: w, tabs, landed, pageDown: kb };
    await a.shot("channel-1000x600");
  } else {
    say("\nexporter screen does not overflow at 1000x600 — nothing to reach");
  }

  out.data = d;
  fs.writeFileSync(path.join(DATA, "channel.json"), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(DATA, "channel.txt"), log.join("\n"));
  await a.close();
  console.log("\nwrote", path.join(DATA, "channel.json"));
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
