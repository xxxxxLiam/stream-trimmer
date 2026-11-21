#!/usr/bin/env node
/**
 * F-9 verification, from the finding's Steps: press the header's "Check" with
 * no reachable release feed and this Linux build not running as an AppImage,
 * then sample the update strip. The claim is that the strip says "Up to date"
 * although no check ever completed.
 *
 * Disproof angles tried:
 *   - does autoUpdater actually resolve, or does it reject (in which case the
 *     strip would say "Update check failed" and the finding is wrong)? I read
 *     the handler's own return value over the real IPC channel as well as
 *     watching the strip.
 *   - is this an artefact of the container's network block, or of the handler
 *     treating "no version" as "none"? I compare the IPC result with what the
 *     strip says, and read the main log for an update-not-available event.
 *
 * usage: xvfb-run -a --server-args="-screen 0 1440x900x24" node v-f9.cjs [run]
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch, cookieTxt, SIGNED_IN_STDERR } = require("./lib.cjs");
const { makeStub } = require("./mkstub.cjs");

const RUN = process.argv[2] || "1";
const STUB = `/tmp/s4-stub-f9-${RUN}`;

(async () => {
  makeStub(STUB, {
    auth: { default: { exitCode: 0, stdout: SIGNED_IN_STDERR }, app: { exitCode: 0, stdout: SIGNED_IN_STDERR } },
  });
  const a = await launch({
    mirror: "/tmp/s4-public",
    label: `f9-${RUN}`,
    cwd: STUB,
    cookieFile: cookieTxt(),
    seed: { "clipper.dataDirConfirmed": true, "clipper.authSource": "app" },
  });
  const r = { run: RUN, samples: [] };
  try {
    await a.win.waitForSelector("header", { timeout: 30000 });
    await a.win.waitForTimeout(3000);

    r.checkButton = await a.win.evaluate(() => {
      const b = Array.from(document.querySelectorAll("header button")).find(
        (x) => (x.textContent || "").trim() === "Check",
      );
      return b ? { text: b.textContent.trim(), title: b.getAttribute("title") } : null;
    });

    const readStrip = () =>
      a.win.evaluate(() => {
        const header = document.querySelector("header");
        const spans = Array.from(header?.querySelectorAll("span") ?? []).map((s) => ({
          text: (s.textContent || "").trim(),
          title: s.getAttribute("title"),
        }));
        const interesting = spans.filter((s) =>
          /update|date|Checking|Downloading|ready|failed/i.test(s.text),
        );
        return {
          strip: interesting,
          headerText: (header?.textContent || "").replace(/\s+/g, " ").slice(0, 160),
        };
      });

    r.before = await readStrip();
    // Fire the real handler and keep its answer.
    const ipcPromise = a.win.evaluate(() => window.electronAPI.checkForUpdates());
    // Press the real button too (that is what the user does); the handler is
    // idempotent for this purpose.
    await a.win
      .evaluate(() => {
        const b = Array.from(document.querySelectorAll("header button")).find(
          (x) => (x.textContent || "").trim() === "Check",
        );
        b?.click();
      })
      .catch(() => {});

    for (let i = 0; i < 40; i++) {
      await a.win.waitForTimeout(500);
      const s = await readStrip();
      r.samples.push({ ms: (i + 1) * 500, strip: s.strip });
    }
    r.ipcResult = await ipcPromise.catch((e) => ({ threw: String(e) }));
    r.after = await readStrip();
    r.shot = await a.shot("after-check");

    const texts = r.samples.map((s) => s.strip.map((x) => x.text).join(" | "));
    r.distinctStripTexts = [...new Set(texts)];
    r.saidUpToDate = texts.some((t) => /Up to date/i.test(t));
    r.saidFailed = texts.some((t) => /failed/i.test(t));
    r.msUpToDateShown = texts.filter((t) => /Up to date/i.test(t)).length * 500;
    r.mainLog = a.logs.stdout.join("").split("\n").filter((l) => /updater|AppImage|update-not-available/i.test(l));
    // The userData log file, which is where the finding reads from.
    const logFile = path.join(a.userDataDir, "logs", "main.log");
    r.logFileLines = fs.existsSync(logFile)
      ? fs.readFileSync(logFile, "utf8").split("\n").filter((l) => /updater|AppImage|update/i.test(l))
      : ["<no log file>"];
  } catch (e) {
    r.error = String(e);
  }
  await a.close();

  const outFile = path.join(__dirname, "out", `f9-run${RUN}.json`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(r, null, 2));
  console.log(
    JSON.stringify(
      {
        checkButton: r.checkButton,
        distinctStripTexts: r.distinctStripTexts,
        saidUpToDate: r.saidUpToDate,
        saidFailed: r.saidFailed,
        msUpToDateShown: r.msUpToDateShown,
        ipcResult: r.ipcResult,
        mainLog: r.mainLog,
        logFileLines: r.logFileLines,
        error: r.error,
      },
      null,
      2,
    ),
  );
  console.log("\nwrote", outFile);
})().catch((e) => { console.error(e); process.exit(1); });
