/**
 * File: downloadFormat.test.ts
 * Path: server/downloadFormat.test.ts
 * Description: Pins the two strings that decided a user got 360p from a 1080p
 * video — the format ladder and the player-client list — by reading them off
 * the command the real server builds, not off a copy in the test. Both were
 * tuned for a YouTube that no longer exists, and both are the kind of thing
 * that gets "tidied" back into the broken shape by someone who does not know
 * what they were worth.
 *
 * Then it drives the whole route against a fake yt-dlp that hands back a
 * degraded clip, to show the server notices and does something about it
 * rather than delivering 360p with a 1080p label.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startHarness, type Harness } from "./testSupport/exportHarness";

// Anything above 360p is refused outright unless the app holds a YouTube
// session, and the format ladder is only reached after that gate. The harness
// passes its own environment down to the server, so pointing the app cookie
// file at a real (empty) file here is enough to get past it — the fake yt-dlp
// answers the session probe inconclusively, which the server proceeds on.
const cookieDir = fs.mkdtempSync(path.join(os.tmpdir(), "ytclip-cookies-"));
const cookieFile = path.join(cookieDir, "yt-cookies.txt");
fs.writeFileSync(cookieFile, "# Netscape HTTP Cookie File\n");
process.env.YT_CLIPPER_COOKIE_FILE = cookieFile;
test.after(() => fs.rmSync(cookieDir, { recursive: true, force: true }));

/**
 * Drives /api/download far enough that the server logs the yt-dlp invocation.
 * The fake yt-dlp answers the probe but writes no media, so the request ends
 * in "yt-dlp produced no output" — by which point the exec line is on stdout,
 * which is the only thing being asserted here.
 */
async function execOptions(
  harness: Harness,
  quality: string,
  format: "mp4" | "mp3" = "mp4",
): Promise<Record<string, unknown>> {
  const res = await fetch(`${harness.baseUrl}/api/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://www.youtube.com/watch?v=lf000001",
      start: 0,
      end: 10,
      format,
      quality,
      cookiesFromBrowser: "app",
    }),
  });
  assert.equal(res.status, 500, `expected no media from the fake yt-dlp`);

  const lines = harness
    .log()
    .split("\n")
    .filter((l) => l.includes("/api/download exec "));
  assert.ok(lines.length > 0, `no exec line logged:\n${harness.log()}`);
  const json = lines[lines.length - 1].replace(/^.*?options=/, "");
  return JSON.parse(json) as Record<string, unknown>;
}

test("the format ladder no longer demands HLS", async (t) => {
  const harness = await startHarness();
  t.after(() => harness.stop());

  const opts = await execOptions(harness, "1080");
  const ladder = String(opts.format);

  // This is the bug. Every tier led with `protocol*=m3u8`, YouTube stopped
  // returning HLS to untrusted sessions, so nothing matched until the bare
  // `best` — itag 18, muxed 360p — on a video listing 1080p.
  assert.doesNotMatch(
    ladder,
    /m3u8/,
    `protocol filtering is back in the ladder: ${ladder}`,
  );

  // Resolution stays the primary key: the requested height is exhausted
  // before anything lower is considered.
  const tiers = ladder.split("/");
  const exact = tiers.findIndex((t) => t.includes("[height=1080]"));
  const lower = tiers.findIndex((t) => t.includes("[height<=1080]"));
  assert.ok(exact >= 0 && lower > exact, `step-down ordering wrong: ${ladder}`);

  // And the muxed-everything escape hatch stays last, never first.
  assert.equal(tiers[tiers.length - 1], "best[height<=1080]");
});

test("a separate video+audio pair is preferred over a pre-merged stream", async (t) => {
  const harness = await startHarness();
  t.after(() => harness.stop());

  const tiers = String((await execOptions(harness, "best")).format).split("/");
  const pair = tiers.findIndex((t) => t.includes("+"));
  const merged = tiers.findIndex((t) => !t.includes("+"));
  // itag 18 is a pre-merged format. Taking one before trying a real pair is
  // exactly how a 1080p video becomes a 360p clip.
  assert.ok(pair >= 0 && merged > pair, `pre-merged too early: ${tiers}`);
  assert.equal(tiers[tiers.length - 1], "best");
});

test("the audio ladder does not demand HLS either", async (t) => {
  const harness = await startHarness();
  t.after(() => harness.stop());

  // mp3 only reaches a format string on the whole-file fallback, so the
  // sectioned call carries the extract-audio options instead.
  const opts = await execOptions(harness, "192", "mp3");
  assert.equal(opts.extractAudio, true);
  assert.equal(opts.audioFormat, "mp3");
  assert.equal(opts.format, undefined);
});

test("no PO-token-gated or 403'ing player client is pinned", async (t) => {
  const harness = await startHarness();
  t.after(() => harness.stop());

  const args = String((await execOptions(harness, "1080")).extractorArgs);
  assert.match(args, /^youtube:player_client=/);
  const clients = args.replace("youtube:player_client=", "").split(",");

  // Each of these was in the pinned list and each is a dead end now:
  // web/web_safari/mweb require a GVS PO token for DASH and HTTPS, `tv`
  // returns DRM'd formats to a logged-in session, and android_vr 403s
  // everything it offers.
  for (const dead of ["web", "web_safari", "mweb", "tv", "android_vr"]) {
    assert.ok(
      !clients.includes(dead),
      `"${dead}" is pinned again (${args}) — it cannot serve this app`,
    );
  }

  // Deferring to yt-dlp's own default is the point: it picks the authenticated
  // set on its own when cookies are present, so YouTube's next rotation does
  // not need a release here.
  assert.ok(clients.includes("default"), `not deferring to yt-dlp: ${args}`);
});

/** The heights the probe reported in the bug report, verbatim. */
const PROBED = [1080, 720, 480, 360, 240, 180, 144, 90, 45, 27];

async function download(
  harness: Harness,
  quality: string,
): Promise<{ status: number; headers: Headers; body: any }> {
  const res = await fetch(`${harness.baseUrl}/api/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://www.youtube.com/watch?v=lf000001",
      start: 0,
      end: 10,
      format: "mp4",
      quality,
      deliver: "path",
      cookiesFromBrowser: "app",
    }),
  });
  return { status: res.status, headers: res.headers, body: await res.json() };
}

/** The player-client lists the server actually ran, in order. */
function clientsUsed(harness: Harness): string[] {
  return harness
    .log()
    .split("\n")
    .filter((l) => l.includes("/api/download exec "))
    .map((l) => {
      const opts = JSON.parse(l.replace(/^.*?options=/, ""));
      return String(opts.extractorArgs);
    });
}

test("a 360p clip of a 1080p video is not accepted on the first try", async (t) => {
  const harness = await startHarness({
    availableHeights: PROBED,
    deliveredHeights: { primary: 360, fallback: 1080 },
  });
  t.after(() => harness.stop());

  const res = await download(harness, "1080");
  assert.equal(res.status, 200, JSON.stringify(res.body));

  // The whole point: the user ends up with the 1080p the probe promised.
  assert.equal(res.headers.get("X-Delivered-Height"), "1080");
  assert.equal(res.headers.get("X-Quality-Degraded"), null);

  // Reached by actually downloading twice, on two different client lists.
  const used = clientsUsed(harness);
  assert.equal(used.length, 2, `expected one retry, got ${used.join(" | ")}`);
  assert.notEqual(used[0], used[1]);
  assert.match(harness.log(), /\/api\/download degraded job=/);
});

test("a clip that stays degraded is reported, not passed off as fine", async (t) => {
  const harness = await startHarness({
    availableHeights: PROBED,
    deliveredHeights: { primary: 360, fallback: 360 },
  });
  t.after(() => harness.stop());

  const res = await download(harness, "1080");
  // It is still a usable clip, so it is still delivered — but nothing about
  // the response pretends it is what was asked for.
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.headers.get("X-Delivered-Height"), "360");
  assert.equal(res.headers.get("X-Quality-Degraded"), "1");
  assert.equal(res.headers.get("X-Available-Heights"), PROBED.join(","));
  assert.match(harness.log(), /\/api\/download still degraded job=/);
  assert.match(
    String(res.headers.get("Access-Control-Expose-Headers")),
    /X-Quality-Degraded/,
  );
});

test("a retry that fails outright leaves the user the clip they had", async (t) => {
  // The fallback clients produce nothing at all. Before the safety net the
  // user got a 360p clip; discovering a problem must not take it away.
  const harness = await startHarness({
    availableHeights: PROBED,
    deliveredHeights: { primary: 360, fallback: 0 },
  });
  t.after(() => harness.stop());

  const res = await download(harness, "1080");
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.headers.get("X-Delivered-Height"), "360");
  assert.equal(res.headers.get("X-Quality-Degraded"), "1");
  assert.ok(fs.existsSync(res.body.path), "the kept clip is gone");
  assert.match(harness.log(), /degraded retry failed job=/);
});

test("a video that genuinely has no better rendition is downloaded once", async (t) => {
  // 360p asked for, 360p listed, 360p delivered. Re-downloading would cost
  // the user a second fetch for a result that cannot change.
  const harness = await startHarness({
    availableHeights: [360, 240, 144],
    deliveredHeights: { primary: 360, fallback: 1080 },
  });
  t.after(() => harness.stop());

  const res = await download(harness, "360");
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.headers.get("X-Delivered-Height"), "360");
  assert.equal(res.headers.get("X-Quality-Degraded"), null);
  assert.equal(clientsUsed(harness).length, 1);
});
