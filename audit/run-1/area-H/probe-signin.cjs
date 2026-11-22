/**
 * File: probe-signin.cjs
 * Path: audit/run-1/area-H/probe-signin.cjs
 * Description: Confirms area H can reach the workspace behind the sign-in
 *   modal, so every later screen is measurable. Audit-only.
 */
const { launch } = require("./lib/launch.cjs");
const { buildStubRoot } = require("./lib/stub.cjs");

const STUB = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubH2";
const OUT = "/home/user/stream-trimmer/audit/run-1/area-H/out/probe-signin";

(async () => {
  buildStubRoot(STUB);
  const a = await launch({ label: "H-signin", cwd: STUB, outDir: OUT, signedIn: true, seed: {} });
  await a.win.waitForTimeout(6000);
  const st = await a.win.evaluate(() => ({
    modal: !!document.querySelector('[aria-labelledby="youtube-connect-title"]'),
    chip: document.querySelector("header")?.innerText || "",
    marks: !!document.querySelector("#ui-mark-in"),
  }));
  console.log(JSON.stringify(st, null, 2));
  console.log("shot:", await a.shot("after-restore"));
  console.log(a.logs.stdout.join("").split("\n").filter((l) => /auth|cookie|probe/i.test(l)).slice(-12).join("\n"));
  await a.close();
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
