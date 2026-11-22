/**
 * File: b04-b5-urls-and-cut.cjs
 * Path: audit/run-2/area-B/b04-b5-urls-and-cut.cjs
 * Description: B-5 — a URL with no video id loading as a source and "Cut as one file"
 *   then doing nothing. Drives every URL shape that reaches the same code: channel,
 *   @handle, /c/, playlist, watch?v=…&list=…, Shorts, youtu.be, live/, embed/, a bare
 *   word, whitespace, a 10k string, and a timestamped link. Then, for anything the app
 *   still accepts as a source, marks a range and clicks Cut and says what happened.
 *
 *   Also re-reads B-17 (the validator's own words) while it is here.
 */
const fs = require("node:fs");
const { boot, live, loadLive, markLive, stubRoot, S } = require("./lib.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/b2";
const STUB = process.env.STUB || `${SCRATCH}/stub`;
const ROOT = process.env.ROOT || "/home/user/stream-trimmer";
const TAG = process.env.TAG || ROOT.split("/").pop();
const CLIPS = `${SCRATCH}/clips-b04-${TAG}`;

const CASES = [
  ["channel @handle", "https://www.youtube.com/@somechannel"],
  ["channel /c/", "https://www.youtube.com/c/somechannel"],
  ["channel /channel/", "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"],
  ["playlist", "https://www.youtube.com/playlist?list=PLabcdefghij"],
  ["watch + list", "https://www.youtube.com/watch?v=stub0000001&list=PLabcdefghij"],
  ["shorts", "https://www.youtube.com/shorts/stub0000001"],
  ["youtu.be", "https://youtu.be/stub0000001"],
  ["live/", "https://www.youtube.com/live/stub0000001"],
  ["embed/", "https://www.youtube.com/embed/stub0000001"],
  ["results search", "https://www.youtube.com/results?search_query=cats"],
  ["bare word", "hello"],
  ["whitespace", "   "],
  ["non-youtube", "https://vimeo.com/12345"],
  ["timestamped + tracking", "https://www.youtube.com/watch?v=stub0000001&t=90s&si=TRACKING"],
  ["10k chars", `https://www.youtube.com/watch?v=stub0000001&x=${"a".repeat(10000)}`],
];

(async () => {
  console.log(`=== B-5 / B-17 URL shapes ===\nROOT=${ROOT}  TAG=${TAG}\n`);
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  const stub = stubRoot(STUB);
  stub.write({ info: { id: "stub0000001", title: "Stub video", duration: 30, uploader: "Ch" }, transcriptLines: 8 });

  const a = await boot({
    label: `b04-${TAG}`,
    root: ROOT,
    stub: STUB,
    viewport: { width: 1440, height: 900 },
    seed: { "clipper.saveDir": CLIPS, "clipper.saveDirs": [CLIPS] },
  });

  for (const [name, url] of CASES) {
    await loadLive(a, url, 2300);
    const s = await a.win.evaluate(() => {
      const vis = (sel) =>
        Array.from(document.querySelectorAll(sel)).find((e) => e.offsetParent !== null) || null;
      const pane = vis("#ui-mark-in")?.closest("div.absolute.inset-0") || document.body;
      const t = (sel) => {
        const e = pane.querySelector(sel);
        return e ? (e.innerText || "").replace(/\s+/g, " ").trim() : null;
      };
      return {
        source: t("#ui-source-chip"),
        urlBarStillOpen: Boolean(pane.querySelector('input[type="url"]')),
        markDisabled: pane.querySelector("#ui-mark-out")?.disabled ?? null,
        inValue: pane.querySelector("#ui-mark-in")?.value ?? null,
        alert: t("[role=alert]"),
        status: t("#ui-col-centre [role=status]"),
        transcript: t("#ui-col-transcript header span[aria-live=polite]"),
      };
    });
    console.log(`[${name}] ${JSON.stringify(s)}`);
  }
  console.log("shot:", await a.shot("url-last-case"));

  // The B-5 payoff: take a channel URL, and if the app still accepts it, mark and Cut.
  console.log("\n--- channel URL -> mark -> Cut as one file ---");
  await loadLive(a, "https://www.youtube.com/@somechannel", 2500);
  let before = await live(a);
  console.log("pane:", JSON.stringify(before));
  if (before && before.markOut !== null && before.cutDisabled === false) {
    await markLive(a, "00:00:05", "00:00:15").catch(() => {});
    await a.win.click(S.add).catch(() => {});
    await a.win.waitForTimeout(400);
    stub.clearCalls();
    await a.win.click(S.cut).catch((e) => console.log("cut click:", String(e).slice(0, 80)));
    await a.win.waitForTimeout(6000);
    console.log("after clicking Cut:", JSON.stringify(await live(a)));
    console.log("files written:", JSON.stringify(fs.readdirSync(CLIPS)));
    console.log("engine calls:", stub.calls().length);
  } else {
    console.log("the app refused the channel URL as a source; nothing to mark or cut");
  }
  console.log("shot:", await a.shot("channel-cut-attempt"));

  // And the same for a playlist URL, which run 1 also reached.
  console.log("\n--- playlist URL -> mark -> Cut ---");
  await loadLive(a, "https://www.youtube.com/playlist?list=PLabcdefghij", 2500);
  before = await live(a);
  console.log("pane:", JSON.stringify(before));
  if (before && before.cutDisabled === false && before.markOut !== null && before.source && !before.urlBarStillOpen) {
    await markLive(a, "00:00:05", "00:00:15").catch(() => {});
    await a.win.click(S.add).catch(() => {});
    await a.win.click(S.cut).catch(() => {});
    await a.win.waitForTimeout(5000);
    console.log("after clicking Cut:", JSON.stringify(await live(a)));
    console.log("files:", JSON.stringify(fs.readdirSync(CLIPS)));
  }
  await a.close();
})().catch((e) => {
  console.error("SCRIPT FAILED", e);
  process.exit(1);
});
