/**
 * Area D smoke test: does the harness drive the app, and what does the
 * renderer expose on window.electronAPI?
 */
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");

const STUB = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubD";
const OUT = "/home/user/stream-trimmer/audit/run-1/area-D/out";

(async () => {
  const a = await launchApp({
    label: "D-smoke",
    cwd: STUB,
    outDir: `${OUT}/smoke`,
    seed: { "clipper.dataDirConfirmed": true },
  });
  try {
    await a.win.waitForSelector("header", { timeout: 20000 });
    const api = await a.win.evaluate(() => {
      const out = { top: [], editor: [] };
      const w = window;
      if (w.electronAPI) {
        for (const k in w.electronAPI) out.top.push(`${k}:${typeof w.electronAPI[k]}`);
        if (w.electronAPI.editor) {
          for (const k in w.electronAPI.editor) out.editor.push(`${k}:${typeof w.electronAPI.editor[k]}`);
        }
      }
      out.apiBase = w.__API_BASE__ || null;
      return out;
    });
    console.log(JSON.stringify(api, null, 2));
    console.log("shot:", await a.shot("boot"));
    const txt = await a.win.evaluate(() => document.body.innerText.slice(0, 2500));
    console.log("--- body ---\n" + txt);
  } finally {
    await a.close();
  }
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
