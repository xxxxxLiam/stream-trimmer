#!/usr/bin/env node
/**
 * AF-03 — A-2: a cookies.txt imported mid-sweep must survive the sweep's own
 * late result, for BOTH a late failure and a late success.
 *
 * Case a: every browser answers profile_missing, slowly; a valid file is
 *         dropped at ~2s. The sweep's end-of-run write must not fire.
 * Case b: the LAST browser answers signed_in, slowly; the same drop happens
 *         first. markConnected(browser) must not replace source "app".
 */
const { launch, writeStub, clearCalls, calls, jar, AUTH_TEXT } = require("./lib.cjs");

const DROP = `(async () => {
  const text = ${JSON.stringify(jar())};
  const file = new File([text], "cookies.txt", { type: "text/plain" });
  const dt = new DataTransfer();
  dt.items.add(file);
  window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  return true;
})()`;

async function snap(win) {
  return win.evaluate(() => ({
    modal: document.querySelectorAll('[role="dialog"]').length > 0,
    chip: document.getElementById("help-anchor-youtube-status")?.textContent?.trim() || null,
    alert: document.querySelector('[role="dialog"] [role="alert"]')?.textContent?.trim() || null,
    working:
      Array.from(document.querySelectorAll('[role="dialog"] [role="status"]')).map((e) =>
        e.textContent.trim(),
      ) || [],
  }));
}

async function runCase(label, perSource, R) {
  writeStub({
    auth: { ...AUTH_TEXT.profile_missing, delayMs: 1500, perSource },
    infoStage: { exitCode: 0 },
    downloadStage: { exitCode: 0 },
  });
  clearCalls();
  const a = await launch({ label: `af-03-${label}`, seed: { "clipper.dataDirConfirmed": true } });
  const out = { samples: [] };
  try {
    await a.win.waitForSelector('[role="dialog"]', { timeout: 30000 });
    await a.win.waitForTimeout(2000);
    out.beforeDrop = await snap(a.win);
    out.dropped = await a.win.evaluate(DROP);
    for (let i = 0; i < 28; i++) {
      await a.win.waitForTimeout(1000);
      out.samples.push({ t: `t+${i + 1}s`, ...(await snap(a.win)) });
      if (i === 2) out.shotAfterDrop = await a.shot("after-drop");
    }
    out.shotEnd = await a.shot("sweep-finished");
    out.final = await snap(a.win);
    out.probe = await a.win.evaluate(() => window.electronAPI.probeYouTube());
    out.state = a.readState();
    out.sourcesProbed = calls()
      .filter((c) => c.argv.includes("--simulate"))
      .map((c) => {
        const i = c.argv.indexOf("--cookies-from-browser");
        return i >= 0 ? c.argv[i + 1] : c.argv.includes("--cookies") ? "app" : "?";
      });
  } finally {
    a.save(`af-03-${label}.json`, out);
    await a.close();
  }
  R[label] = out;
}

async function main() {
  const R = {};
  // The imported file itself must verify, or there is no sign-in to clobber.
  const app = { app: { ...AUTH_TEXT.signed_in, delayMs: 200 } };
  // (a) late failure: every browser profile_missing
  await runCase("late-failure", app, R);
  // (b) late success: a browser answers signed_in after the import landed
  await runCase("late-success", { ...app, safari: AUTH_TEXT.signed_in, edge: AUTH_TEXT.signed_in, chromium: AUTH_TEXT.signed_in }, R);

  const summarise = (o) => ({
    beforeDrop: o.beforeDrop,
    afterDrop: o.samples[1],
    final: o.final,
    connectedSource: o.state["clipper.authSource"],
    skipped: o.state["clipper.signInSkipped"],
    probe: o.probe,
    sourcesProbed: o.sourcesProbed,
    everReverted: o.samples.some((s) => s.modal === true && o.samples.indexOf(s) > 2),
  });
  console.log(
    JSON.stringify(
      { "late-failure": summarise(R["late-failure"]), "late-success": summarise(R["late-success"]) },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
