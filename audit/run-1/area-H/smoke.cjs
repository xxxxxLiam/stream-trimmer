/**
 * File: smoke.cjs
 * Path: audit/run-1/area-H/smoke.cjs
 * Description: Area H smoke test — confirms the harness boots the app and that
 *   a screenshot + DOM read works. Audit-only; changes no product code.
 */
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");
const STUB = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubH";
const OUT = "/home/user/stream-trimmer/audit/run-1/area-H/out/smoke";

(async () => {
  const a = await launchApp({ label: "H-smoke", cwd: STUB, outDir: OUT, seed: {} });
  await a.win.waitForSelector("body");
  await a.win.waitForTimeout(2500);
  const info = await a.win.evaluate(() => ({
    url: location.href,
    title: document.title,
    bodyLen: document.body.innerHTML.length,
    ids: Array.from(document.querySelectorAll("[id]")).map((e) => e.id).slice(0, 80),
    headerText: document.querySelector("header")?.innerText || null,
  }));
  console.log(JSON.stringify(info, null, 2));
  console.log("shot:", await a.shot("boot"));
  console.log("logs.console:", a.logs.console.slice(0, 20));
  console.log("pageErrors:", a.logs.pageErrors.slice(0, 10));
  await a.close();
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
