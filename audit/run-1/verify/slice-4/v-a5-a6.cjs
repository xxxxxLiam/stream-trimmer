#!/usr/bin/env node
/**
 * A-5 and A-6 verification, from their Steps.
 *
 * A-5 claims: one sweep = 18 yt-dlp processes (6 browsers x 3 probe videos);
 * three presses of "Check browsers again" = 54; "Forget this sign-in" starts
 * another whole sweep; no cancel; the picker button is disabled while busy.
 * I count the processes from my own stub's argv log, and I separate the
 * sweep's calls from everything else (--version, /api/info) by looking for
 * --cookies-from-browser.
 *
 * Disproof angle for A-5: is 18 a property of the app, or of my stub's
 * output? The retry loop only fires on `inconclusive`/`probe_unavailable`,
 * so I measure three stub verdicts:
 *   quiet   -> inconclusive  (progress lines only)
 *   signin  -> signed_out    (real yt-dlp signed-out text)
 *   missing -> profile_missing
 * If 18 only happens on `inconclusive`, the finding's "every sweep" is wrong.
 *
 * A-6 claims the renderer turns `inconclusive` into a hard failed sign-in,
 * while the server documents it as "not a verdict" and authProbeVerdict maps
 * it to "ok". I check the UI text, the "Technical details" block, and that a
 * download really is allowed on the same verdict.
 *
 * usage: xvfb-run -a ... node v-a5-a6.cjs [run]
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch, api, cookieTxt, SIGNED_IN_STDERR } = require("./lib.cjs");
const { makeStub, writeCfg, calls, resetCalls } = require("./mkstub.cjs");

const RUN = process.argv[2] || "1";
const STUB = `/tmp/s4-stub-a56-${RUN}`;

const SPECS = {
  // progress lines only: nothing the classifier recognises -> inconclusive
  quiet: { exitCode: 0, stdout: "[download] 100% of 1.00MiB", stderr: "" },
  // real yt-dlp signed-out text -> signed_out
  signin: {
    exitCode: 1,
    stderr:
      "ERROR: [youtube] jNQXAC9IVRw: Sign in to confirm you're a human. Use --cookies-from-browser or --cookies for the authentication.",
  },
  // -> profile_missing
  missing: {
    exitCode: 1,
    stderr: "ERROR: could not find chrome cookies database",
  },
};

const sweepCalls = (root) =>
  calls(root).filter((c) => c.argv.includes("--cookies-from-browser"));

function perBrowser(list) {
  const out = {};
  for (const c of list) {
    const b = c.argv[c.argv.indexOf("--cookies-from-browser") + 1];
    out[b] = (out[b] || 0) + 1;
  }
  return out;
}

async function readModal(win) {
  return win.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const chip = document.querySelector('header button[aria-haspopup="menu"]');
    return {
      modal: Boolean(d),
      alert: d?.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
      reason: d?.querySelector("pre")?.textContent ?? null,
      notice: d?.querySelector('p[role="status"]')?.textContent?.trim() ?? null,
      working: Array.from(d?.querySelectorAll('[role="status"]') ?? []).map((e) =>
        (e.textContent || "").trim(),
      ),
      primaryButton:
        d?.querySelector("button.btn-primary")?.textContent?.trim() ?? null,
      primaryDisabled: d?.querySelector("button.btn-primary")?.disabled ?? null,
      anyCancel: Array.from(d?.querySelectorAll("button") ?? []).some((b) =>
        /stop|cancel|abort/i.test(b.textContent || ""),
      ),
      chip: chip ? chip.textContent.trim() : null,
    };
  });
}

(async () => {
  const report = { run: RUN, a5: {}, a6: {} };

  /* ---------------- A-5: count a cold-boot sweep, per verdict ---------------- */
  for (const [name, spec] of Object.entries(SPECS)) {
    makeStub(STUB, { auth: { default: spec, browserDefault: spec, app: spec } });
    resetCalls(STUB);
    const a = await launch({
      mirror: "/tmp/s4-public",
      label: `a5-${RUN}-${name}`,
      cwd: STUB,
      seed: { "clipper.dataDirConfirmed": true },
    });
    const r = {};
    try {
      await a.win.waitForSelector("header", { timeout: 30000 });
      // Wait until the sweep has stopped spawning.
      let last = -1;
      for (let i = 0; i < 80; i++) {
        await a.win.waitForTimeout(500);
        const n = sweepCalls(STUB).length;
        const modal = await readModal(a.win);
        if (n === last && modal.primaryButton !== "Checking…") break;
        last = n;
      }
      const sweep = sweepCalls(STUB);
      r.sweepProcesses = sweep.length;
      r.perBrowser = perBrowser(sweep);
      r.probeUrlsPerBrowser = (() => {
        const m = {};
        for (const c of sweep) {
          const b = c.argv[c.argv.indexOf("--cookies-from-browser") + 1];
          const u = c.argv.find((x) => /^https?:/.test(x));
          (m[b] = m[b] || []).push((u || "").split("v=")[1]);
        }
        return m;
      })();
      r.allCalls = calls(STUB).length;
      r.modalAfterSweep = await readModal(a.win);
      r.shot = await a.shot(`sweep-${name}`);

      // Three presses of "Check browsers again", as the finding says.
      resetCalls(STUB);
      for (let i = 0; i < 3; i++) {
        await a.win.click('button:has-text("Check browsers again")', { timeout: 10000 });
        // Wait for this sweep to finish before the next press, exactly as a
        // user must: the button is disabled while busy.
        await a.win
          .waitForFunction(
            () => {
              const d = document.querySelector('[role="dialog"]');
              const b = Array.from(d?.querySelectorAll("button") ?? []).find((x) =>
                /Check browsers again/.test(x.textContent || ""),
              );
              return b && !b.disabled;
            },
            { timeout: 60000 },
          )
          .catch(() => {});
      }
      await a.win.waitForTimeout(1500);
      r.threePresses = sweepCalls(STUB).length;

      // Is the import button really blocked while a sweep runs, with no cancel?
      resetCalls(STUB);
      writeCfg(STUB, { auth: { default: { ...spec, delayMs: 800 }, browserDefault: { ...spec, delayMs: 800 }, app: spec } });
      await a.win.click('button:has-text("Check browsers again")', { timeout: 10000 });
      await a.win.waitForTimeout(1200);
      r.duringSweep = await readModal(a.win);
      r.duringSweepPickerClick = await a.win
        .click('button:has-text("Choose cookies.txt")', { timeout: 2000 })
        .then(() => "clicked")
        .catch((e) => `BLOCKED: ${String(e).split("\n")[0].slice(0, 70)}`);
      writeCfg(STUB, { auth: { default: spec, browserDefault: spec, app: spec } });
    } catch (e) {
      r.error = String(e);
    }
    await a.close();
    report.a5[name] = r;
  }

  /* ------- A-5 second half: does "Forget this sign-in" start a sweep? ------- */
  {
    makeStub(STUB, {
      auth: {
        default: { exitCode: 0, stdout: SIGNED_IN_STDERR },
        app: { exitCode: 0, stdout: SIGNED_IN_STDERR },
        browserDefault: SPECS.quiet,
      },
    });
    const a = await launch({
      mirror: "/tmp/s4-public",
      label: `a5-${RUN}-disconnect`,
      cwd: STUB,
      cookieFile: cookieTxt(),
      seed: { "clipper.dataDirConfirmed": true, "clipper.authSource": "app" },
    });
    const r = {};
    try {
      await a.win.waitForSelector("header", { timeout: 30000 });
      await a.win.waitForTimeout(4000);
      r.modalBefore = (await readModal(a.win)).modal;
      resetCalls(STUB);
      // Find and use the chip's "Forget this sign-in".
      r.menuOpened = await a.win
        .click('header button[aria-haspopup="menu"]', { timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      await a.win.waitForTimeout(500);
      r.forgetClicked = await a.win
        .click('button:has-text("Forget this sign-in")', { timeout: 5000 })
        .then(() => true)
        .catch((e) => String(e).split("\n")[0].slice(0, 70));
      await a.win.waitForTimeout(12000);
      r.sweepProcessesAfterDisconnect = sweepCalls(STUB).length;
      r.modalAfter = await readModal(a.win);
      r.shot = await a.shot("after-forget");
    } catch (e) {
      r.error = String(e);
    }
    await a.close();
    report.a5.disconnect = r;
  }

  /* ---------------- A-6: what `inconclusive` does, both ends ---------------- */
  {
    // (a) sweep with inconclusive on every browser
    const r = { sweep: report.a5.quiet?.modalAfterSweep ?? null };
    // (b) the server's own verdict for the same output, on a download that
    //     needs a session, with a cookies.txt on disk.
    makeStub(STUB, { auth: { default: SPECS.quiet, app: SPECS.quiet, browserDefault: SPECS.quiet } });
    const a = await launch({
      mirror: "/tmp/s4-public",
      label: `a6-${RUN}-restored`,
      cwd: STUB,
      cookieFile: cookieTxt(),
      seed: { "clipper.dataDirConfirmed": true, "clipper.authSource": "app" },
    });
    try {
      await a.win.waitForSelector("header", { timeout: 30000 });
      await a.win.waitForTimeout(6000);
      r.restoredModal = await readModal(a.win);
      r.statusEndpoint = await api(a.win, "POST", "/api/auth/youtube/status", { browser: "app" })
        .then((x) => x.json);
      // The server lets a 1080p download through on the same verdict?
      r.download1080 = await api(a.win, "POST", "/api/download", {
        url: "https://www.youtube.com/watch?v=stub0000001",
        segments: [{ start: 1, end: 4 }],
        format: "mp4",
        quality: "1080",
        deliver: "path",
        cookiesFromBrowser: "app",
      }).then((x) => ({ status: x.status, code: x.json?.code, path: x.json?.path }));
      r.shot = await a.shot("a6-restored-inconclusive");
    } catch (e) {
      r.error = String(e);
    }
    await a.close();
    report.a6 = r;
  }

  const outFile = path.join(__dirname, "out", `a5-a6-run${RUN}.json`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log("\nwrote", outFile);
})().catch((e) => { console.error(e); process.exit(1); });
