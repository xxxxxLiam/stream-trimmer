/**
 * File: b14-url-chip-and-live.cjs
 * Path: audit/run-2/area-B/b14-url-chip-and-live.cjs
 * Description: Two URL-bar defects isolated with clean steps.
 *   A. youtube.com/live/<id> — the canonical link for a stream, and the shape this app
 *      exists for — is refused by the B-5 guard, because extractVideoId knows embed,
 *      shorts and v but not live. The same video as watch?v=<id> loads fine.
 *   B. Change + a link that resolves to the SAME video id leaves the URL bar open
 *      forever: the source chip only comes back when info.id CHANGES.
 */
const { boot, live, loadLive, stubRoot } = require("./lib.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/b2";
const STUB = process.env.STUB || `${SCRATCH}/stub2`;
const ROOT = process.env.ROOT || "/home/user/stream-trimmer";
const TAG = process.env.TAG || ROOT.split("/").pop();

const headerState = (a) =>
  a.win.evaluate(() => {
    const chip = Array.from(document.querySelectorAll("#ui-source-chip")).find((e) => e.offsetParent !== null);
    return {
      urlBarOpen: Boolean(chip?.querySelector('input[type="url"]')),
      chipText: (chip?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60),
      markOutDisabled: Array.from(document.querySelectorAll("#ui-mark-out")).find((e) => e.offsetParent !== null)?.disabled ?? null,
      alert: (Array.from(document.querySelectorAll("[role=alert]")).find((e) => e.offsetParent !== null)?.innerText || "").replace(/\s+/g, " ").slice(0, 120),
    };
  });

(async () => {
  console.log(`=== URL bar: /live/ and the stuck chip ===\nROOT=${ROOT}  TAG=${TAG}`);
  const stub = stubRoot(STUB);
  stub.write({
    info: { id: "mmmmmmmmmmm", title: "Stream M", duration: 30, uploader: "Ch" },
    transcriptLines: 8,
    infoFromUrl: true,
    titles: { mmmmmmmmmmm: "Stream M", nnnnnnnnnnn: "Other N" },
    delayMs: 0,
  });
  const a = await boot({ label: `b14-${TAG}`, root: ROOT, stub: STUB, viewport: { width: 1440, height: 900 } });

  console.log("\nA. a live-stream link");
  await loadLive(a, "https://www.youtube.com/live/mmmmmmmmmmm", 2600);
  console.log("  /live/mmmmmmmmmmm ->", JSON.stringify(await headerState(a)));
  await loadLive(a, "https://www.youtube.com/watch?v=mmmmmmmmmmm", 2600);
  console.log("  watch?v=mmmmmmmmmmm (the same video) ->", JSON.stringify(await headerState(a)));

  console.log("\nB. Change -> a link that resolves to the same video");
  await loadLive(a, "https://youtu.be/mmmmmmmmmmm", 2600);
  console.log("  youtu.be/mmmmmmmmmmm (same id) ->", JSON.stringify(await headerState(a)));
  console.log("  pane says it is loaded:", JSON.stringify((await live(a)).status));
  console.log("  shot:", await a.shot("same-id-url-bar-stuck"));
  await loadLive(a, "https://www.youtube.com/watch?v=mmmmmmmmmmm", 2600);
  console.log("  the very same link again ->", JSON.stringify(await headerState(a)));
  await loadLive(a, "https://www.youtube.com/watch?v=nnnnnnnnnnn", 2600);
  console.log("  a DIFFERENT video ->", JSON.stringify(await headerState(a)));
  console.log("  shot:", await a.shot("different-video-chip-back"));
  await a.close();
})().catch((e) => {
  console.error("SCRIPT FAILED", e);
  process.exit(1);
});
