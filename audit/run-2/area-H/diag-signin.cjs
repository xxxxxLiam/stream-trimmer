/**
 * File: diag-signin.cjs
 * Path: audit/run-2/area-H/diag-signin.cjs
 * Description: Diagnostic. Run 1's launcher got past the sign-in gate with a
 *   synthetic cookies.txt plus a stub that answers the --simulate auth probe.
 *   The fix threads touched that path (T10 items 5/6), so this checks what the
 *   gate actually does now, and whether the shipped "Continue without signing
 *   in (360p)" button is the honest way past it. Audit-only.
 */
const path = require("node:path");
const { launch } = require("./lib/launch.cjs");
const { buildStubRoot } = require("./lib/stub.cjs");

const OUT = path.join(__dirname, "out");
const STUB = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubH2R2";

(async () => {
  buildStubRoot(STUB);
  for (const variant of [
    { label: "cookie-only", opts: { signedIn: true, seed: { "clipper.dataDirConfirmed": true } } },
    { label: "skip-seeded", opts: { signedIn: true, seed: { "clipper.dataDirConfirmed": true, "clipper.signInSkipped": true } } },
  ]) {
    const a = await launch({
      label: `h2-diag-${variant.label}`, cwd: STUB,
      outDir: path.join(OUT, `diag-${variant.label}`), ...variant.opts,
    });
    await a.win.waitForSelector("header", { timeout: 20000 });
    for (const ms of [800, 2000, 4000, 7000]) {
      await a.win.waitForTimeout(ms === 800 ? 800 : ms - 800);
      const s = await a.win.evaluate(() => ({
        modal: Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')),
        scrim: Boolean(document.querySelector("div.fixed.inset-0")),
        chip: [...document.querySelectorAll("header button")]
          .map((b) => b.innerText.replace(/\s+/g, " ").trim())
          .filter((t) => /sign|expire/i.test(t)),
        continueBtn: [...document.querySelectorAll("button")]
          .map((b) => b.innerText.replace(/\s+/g, " ").trim())
          .filter((t) => /continue without/i.test(t)),
        markInDisabled: document.querySelector("#ui-mark-in")?.disabled ?? null,
      }));
      console.log(`${variant.label} @${ms}ms`, JSON.stringify(s));
    }
    const status = await a.win.evaluate(async () => {
      const r = await fetch(`${window.__API_BASE__}/api/auth/youtube/status`, {
        method: "POST", headers: { "content-type": "application/json" }, body: "{}",
      });
      return { status: r.status, body: (await r.text()).slice(0, 400) };
    });
    console.log(`${variant.label} auth status`, JSON.stringify(status));
    await a.shot("state");
    await a.close();
  }
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
