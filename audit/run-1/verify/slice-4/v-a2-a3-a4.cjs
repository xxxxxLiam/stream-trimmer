#!/usr/bin/env node
/**
 * A-2, A-3, A-4 verification, from their Steps. My own scripts.
 *
 * Harness substitution, disclosed: Electron's native showOpenDialog cannot be
 * clicked by the driver, so for the picker route I replace *Electron's* dialog
 * (via app.evaluate on the main process) with one that resolves to a chosen
 * path. No product code is touched: youtube:importCookies, importCookieFile,
 * validateCookieText, the atomic commit, verifyImported and the UI all run for
 * real. Where a finding can be reached by the drop route instead, I run that
 * too, because it converges on the same verifyImported().
 *
 * A-2: a good cookies.txt imported while the automatic sweep is still running
 *      is thrown away when the sweep reaches the end of its loop.
 * A-3: an already-expired cookies.txt imports as a success, modal closes,
 *      gate says connected while the chip says expired.
 * A-4: the EXPIRED_MESSAGE (with the date) is wiped by the sweep.
 *
 * usage: xvfb-run -a ... node v-a2-a3-a4.cjs [run]
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch, api, cookieTxt, SIGNED_IN_STDERR } = require("./lib.cjs");
const { makeStub, writeCfg, resetCalls } = require("./mkstub.cjs");

const RUN = process.argv[2] || "1";
const STUB = `/tmp/s4-stub-a234-${RUN}`;
const FILES = `/tmp/s4-cookiefiles-${RUN}`;

const QUIET = { exitCode: 0, stdout: "[download] 100% of 1.00MiB", stderr: "" };
const SIGNED_IN = { exitCode: 0, stdout: SIGNED_IN_STDERR };

const EXPIRED_EPOCH = 1000000000; // Sun 9 Sep 2001

async function stubPicker(app, filePath) {
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
  }, filePath);
}

const readUi = (win) =>
  win.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const chip = document.querySelector('header button[aria-haspopup="menu"]');
    return {
      modal: Boolean(d),
      heading: d?.querySelector("h2")?.textContent?.trim() ?? null,
      alert: d?.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
      statuses: Array.from(d?.querySelectorAll('[role="status"]') ?? []).map((e) =>
        (e.textContent || "").trim(),
      ),
      chip: chip ? chip.textContent.trim() : null,
      chipTitle: chip ? chip.getAttribute("title") : null,
      // Is the right next step on screen anywhere in the dialog, even without
      // the expiry message? (A-4 claims the message is the only place.)
      subtitle: d?.querySelector("h2")?.nextElementSibling?.textContent?.trim() ?? null,
      saysImportFresh: /Import a fresh cookies\.txt/.test(d?.textContent || ""),
      saysDrop: /Drop the file here/.test(d?.textContent || ""),
    };
  });

(async () => {
  fs.mkdirSync(FILES, { recursive: true });
  const good = path.join(FILES, "good-cookies.txt");
  const expired = path.join(FILES, "expired-cookies.txt");
  fs.writeFileSync(good, cookieTxt());
  fs.writeFileSync(expired, cookieTxt(EXPIRED_EPOCH));

  const report = { run: RUN };

  /* ============================ A-2 ============================ */
  {
    // Sweep slow (so there is a window to drop into) and inconclusive; the
    // imported file probes signed_in at once.
    makeStub(STUB, {
      auth: {
        browserDefault: { ...QUIET, delayMs: 1200 },
        default: { ...QUIET, delayMs: 1200 },
        app: SIGNED_IN,
      },
    });
    resetCalls(STUB);
    const a = await launch({
      mirror: "/tmp/s4-public",
      label: `a2-${RUN}`,
      cwd: STUB,
      seed: { "clipper.dataDirConfirmed": true },
    });
    const r = { timeline: [] };
    try {
      await a.win.waitForSelector("header", { timeout: 30000 });
      // Wait until the sweep is visibly under way ("Checking <browser>…").
      await a.win.waitForFunction(
        () => /Checking .+…/.test(document.querySelector('[role="dialog"]')?.textContent || ""),
        { timeout: 30000 },
      );
      r.sweepRunningAtDrop = await readUi(a.win);
      // Drop a valid cookies.txt on the window (the only import route open
      // while state.busy, because the picker button is "Checking…").
      r.pickerDisabledDuringSweep = await a.win.evaluate(() => {
        const b = document.querySelector('[role="dialog"] button.btn-primary');
        return { text: b?.textContent?.trim(), disabled: b?.disabled };
      });
      await a.win.evaluate((text) => {
        const file = new File([text], "cookies.txt", { type: "text/plain" });
        const dt = new DataTransfer();
        dt.items.add(file);
        window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
      }, cookieTxt());
      // Watch for the "signed in" window and then for the sweep's end.
      for (let i = 0; i < 70; i++) {
        await a.win.waitForTimeout(1000);
        const ui = await readUi(a.win);
        r.timeline.push({ t: i + 1, modal: ui.modal, chip: ui.chip, alert: ui.alert });
        if (i === 2) r.shotSignedIn = await a.shot("signed-in-after-drop");
        // Stop once the sweep has produced its end-of-loop message.
        if (ui.alert && /None of your browsers|No supported browser/.test(ui.alert)) break;
      }
      r.endState = await readUi(a.win);
      r.shotEnd = await a.shot("after-sweep-finished");
      r.cookieFileStillOnDisk = fs.existsSync(path.join(a.userDataDir, "yt-cookies.txt"));
      r.persisted = a.readState();
      r.everSignedIn = r.timeline.some((x) => x.chip === "Signed in" && x.modal === false);
      r.lockedOutAfterwards = r.endState.modal === true;
    } catch (e) {
      r.error = String(e);
    }
    await a.close();
    report.a2 = r;
  }

  /* ============================ A-3 ============================ */
  for (const route of ["picker", "drop"]) {
    makeStub(STUB, { auth: { default: SIGNED_IN, app: SIGNED_IN, browserDefault: QUIET } });
    const a = await launch({
      mirror: "/tmp/s4-public",
      label: `a3-${RUN}-${route}`,
      cwd: STUB,
      seed: { "clipper.dataDirConfirmed": true },
    });
    const r = { route };
    try {
      await a.win.waitForSelector("header", { timeout: 30000 });
      await a.win.waitForFunction(
        () => {
          const b = document.querySelector('[role="dialog"] button.btn-primary');
          return b && !b.disabled;
        },
        { timeout: 60000 },
      );
      if (route === "picker") {
        await stubPicker(a.app, expired);
        await a.win.click('[role="dialog"] button.btn-primary');
      } else {
        await a.win.evaluate((text) => {
          const file = new File([text], "cookies.txt", { type: "text/plain" });
          const dt = new DataTransfer();
          dt.items.add(file);
          window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
        }, cookieTxt(EXPIRED_EPOCH));
      }
      await a.win.waitForTimeout(6000);
      r.ui = await readUi(a.win);
      r.shot = await a.shot(`imported-expired-${route}`);
      r.persisted = a.readState();
      r.probe = await a.win.evaluate(() => window.electronAPI.probeYouTube());
      r.statusEndpoint = await api(a.win, "POST", "/api/auth/youtube/status", { browser: "app" }).then((x) => x.json);
      r.cookieFileOnDisk = fs.existsSync(path.join(a.userDataDir, "yt-cookies.txt"));
      // Checklist row: does the setup list think sign-in is done?
      r.importAccepted = r.ui.modal === false;
    } catch (e) {
      r.error = String(e);
    }
    await a.close();
    report[`a3_${route}`] = r;
  }

  /* ============================ A-4 ============================ */
  {
    // Returning user: an expired cookies.txt already on disk at launch.
    makeStub(STUB, {
      auth: { default: { ...QUIET, delayMs: 900 }, browserDefault: { ...QUIET, delayMs: 900 }, app: QUIET },
    });
    const a = await launch({
      mirror: "/tmp/s4-public",
      label: `a4-${RUN}`,
      cwd: STUB,
      cookieFile: cookieTxt(EXPIRED_EPOCH),
      seed: { "clipper.dataDirConfirmed": true, "clipper.authSource": "app" },
    });
    const r = { samples: [] };
    try {
      await a.win.waitForSelector("header", { timeout: 30000 });
      // Sample the alert from the first frame the modal is up, all the way
      // through the sweep.
      const deadline = Date.now() + 45000;
      let sawExpiryMessage = false;
      let n = 0;
      while (Date.now() < deadline) {
        const ui = await readUi(a.win);
        if (ui.modal) {
          r.samples.push({
            ms: n * 300,
            heading: ui.heading,
            alert: ui.alert,
            statuses: ui.statuses,
            chip: ui.chip,
            subtitle: ui.subtitle,
            saysImportFresh: ui.saysImportFresh,
            chipTitle: ui.chipTitle,
          });
          if (ui.alert && /expired on|has expired/.test(ui.alert)) sawExpiryMessage = true;
          if (ui.alert && /None of your browsers|No supported browser/.test(ui.alert)) break;
        }
        n++;
        await a.win.waitForTimeout(300);
      }
      r.sawExpiryMessageAtAnySample = sawExpiryMessage;
      r.expiryMessageSamples = r.samples.filter((s) => s.alert && /expired on|has expired/.test(s.alert)).length;
      r.totalSamples = r.samples.length;
      r.finalAlert = r.samples.length ? r.samples[r.samples.length - 1].alert : null;
      r.finalHeading = r.samples.length ? r.samples[r.samples.length - 1].heading : null;
      r.shot = await a.shot("a4-expired-returning");
      // What the message WOULD have said: the date the app knows.
      r.probe = await a.win.evaluate(() => window.electronAPI.probeYouTube());
    } catch (e) {
      r.error = String(e);
    }
    await a.close();
    report.a4 = r;
  }

  /* A-4 control: with the sweep suppressed is the expiry message shown at all?
   * sweepBrowsers only runs once per session (module-level autoSwept), so a
   * reload inside the same page context cannot be used; instead I let the
   * sweep finish and then re-read, and separately check the string exists in
   * the bundle so "never rendered" is not a false negative. */
  {
    const bundleDir = "/tmp/s4-public/dist/assets";
    const js = fs.readdirSync(bundleDir).find((f) => f.endsWith(".js"));
    const src = fs.readFileSync(path.join(bundleDir, js), "utf8");
    report.a4_messageExistsInBundle = src.includes("Import a fresh cookies.txt to get 1080p again");
  }

  const outFile = path.join(__dirname, "out", `a2-a3-a4-run${RUN}.json`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2).slice(0, 12000));
  console.log("\nwrote", outFile);
})().catch((e) => { console.error(e); process.exit(1); });
