/**
 * F-04: help drawer search, driven through the real input.
 * empty, whitespace, no-match, unicode/emoji, 1000 chars, regex metacharacters,
 * case, a query matching every task, leading/trailing spaces, Arabic.
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const CASES = [
  ["empty", ""],
  ["single space", " "],
  ["whitespace only", "   \t  "],
  ["newline", "\n"],
  ["no match", "zzzzqq"],
  ["emoji", "🎬"],
  ["emoji + word", "🎬 clip"],
  ["arabic", "بسم"],
  ["regex .*", ".*"],
  ["regex ((", "(("],
  ["regex [a-z]+", "[a-z]+"],
  ["regex backslash", "\\d+"],
  ["$^", "$^"],
  ["lowercase clip", "clip"],
  ["UPPERCASE CLIP", "CLIP"],
  ["MiXeD CliP", "CliP"],
  ["leading spaces", "   clip"],
  ["trailing spaces", "clip   "],
  ["both spaces", "   clip   "],
  ["stopwords only", "how do i the a"],
  ["1000 chars", "a".repeat(1000)],
  ["1000 chars of clip", "clip ".repeat(200).trim()],
  ["html injection", "<script>alert(1)</script>"],
  ["null-ish", "\u0000"],
  ["long word no spaces", "cutaclipfromavideoandsaveit"],
  ["typo campiagn", "campiagn"],
  ["alias bismillah", "bismillah"],
];

(async () => {
  const a = await L.boot("F-04-search");
  const rows = [];
  try {
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await L.openHelp(a.win);
    const input = a.win.locator("#help-search");

    for (const [name, q] of CASES) {
      const t0 = Date.now();
      await input.fill("");
      await input.fill(q);
      await a.win.waitForTimeout(220);
      const r = await a.win.evaluate(() => {
        const d = document.getElementById("ui-help-drawer");
        const list = [...d.querySelectorAll("[data-help-result]")].map((n) => n.textContent.replace(/\d+ steps?$/, "").trim());
        const status = d.querySelector('[role="status"]')?.textContent?.trim() ?? null;
        return { count: list.length, first: list[0] ?? null, status, titles: list };
      });
      const ms = Date.now() - t0;
      rows.push({ name, query: q.length > 40 ? `${q.slice(0, 40)}… (${q.length} chars)` : q, ms, ...r });
      console.log(
        `${name.padEnd(22)} -> ${String(r.count).padStart(2)} results  status="${r.status}"  first="${r.first}"  ${ms}ms`,
      );
    }

    // Keyboard: ArrowDown from the field reaches the list; ArrowUp returns.
    await input.fill("");
    await a.win.waitForTimeout(200);
    await input.focus();
    await a.win.keyboard.press("ArrowDown");
    const afterDown = await a.win.evaluate(() => ({
      active: document.activeElement?.tagName + ":" + (document.activeElement?.textContent || "").trim().slice(0, 30),
      isResult: document.activeElement?.hasAttribute("data-help-result"),
    }));
    console.log("ArrowDown from field ->", JSON.stringify(afterDown));
    rows.push({ name: "keyboard ArrowDown", ...afterDown });

    // No-match state: is the message helpful and is the list empty?
    await input.fill("zzzzqq");
    await a.win.waitForTimeout(250);
    console.log("SHOT no-match", await a.shot("search-no-match"));
    await input.fill("🎬");
    await a.win.waitForTimeout(250);
    console.log("SHOT emoji", await a.shot("search-emoji"));
    await input.fill("a".repeat(1000));
    await a.win.waitForTimeout(400);
    console.log("SHOT 1000 chars", await a.shot("search-1000-chars"));
    const overflow = await a.win.evaluate(() => {
      const i = document.getElementById("help-search");
      const d = document.getElementById("ui-help-drawer");
      return {
        inputScrollW: i.scrollWidth,
        inputClientW: i.clientWidth,
        drawerScrollW: d.scrollWidth,
        drawerClientW: d.clientWidth,
        bodyScrollW: document.body.scrollWidth,
        bodyClientW: document.body.clientWidth,
      };
    });
    console.log("OVERFLOW with 1000 chars:", JSON.stringify(overflow));
    rows.push({ name: "overflow 1000 chars", ...overflow });

    console.log("PAGE ERRORS", JSON.stringify(a.logs.pageErrors));
  } finally {
    const out = path.join(a.outDir, "search.json");
    fs.writeFileSync(out, JSON.stringify(rows, null, 2));
    console.log("REPORT", out);
    await a.close();
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
