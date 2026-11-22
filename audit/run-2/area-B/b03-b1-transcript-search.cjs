/**
 * File: b03-b1-transcript-search.cjs
 * Path: audit/run-2/area-B/b03-b1-transcript-search.cjs
 * Description: B-1 — transcript search blanking the app when the result set empties.
 *   All three routes run 1 found: typing one more character, clearing the box, and
 *   Escape. Two marked segments are in place first, so "nothing was lost" is checkable.
 *   Also re-steps past the end with Enter/Shift+Enter while the set shrinks, and does
 *   the whole thing over a 6,000-cue transcript.
 *
 *   Negative control: the same script against ROOT=<scratch>/ctrlA (run-1 code).
 */
const { boot, crashState, live, loadLive, markLive, stubRoot, S } = require("./lib.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/b2";
const STUB = process.env.STUB || `${SCRATCH}/stub`;
const ROOT = process.env.ROOT || "/home/user/stream-trimmer";
const TAG = process.env.TAG || ROOT.split("/").pop();
// The fixed tree gives the box an id; the run-1 tree uses a generated one, so select
// by its placeholder and take the visible copy (every tab mounts one).
const SEARCH = 'input[placeholder="Find what was said"]:visible';

async function state(a, what) {
  const c = await crashState(a);
  const extra = await a.win
    .evaluate(() => {
      const box = Array.from(document.querySelectorAll('input[placeholder="Find what was said"]')).find((e) => e.offsetParent !== null) || null;
      const counter = document.querySelector('[aria-label^="Match"]');
      const col = document.querySelector("#ui-col-transcript");
      return {
        query: box ? box.value : null,
        counter: counter ? counter.innerText.trim() : (col?.innerText.match(/\d+\/\d+/) || [null])[0],
        rows: document.querySelectorAll("[data-line]").length,
        segRows: document.querySelectorAll('ol[aria-label^="Segments"] > li').length,
      };
    })
    .catch(() => ({}));
  console.log(
    `[${what}] ${c.crashed ? "*** CRASHED ***" : "alive"} bodyLen=${c.bodyLen} boundary=${c.boundary} ` +
      `answering=${c.answering} reactErrors=${c.reactErrorCount} | query=${JSON.stringify(extra.query)} ` +
      `counter=${JSON.stringify(extra.counter)} transcriptRows=${extra.rows} segments=${extra.segRows}`,
  );
  if (c.boundaryMessage) console.log(`      boundary says: ${c.boundaryMessage}`);
  for (const e of c.reactErrors) console.log(`      ${e.slice(0, 180)}`);
  return c;
}

async function run(lines, label) {
  const stub = stubRoot(STUB);
  stub.write({ info: { id: "ccccccccccc", title: "Search video", duration: 30, uploader: "Ch" }, transcriptLines: lines, transcriptCueSec: 4 });
  const a = await boot({ label: `b03-${TAG}-${label}`, root: ROOT, stub: STUB, viewport: { width: 1440, height: 900 } });
  console.log(`\n--- ${label}: ${lines} cues ---`);
  await loadLive(a, "https://www.youtube.com/watch?v=ccccccccccc");
  await markLive(a, "00:00:02", "00:00:05");
  await a.win.click(S.add);
  await markLive(a, "00:00:10", "00:00:14");
  await a.win.click(S.add);
  await a.win.waitForTimeout(300);
  await state(a, "two segments marked");

  // 1. a query that matches
  await a.win.click(SEARCH);
  await a.win.fill(SEARCH, "needle");
  await a.win.waitForTimeout(1200);
  let c = await state(a, 'typed "needle"');

  // 2. one more character so nothing matches
  if (!c.crashed) {
    await a.win.type(SEARCH, "s", { delay: 40 }).catch(() => {});
    await a.win.waitForTimeout(1200);
    c = await state(a, 'typed "needles" (result set empties)');
    console.log("    shot:", await a.shot("after-typing-to-empty"));
  }

  // 3. clear the box
  if (!c.crashed) {
    await a.win.fill(SEARCH, "needle").catch(() => {});
    await a.win.waitForTimeout(900);
    await a.win.fill(SEARCH, "").catch(() => {});
    await a.win.waitForTimeout(1200);
    c = await state(a, "cleared the box");
    console.log("    shot:", await a.shot("after-clearing"));
  }

  // 4. Escape, which the box documents as "clear the search"
  if (!c.crashed) {
    await a.win.fill(SEARCH, "needle").catch(() => {});
    await a.win.waitForTimeout(900);
    await a.win.press(SEARCH, "Escape").catch(() => {});
    await a.win.waitForTimeout(1200);
    c = await state(a, "pressed Escape");
    console.log("    shot:", await a.shot("after-escape"));
  }

  // 5. step matches with Enter, then shrink the set while an index is held
  if (!c.crashed) {
    await a.win.fill(SEARCH, "says").catch(() => {});
    await a.win.waitForTimeout(1200);
    for (let i = 0; i < 4; i++) await a.win.press(SEARCH, "Enter").catch(() => {});
    await a.win.waitForTimeout(600);
    c = await state(a, 'stepped 4 matches of "says"');
    await a.win.fill(SEARCH, "says something that is not there").catch(() => {});
    await a.win.waitForTimeout(1200);
    c = await state(a, "shrank the set while match 5 was active");
    await a.win.press(SEARCH, "Enter").catch(() => {});
    await a.win.press(SEARCH, "Shift+Enter").catch(() => {});
    await a.win.waitForTimeout(800);
    c = await state(a, "Enter / Shift+Enter with zero matches");
    console.log("    shot:", await a.shot("zero-matches-stepping"));
  }

  // 6. one character at a time through a word, deleting back out again
  if (!c.crashed) {
    await a.win.fill(SEARCH, "").catch(() => {});
    for (const ch of "haystackk") {
      await a.win.type(SEARCH, ch, { delay: 25 }).catch(() => {});
      await a.win.waitForTimeout(300);
    }
    c = await state(a, "typed haystackk one key at a time");
    for (let i = 0; i < 9 && !c.crashed; i++) {
      await a.win.press(SEARCH, "Backspace").catch(() => {});
      await a.win.waitForTimeout(250);
      c = await crashState(a);
    }
    c = await state(a, "deleted it again one key at a time");
  }

  console.log(`    final pane: ${JSON.stringify(await live(a))}`);
  const verdict = c.crashed ? "CRASHED" : "survived";
  await a.close();
  return verdict;
}

(async () => {
  console.log(`=== B-1 transcript search ===\nROOT=${ROOT}  TAG=${TAG}`);
  const small = await run(12, "small");
  const big = await run(6000, "6000cues");
  console.log(`\nVERDICT[${TAG}]: small=${small} 6000cues=${big}`);
})().catch((e) => {
  console.error("SCRIPT FAILED", e);
  process.exit(1);
});
