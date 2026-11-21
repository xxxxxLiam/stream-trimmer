/**
 * File: t13b-search-clear-crash.cjs
 * Description: The same crash, reached the most ordinary way there is:
 *   search for something that exists, then clear the search box.
 */
const { boot, stubRoot } = require("./boot.cjs");
const { loadLive, markLive } = require("./live.cjs");
const STUB = process.env.STUB || "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubB";

const alive = (a) => a.win.evaluate(() => ({
  alive: !!document.querySelector("#ui-mark-in"),
  bodyLen: (document.body.innerText || "").length,
}));

(async () => {
  const stub = stubRoot(STUB);
  stub.write({ info: { id: "clear000001", title: "Clear crash", duration: 600, uploader: "Ch" }, transcriptLines: 40, delayMs: 0, exitCode: 0, stderr: "" });
  const a = await boot({ label: "t13b-clear", stub: STUB, viewport: { width: 1440, height: 900 } });
  await loadLive(a, "https://www.youtube.com/watch?v=clear000001");
  await a.win.waitForTimeout(800);
  await markLive(a, "00:00:10", "00:00:20");
  await a.win.keyboard.press("Control+Shift+Enter");
  await a.win.waitForTimeout(300);
  console.log("segments before:", await a.win.locator('ol[aria-label^="Segments"] > li').count());

  const search = a.win.locator('input[placeholder="Find what was said"]').locator("visible=true").first();
  await search.fill("needle");
  await a.win.waitForTimeout(1200);
  console.log("after searching 'needle':", JSON.stringify(await alive(a)), "counter:",
    await a.win.locator("#ui-col-transcript span.w-12").locator("visible=true").first().innerText());
  console.log("shot:", await a.shot("searched"));

  // Clear the box — the most ordinary thing a user does next.
  await search.fill("");
  await a.win.waitForTimeout(1500);
  console.log("after clearing the box:", JSON.stringify(await alive(a)));
  console.log("pageErrors:", JSON.stringify(a.logs.pageErrors));
  console.log("shot:", await a.shot("after-clearing"));

  // And the Escape key, which the box advertises as "clear".
  await a.close();

  const b = await boot({ label: "t13b-escape", stub: STUB, viewport: { width: 1440, height: 900 } });
  await loadLive(b, "https://www.youtube.com/watch?v=clear000001");
  await b.win.waitForTimeout(800);
  const s2 = b.win.locator('input[placeholder="Find what was said"]').locator("visible=true").first();
  await s2.click();
  await b.win.keyboard.type("needle");
  await b.win.waitForTimeout(1200);
  console.log("\nbefore Escape:", JSON.stringify(await alive(b)));
  await b.win.keyboard.press("Escape");
  await b.win.waitForTimeout(1500);
  console.log("after Escape (the documented 'clear the search' key):", JSON.stringify(await alive(b)));
  console.log("pageErrors:", JSON.stringify(b.logs.pageErrors));
  console.log("shot:", await b.shot("after-escape"));
  await b.close();
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
