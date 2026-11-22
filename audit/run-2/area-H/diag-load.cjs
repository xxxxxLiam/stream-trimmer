/**
 * File: diag-load.cjs
 * Path: audit/run-2/area-H/diag-load.cjs
 * Description: Diagnostic. Why the stub video does not load after the sign-in
 *   gate is skipped. Audit-only.
 */
const path = require("node:path");
const { buildStubRoot } = require("./lib/stub.cjs");
const H = require("./lib/h2.cjs");

const OUT = path.join(__dirname, "out");
const STUB = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubH2R2";

(async () => {
  buildStubRoot(STUB);
  for (const mode of ["skipSeeded", "clickSkip"]) {
    const a = await H.open({
      label: `h2-diagload-${mode}`, cwd: STUB, outDir: path.join(OUT, `diagload-${mode}`),
      skipSeeded: mode === "skipSeeded",
    });
    await a.win.waitForTimeout(1000);
    await a.win.fill('input[type="url"]', H.URL_OK);
    await a.win.keyboard.press("Enter");
    for (const ms of [1000, 3000, 6000, 10000]) {
      await a.win.waitForTimeout(ms === 1000 ? 1000 : ms - 1000);
      const s = await a.win.evaluate(() => ({
        markInDisabled: document.querySelector("#ui-mark-in")?.disabled ?? null,
        urlValue: document.querySelector('input[type="url"]')?.value?.slice(0, 50),
        alerts: [...document.querySelectorAll('[role="alert"],[role="status"]')]
          .map((e) => e.innerText.replace(/\s+/g, " ").trim().slice(0, 120)).filter(Boolean),
        title: document.title,
        bodyHas: ["Loading", "Load a video", "could not", "error", "Sign in"]
          .filter((t) => document.body.innerText.includes(t)),
      }));
      console.log(`${mode} @${ms}`, JSON.stringify(s));
    }
    console.log(`${mode} logs`, JSON.stringify({
      console: a.logs.console.slice(-12), errors: a.logs.pageErrors.slice(-5),
      stderr: a.logs.stderr.join("").slice(-800),
    }));
    await a.shot("after-load");
    await a.close();
  }
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
