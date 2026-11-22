#!/usr/bin/env node
/**
 * G area, audit-only. The smallest reproducer for the join defect.
 *
 * server/index.ts's local-trim path cuts each segment with
 *   ffmpeg -y -ss <start> -to <end> -i <source> -c copy -movflags +faststart <out>
 * With `-ss` before `-i` and `-c copy`, ffmpeg cannot cut on a non-keyframe, so
 * it keeps the packets back to the previous keyframe and hides them with an mp4
 * EDIT LIST (the first packet gets a negative pts). Every player honours the
 * edit list, so the piece looks right.
 *
 * ffmpeg's concat DEMUXER — which is what segments.ts joins with — reads raw
 * packets and ignores edit lists. So the joined clip gets the hidden pre-roll
 * back: footage from BEFORE the user's in-point, and a clip longer than marked.
 *
 * Run: npx tsx audit/run-1/area-G/g14-editlist.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const REPO = "/home/user/stream-trimmer";
const FFMPEG = path.join(REPO, "resources", "bin", "ffmpeg");
const FIXTURE = path.join(REPO, "audit", "fixtures", "fixture.mp4");
const DIR = path.join(__dirname, "out-g14");
const S = require(path.join(REPO, "server", "segments.ts"));

const q = (a) => execFileSync("ffprobe", a, { encoding: "utf8" }).trim();

fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

console.log("source keyframes:", q(["-v", "error", "-select_streams", "v:0", "-skip_frame", "nokey", "-show_entries", "frame=pts_time", "-of", "csv=p=0", FIXTURE]).split("\n").join(" "));

// Two ranges, both starting between keyframes — exactly what marking in/out in
// a UI produces.
const segs = [{ start: 0.5, end: 2.25 }, { start: 10.1, end: 12.35 }];
const marked = S.segmentsTotal(segs);
const files = [];

for (let i = 0; i < segs.length; i++) {
  const out = path.join(DIR, S.segmentFileName(i, "mp4"));
  // The production args, verbatim.
  spawnSync(FFMPEG, ["-y", "-ss", String(segs[i].start), "-to", String(segs[i].end), "-i", FIXTURE, "-c", "copy", "-movflags", "+faststart", out]);
  files.push(out);
  const honoured = Number(q(["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]));
  const raw = Number(q(["-v", "error", "-ignore_editlist", "1", "-show_entries", "format=duration", "-of", "csv=p=0", out]));
  const firstPts = q(["-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time", "-of", "csv=p=0", out]).split("\n")[0];
  const decodable = Number(q(["-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", out]));
  const stored = Number(q(["-v", "error", "-ignore_editlist", "1", "-select_streams", "v:0", "-count_frames", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", out]));
  console.log(`\npiece ${i + 1}: marked ${(segs[i].end - segs[i].start).toFixed(2)}s`);
  console.log(`  what a player sees (edit list honoured) : ${honoured}s, ${decodable} frames`);
  console.log(`  what is actually in the file           : ${raw}s, ${stored} frames   first pts=${firstPts}`);
  console.log(`  hidden pre-roll                        : ${(raw - honoured).toFixed(3)}s`);
}

const list = path.join(DIR, "list.txt");
const joined = path.join(DIR, "clip.mp4");
fs.writeFileSync(list, S.buildConcatList(files), "utf8");
spawnSync(FFMPEG, S.concatCopyArgs(list, joined, { isAudio: false }));

const joinedDur = Number(q(["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", joined]));
const joinedFrames = Number(q(["-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", joined]));

console.log(`\nmarked total            : ${marked.toFixed(2)}s  (${Math.round(marked * 25)} frames at 25fps)`);
console.log(`joined clip handed over : ${joinedDur}s  (${joinedFrames} frames)`);
console.log(`extra footage the user never marked: ${(joinedDur - marked).toFixed(3)}s  (${joinedFrames - Math.round(marked * 25)} frames)`);
console.log(`\nserver's own tolerance (segments.ts DURATION_TOLERANCE_SEC): ${S.DURATION_TOLERANCE_SEC}s`);
console.log(`so the copy join is rejected and the re-encode fallback runs: ${Math.abs(joinedDur - marked) > S.DURATION_TOLERANCE_SEC}`);
console.log(`\nartifacts: ${DIR}`);
