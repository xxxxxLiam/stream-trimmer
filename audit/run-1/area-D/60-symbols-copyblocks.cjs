/**
 * Area D / symbol palette and copy blocks, in the real app with real clicks.
 *
 * Every symbol in src/lib/symbols.ts is clicked and the SYSTEM CLIPBOARD is
 * read back and compared code point by code point against the product's own
 * data (compiled unchanged with esbuild). Nothing is eyeballed.
 *
 * Also: keyboard-only copy, labels, the palette at a narrow width, and the
 * seven copy blocks.
 *
 * Changes no product code.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { boot, campaign, folders } = require("./lib-D.cjs");
const { loadVideo, addSegment, cut } = require("./lib-cut.cjs");

const REPO = "/home/user/stream-trimmer";
const OUT = `${REPO}/audit/run-1/area-D/out/symbols`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // The product's own symbol data, unchanged.
  const bundle = path.join(OUT, "_symbols.bundle.cjs");
  execFileSync(path.join(REPO, "node_modules", ".bin", "esbuild"),
    [path.join(REPO, "src", "lib", "symbols.ts"), "--bundle", "--platform=node", "--format=cjs", `--outfile=${bundle}`],
    { stdio: "inherit" });
  const S = require(bundle);
  const entries = S.allEntries();
  console.log("symbols in the product data:", entries.length);

  const cps = (s) => Array.from(s).map((c) => "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")).join(" ");

  const F = folders("symbols");
  const a = await boot({
    label: "D-symbols", outDir: OUT,
    seed: {
      "clipper.dataDirConfirmed": true,
      "clipper.clipsDir": F.clips, "clipper.dataDir": F.data, "clipper.saveDir": F.clips,
      "clipper.campaigns": [campaign("aud", "Audit D", F.clips, F.data)],
      "clipper.activeCampaign": "aud",
    },
  });

  /**
   * Read the real system clipboard. navigator.clipboard.readText first; if the
   * renderer is not allowed it, paste into a textarea with a real Ctrl+V,
   * which goes through Chromium's own clipboard.
   */
  const readClipboard = async () => {
    const direct = await a.win.evaluate(async () => {
      try { return { ok: true, text: await navigator.clipboard.readText() }; }
      catch (e) { return { ok: false, why: String(e) }; }
    });
    if (direct.ok) return direct.text;
    await a.win.evaluate(() => {
      let t = document.getElementById("__auditPaste");
      if (!t) {
        t = document.createElement("textarea");
        t.id = "__auditPaste";
        t.style.position = "fixed"; t.style.left = "0"; t.style.top = "0"; t.style.zIndex = "99999";
        document.body.appendChild(t);
      }
      t.value = ""; t.focus();
    });
    await a.win.keyboard.press("Control+V");
    await a.win.waitForTimeout(80);
    return await a.win.evaluate(() => {
      const t = document.getElementById("__auditPaste");
      const v = t.value; t.remove();
      return v;
    });
  };

  try {
    // ------------------------------------------------- open the palette
    await a.win.click("#ui-symbols");
    await a.win.waitForSelector('[aria-label="Symbols and phrases"]', { timeout: 10000 });
    console.log(await a.shot("palette-open"));

    const chipCount = await a.win.locator('[aria-label="Symbols and phrases"] button[data-chip]').count();
    console.log("chips rendered:", chipCount, "(product data has", entries.length, ")");

    // clipboard read path check
    const probe = await a.win.evaluate(async () => {
      try { await navigator.clipboard.writeText("__probe__"); return "write ok"; } catch (e) { return "write failed " + e; }
    });
    console.log("clipboard write probe:", probe, "| read back:", JSON.stringify(await readClipboard()));

    // ------------------------------------------------- every symbol, byte exact
    console.log("\n=== every symbol: click, then compare the clipboard code point by code point ===");
    const bad = [];
    for (const e of entries) {
      // Find the chip by its accessible name, which is "Copy <name>".
      const sel = `[aria-label="Symbols and phrases"] button[data-chip][aria-label="Copy ${e.name.replace(/"/g, '\\"')}"]`;
      const n = await a.win.locator(sel).count();
      if (n === 0) { bad.push({ id: e.id, name: e.name, problem: "no chip with that accessible name" }); continue; }
      await a.win.locator(sel).first().click();
      await a.win.waitForTimeout(120);
      const got = await readClipboard();
      if (got !== e.text) {
        bad.push({
          id: e.id, group: e.group, name: e.name,
          expected: e.text, expectedCps: cps(e.text),
          got, gotCps: cps(got),
        });
      }
    }
    console.log(`symbols checked: ${entries.length}   mismatches: ${bad.length}`);
    for (const b of bad) console.log("  MISMATCH", JSON.stringify(b));
    fs.writeFileSync(path.join(OUT, "symbol-clipboard-diff.json"),
      JSON.stringify({ total: entries.length, mismatches: bad }, null, 2));

    // Specifically re-check the combining marks and Arabic ligatures, since a
    // dotted circle is added for DISPLAY and must never reach the clipboard.
    console.log("\n=== combining marks and Arabic ligatures (display adds U+25CC, the clipboard must not) ===");
    for (const id of ["u0610", "u0611", "u0612", "u0613", "uFDFD", "uFDFA", "uFDFB", "uFD3E", "uFD3F", "u06DE"]) {
      const e = entries.find((x) => x.id === id);
      if (!e) { console.log(`  ${id}: NOT IN THE DATA`); continue; }
      await a.win.locator(`[aria-label="Symbols and phrases"] button[data-chip][aria-label="Copy ${e.name}"]`).first().click();
      await a.win.waitForTimeout(120);
      const got = await readClipboard();
      const shown = await a.win.evaluate((name) => {
        const b = Array.from(document.querySelectorAll('button[data-chip]')).find((x) => x.getAttribute("aria-label") === "Copy " + name);
        return b ? b.innerText : "<none>";
      }, e.name);
      console.log(`  ${id} ${e.name}`);
      console.log(`     displayed: ${cps(shown.trim())}`);
      console.log(`     clipboard: ${cps(got)}   expected: ${cps(e.text)}   ${got === e.text ? "EXACT" : "*** WRONG ***"}`);
    }

    // ------------------------------------------------- keyboard only
    console.log("\n=== keyboard-only copy ===");
    await a.win.evaluate(async () => { await navigator.clipboard.writeText("__cleared__"); });
    await a.win.click('[aria-label="Search symbols"]');
    await a.win.fill('[aria-label="Search symbols"]', "alhamdulillah");
    await a.win.waitForTimeout(300);
    await a.win.keyboard.press("Enter");
    await a.win.waitForTimeout(250);
    console.log("search + Enter copied:", JSON.stringify(await readClipboard()));
    await a.win.fill('[aria-label="Search symbols"]', "macron");
    await a.win.waitForTimeout(300);
    await a.win.keyboard.press("ArrowDown");
    const focused = await a.win.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    console.log("ArrowDown from the search focuses:", focused);
    await a.win.keyboard.press("ArrowRight");
    console.log("ArrowRight focuses:", await a.win.evaluate(() => document.activeElement?.getAttribute("aria-label")));
    await a.win.keyboard.press("Enter");
    await a.win.waitForTimeout(250);
    console.log("Enter on the focused chip copied:", JSON.stringify(await readClipboard()), cps(await readClipboard()));
    await a.win.keyboard.press("ArrowDown");
    console.log("ArrowDown again focuses:", await a.win.evaluate(() => document.activeElement?.getAttribute("aria-label")));
    console.log(await a.shot("keyboard-focus"));

    // Tab order: can the palette be reached and left with the keyboard only?
    await a.win.fill('[aria-label="Search symbols"]', "");
    const tabOrder = [];
    await a.win.click('[aria-label="Search symbols"]');
    for (let i = 0; i < 6; i++) {
      await a.win.keyboard.press("Tab");
      tabOrder.push(await a.win.evaluate(() => {
        const e = document.activeElement;
        return (e?.getAttribute("aria-label") || e?.tagName) + (e?.closest('[aria-label="Symbols and phrases"]') ? "" : "  <OUTSIDE THE PALETTE>");
      }));
    }
    console.log("tab order from the search box:", JSON.stringify(tabOrder, null, 1));

    // ------------------------------------------------- narrow width
    console.log("\n=== narrow width (360 x 760) ===");
    await a.win.setViewportSize({ width: 360, height: 760 });
    await a.win.waitForTimeout
      ? await a.win.waitForTimeout(500) : null;
    const narrow = await a.win.evaluate(() => {
      const p = document.querySelector('[aria-label="Symbols and phrases"]');
      const r = p.getBoundingClientRect();
      const chips = Array.from(p.querySelectorAll("button[data-chip]"));
      const offRight = chips.filter((c) => c.getBoundingClientRect().right > window.innerWidth + 0.5).length;
      const offLeft = chips.filter((c) => c.getBoundingClientRect().left < -0.5).length;
      const tooSmall = chips.filter((c) => { const b = c.getBoundingClientRect(); return b.height < 24 || b.width < 24; }).length;
      return {
        panel: { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) },
        viewport: window.innerWidth,
        pageScrollsSideways: document.documentElement.scrollWidth > window.innerWidth,
        chipsOffScreenRight: offRight, chipsOffScreenLeft: offLeft,
        chipsUnder24px: tooSmall,
        searchVisible: !!p.querySelector('[aria-label="Search symbols"]')?.getBoundingClientRect().width,
      };
    });
    console.log(JSON.stringify(narrow, null, 1));
    console.log(await a.shot("palette-narrow"));
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await a.win.waitForTimeout(300);

    // ------------------------------------------------- Escape closes
    await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(300);
    console.log("palette closed by Escape:",
      (await a.win.locator('[aria-label="Symbols and phrases"]').count()) === 0);

    // ------------------------------------------------- COPY BLOCKS
    console.log("\n\n================ COPY BLOCKS ================");
    await a.win.click("#ui-copy-blocks");
    await a.win.waitForSelector('[aria-label="Copy blocks"]', { timeout: 10000 });
    console.log("with nothing loaded:");
    console.log(await a.win.evaluate(() =>
      Array.from(document.querySelectorAll('[aria-label="Copy blocks"] li')).map((li) => li.innerText.replace(/\n+/g, " | "))));
    console.log(await a.shot("copyblocks-empty"));
    await a.win.keyboard.press("Escape");

    await loadVideo(a);
    await addSegment(a, 3, 9);
    await a.win.click("#ui-copy-blocks");
    await a.win.waitForSelector('[aria-label="Copy blocks"]', { timeout: 10000 });
    await a.win.waitForTimeout(400);
    const blocks = await a.win.evaluate(() =>
      Array.from(document.querySelectorAll('[aria-label="Copy blocks"] li')).map((li) => ({
        text: li.innerText.replace(/\n/g, " ⏎ "),
        disabled: li.querySelector("button[data-copy]")?.disabled,
        label: li.querySelector("button[data-copy]")?.getAttribute("aria-label"),
      })));
    console.log("blocks with a video + a segment:");
    for (const b of blocks) console.log("  -", JSON.stringify(b));
    console.log(await a.shot("copyblocks-live"));

    console.log("\nclicking every enabled Copy and reading the clipboard:");
    const n = await a.win.locator('[aria-label="Copy blocks"] button[data-copy]').count();
    for (let i = 0; i < n; i++) {
      const b = a.win.locator('[aria-label="Copy blocks"] button[data-copy]').nth(i);
      const label = await b.getAttribute("aria-label");
      if (await b.isDisabled()) { console.log(`  ${label}: DISABLED`); continue; }
      await b.click();
      await a.win.waitForTimeout(200);
      const got = await readClipboard();
      console.log(`  ${label}: ${JSON.stringify(got.slice(0, 220))}${got.length > 220 ? " ...(" + got.length + " chars)" : ""}`);
      console.log(`      button now says: ${JSON.stringify((await b.innerText()).trim())}`);
    }

    console.log("\nkeyboard-only copy of a block:");
    const firstEnabled = await a.win.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    console.log("  focus on open was:", firstEnabled);
    await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(300);
    console.log("  closed by Escape:", (await a.win.locator('[aria-label="Copy blocks"]').count()) === 0);

    console.log("\n--- page errors ---", JSON.stringify(a.logs.pageErrors));
  } finally {
    await a.close();
  }
  process.exit(0);
})().catch((e) => { console.error("SCRIPT FAILED:", e); process.exit(1); });
