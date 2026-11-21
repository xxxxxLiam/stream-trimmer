/**
 * v-b1-search.cjs — B-1. Does emptying the transcript search result set blank
 * the renderer and lose unsaved marks?
 *
 * Written from the finding's Steps, not from area B's script.
 * Modes (each its own cold start):
 *   type   — type a matching word, then one more character so nothing matches
 *   clear  — type a matching word, then clear the box
 *   escape — type a matching word, then press Escape
 *   nomatch— NEVER match at all (control: is a match needed first?)
 *   nomarks— same as `type` but with no segments added (control: are marks relevant?)
 *
 * Usage: STUB=/tmp/vstubX xvfb-run -a node v-b1-search.cjs <mode>
 */
const { boot, loadUrl, paneState, alive } = require("./v-lib.cjs");

const mode = process.argv[2] || "type";

(async () => {
  const a = await boot({
    label: `v-b1-${mode}`,
    stubRoot: process.env.STUB,
    viewport: { width: 1440, height: 900 },
  });
  try {
    await loadUrl(a, "https://www.youtube.com/watch?v=stub0000001");
    await a.win.waitForFunction(
      () => document.querySelectorAll("#ui-col-transcript li").length > 0,
      null,
      { timeout: 20000 },
    );

    if (mode !== "nomarks") {
      for (const [i, o] of [
        ["00:00:10", "00:00:20"],
        ["00:01:00", "00:01:30"],
      ]) {
        await a.win.locator("#ui-mark-in:visible").first().fill(i);
        await a.win.locator("#ui-mark-out:visible").first().fill(o);
        await a.win.locator("#ui-add-segment:visible").first().click();
      }
      a.log("before search:", await a.win.evaluate(paneState));
    }
    await a.shot("before-search");

    const search = a.win.locator('input[placeholder="Find what was said"]:visible').first();
    const counter = () =>
      a.win.evaluate(() => {
        const el = [...document.querySelectorAll("[aria-label]")].find((e) =>
          /^Match /.test(e.getAttribute("aria-label") || ""),
        );
        return el ? el.getAttribute("aria-label") : null;
      });

    if (mode === "nomatch") {
      await search.click();
      await search.type("zzzzznothinghere", { delay: 40 });
      await a.win.waitForTimeout(1500);
      a.log("counter after a never-matching query:", await counter());
      a.log("alive:", await a.win.evaluate(alive));
      await a.shot("after-nomatch");
    } else {
      await search.click();
      await search.type("needle", { delay: 40 });
      await a.win.waitForTimeout(1500);
      a.log("counter after 'needle':", await counter());
      a.log("alive after 'needle':", await a.win.evaluate(alive));
      await a.shot("matched");

      if (mode === "type") await search.type("s", { delay: 40 });
      else if (mode === "clear") await search.fill("");
      else if (mode === "escape") await search.press("Escape");
      await a.win.waitForTimeout(2000);

      const first = await a.win.evaluate(alive).catch((e) => `EVAL FAILED: ${e.message}`);
      a.log(`alive right after [${mode}]:`, first);
      await a.shot(`after-${mode}`);

      await a.win.waitForTimeout(10000);
      const later = await a.win.evaluate(alive).catch((e) => `EVAL FAILED: ${e.message}`);
      a.log("alive 12s later:", later);

      // Is it merely an error state, or truly unrecoverable? Try to use the app.
      const clickable = await a.win
        .evaluate(() => {
          const b = document.querySelector("#ui-settings");
          return b ? "settings button still in the DOM" : "no #ui-settings";
        })
        .catch((e) => `EVAL FAILED: ${e.message}`);
      a.log("recovery check:", clickable);
      try {
        await a.win.click("#ui-settings", { timeout: 3000 });
        a.log("clicked #ui-settings OK");
      } catch (e) {
        a.log("could not click #ui-settings:", e.message.split("\n")[0]);
      }
      await a.shot("recovery-attempt");

      // After a reload, what survives?
      await a.win.reload();
      await a.win.waitForTimeout(4000);
      const after = await a.win.evaluate(() => {
        const vis = (el) => el && el.offsetParent !== null;
        const t = [...document.querySelectorAll("#ui-stitched-total")].find(vis);
        const c = [...document.querySelectorAll("#ui-source-chip")].find(vis);
        return {
          gate: Boolean(document.querySelector("#youtube-connect-title")),
          total: t ? t.innerText.replace(/\s+/g, " ").trim() : null,
          source: c ? c.innerText.replace(/\s+/g, " ").trim() : null,
        };
      });
      a.log("after reload:", after);
      await a.shot("after-reload");
    }

    a.log("page errors:", a.logs.pageErrors.slice(0, 4));
  } finally {
    a.log("PROOF:", a.writeLog());
    await a.close();
  }
})();
