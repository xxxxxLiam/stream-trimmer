/**
 * File: t00-smoke.cjs
 * Description: Area-B smoke test: get into the workspace, load a URL, read the
 *   transcript header, and prove the stub/boot plumbing works.
 */
const { boot, loadUrl, stubRoot } = require("./boot.cjs");
const STUB = process.env.STUB || "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubB";

(async () => {
  const stub = stubRoot(STUB);
  stub.write({ transcriptLines: 60, info: { id: "stub0000001", title: "Stub video", duration: 3600, uploader: "Stub channel" } });
  stub.clearCalls();
  const a = await boot({ label: "smoke", stub: STUB, viewport: { width: 1440, height: 900 } });
  console.log("in workspace:", await a.win.locator("#ui-mark-in").count());
  console.log("shot:", await a.shot("workspace"));

  await loadUrl(a, "https://www.youtube.com/watch?v=stub0000001");
  await a.win.waitForTimeout(2500);
  const hdr = await a.win.locator('section#ui-col-transcript header span[aria-live="polite"]').innerText();
  console.log("transcript header:", JSON.stringify(hdr));
  console.log("rows in DOM:", await a.win.locator("[data-line]").count());
  console.log("out field:", await a.win.inputValue("#ui-mark-out"));
  console.log("shot:", await a.shot("loaded"));
  console.log("calls:", stub.calls().length);
  await a.close();
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
