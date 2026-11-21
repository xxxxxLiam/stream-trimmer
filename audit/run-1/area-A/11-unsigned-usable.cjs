/**
 * A-11: evidence for the first-run gate's severity — the engine happily serves
 * a signed-out user at 360p, so the blocking modal denies a job the product
 * itself supports.
 */
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");
const L = require("./lib.cjs");

(async () => {
  L.stub({ app: { exitCode: 0 }, browser: { exitCode: 0 }, writeMedia: true, progress: [0, 100] });
  const a = await launchApp({ label: "A-11", cwd: L.STUB, outDir: `${L.OUT}/A-11` });
  try {
    await a.win.waitForSelector('[role="dialog"]', { timeout: 20000 });
    await a.win.waitForTimeout(4500);
    console.log("signed in?", await a.win.evaluate(() => !document.querySelector('[role="dialog"]')));

    const post = (path, body) =>
      a.win.evaluate(
        async ({ path, body }) => {
          const r = await fetch(`${window.__API_BASE__}${path}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          return { status: r.status, body: (await r.text()).slice(0, 260) };
        },
        { path, body },
      );

    console.log(
      "POST /api/info with no session ->",
      JSON.stringify(await post("/api/info", { url: "https://www.youtube.com/watch?v=stub0000001" })),
    );
    console.log(
      "POST /api/download 360p with no session ->",
      JSON.stringify(
        await post("/api/download", {
          url: "https://www.youtube.com/watch?v=stub0000001",
          format: "mp4",
          quality: "360",
          start: 1,
          end: 5,
        }),
      ),
    );
    console.log(
      "POST /api/download best with no session ->",
      JSON.stringify(
        await post("/api/download", {
          url: "https://www.youtube.com/watch?v=stub0000001",
          format: "mp4",
          quality: "best",
          start: 1,
          end: 5,
        }),
      ),
    );
  } finally {
    await a.close();
  }
})();
