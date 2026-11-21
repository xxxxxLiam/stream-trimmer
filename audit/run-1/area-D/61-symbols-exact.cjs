/**
 * Area D / symbol palette, byte-exact, with chips identified by their SECTION
 * and position rather than by accessible name.
 *
 * The first pass (60-symbols-copyblocks.cjs) selected chips by accessible
 * name and found two "mismatches" — which turned out to be two DIFFERENT
 * chips carrying the SAME accessible name and tooltip. That ambiguity is
 * itself reported; this run settles whether any symbol copies the wrong text.
 *
 * Changes no product code.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { boot, campaign, folders } = require("./lib-D.cjs");

const REPO = "/home/user/stream-trimmer";
const OUT = `${REPO}/audit/run-1/area-D/out/symbols-exact`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const bundle = path.join(OUT, "_symbols.cjs");
  execFileSync(path.join(REPO, "node_modules", ".bin", "esbuild"),
    [path.join(REPO, "src", "lib", "symbols.ts"), "--bundle", "--platform=node", "--format=cjs", `--outfile=${bundle}`],
    { stdio: "pipe" });
  const S = require(bundle);
  const cps = (s) => Array.from(s).map((c) => "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")).join(" ");

  const F = folders("symx");
  const a = await boot({
    label: "D-symx", outDir: OUT,
    seed: {
      "clipper.dataDirConfirmed": true,
      "clipper.clipsDir": F.clips, "clipper.dataDir": F.data, "clipper.saveDir": F.clips,
      "clipper.campaigns": [campaign("aud", "Audit D", F.clips, F.data)],
      "clipper.activeCampaign": "aud",
    },
  });
  const read = async () => await a.win.evaluate(async () => await navigator.clipboard.readText());

  try {
    await a.win.click("#ui-symbols");
    await a.win.waitForSelector('[aria-label="Symbols and phrases"]', { timeout: 10000 });

    // ------------------------------------------- duplicate accessible names
    const dupes = await a.win.evaluate(() => {
      const names = Array.from(document.querySelectorAll('[aria-label="Symbols and phrases"] button[data-chip]'))
        .map((b) => b.getAttribute("aria-label"));
      const count = {};
      for (const n of names) count[n] = (count[n] || 0) + 1;
      return Object.entries(count).filter(([, c]) => c > 1);
    });
    console.log("=== chips sharing one accessible name (and one tooltip) ===");
    console.log(JSON.stringify(dupes, null, 1));

    // ------------------------------------------- byte-exact, per section
    console.log("\n=== every chip, addressed by section + index, clipboard compared code point by code point ===");
    let checked = 0;
    const bad = [];
    for (const g of S.SYMBOL_GROUPS) {
      const sec = `[aria-label="Symbols and phrases"] section[aria-label="${g.label}"] button[data-chip]`;
      const n = await a.win.locator(sec).count();
      console.log(`\n-- ${g.label}: ${n} chips rendered, ${g.entries.length} in the data`);
      if (n !== g.entries.length) console.log(`   *** COUNT MISMATCH ***`);
      for (let i = 0; i < Math.min(n, g.entries.length); i++) {
        const e = g.entries[i];
        await a.win.locator(sec).nth(i).click();
        await a.win.waitForTimeout(110);
        const got = await read();
        checked++;
        const ok = got === e.text;
        if (!ok) bad.push({ group: g.id, index: i, id: e.id, name: e.name, expected: cps(e.text), got: cps(got) });
        console.log(`   [${String(i).padStart(2)}] ${ok ? "EXACT " : "*** WRONG ***"} ${e.name}`);
        console.log(`        expected ${cps(e.text)}`);
        if (!ok) console.log(`        got      ${cps(got)}`);
      }
    }
    console.log(`\nchips checked: ${checked}   wrong: ${bad.length}`);
    for (const b of bad) console.log("  " + JSON.stringify(b));
    fs.writeFileSync(path.join(OUT, "exact-diff.json"), JSON.stringify({ checked, wrong: bad, duplicateNames: dupes }, null, 2));

    // ------------------------------------------- the Recent row
    console.log("\n=== the Recent row: do its chips copy the right thing? ===");
    await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(300);
    await a.win.click("#ui-symbols");
    await a.win.waitForSelector('[aria-label="Symbols and phrases"]', { timeout: 10000 });
    const recent = await a.win.locator('[aria-label="Symbols and phrases"] section[aria-label="Recent"] button[data-chip]').count();
    console.log("Recent chips:", recent);
    for (let i = 0; i < recent; i++) {
      const loc = a.win.locator('[aria-label="Symbols and phrases"] section[aria-label="Recent"] button[data-chip]').nth(i);
      const label = await loc.getAttribute("aria-label");
      const shown = (await loc.innerText()).trim();
      await loc.click();
      await a.win.waitForTimeout(110);
      const got = await read();
      const entry = S.allEntries().find((e) => "Copy " + e.name === label || "Copied " + e.name === label);
      console.log(`  [${i}] ${label}  shown=${cps(shown)}  clipboard=${cps(got)}  ${entry ? (got === entry.text ? "matches an entry with that name" : "*** does not match the entry with that name ***") : "no entry with that name"}`);
    }
    console.log(await a.shot("recent-row"));

    // ------------------------------------------- search by glyph
    console.log("\n=== search: by glyph, by alias, by nothing matching ===");
    for (const q of ["ﷺ", "pbuh", "U+0610", "zzzz"]) {
      await a.win.fill('[aria-label="Search symbols"]', q);
      await a.win.waitForTimeout(350);
      console.log(`  ${JSON.stringify(q)} -> ${await a.win.locator('[aria-label="Symbols and phrases"] button[data-chip]').count()} chips; ` +
        JSON.stringify((await a.win.evaluate(() => document.querySelector('[aria-label="Symbols and phrases"]').innerText.replace(/\n+/g, " | "))).slice(0, 180)));
    }
    console.log("--- page errors ---", JSON.stringify(a.logs.pageErrors));
  } finally { await a.close(); }
  process.exit(0);
})().catch((e) => { console.error("SCRIPT FAILED:", e); process.exit(1); });
