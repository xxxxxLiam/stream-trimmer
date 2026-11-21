/**
 * slice-2 verification of G-4 (and the duration half of G-6), written from the
 * finding's Steps, not from the original author's script.
 *
 * Question: do the two trimmed pieces carry hidden pre-roll behind an mp4 edit
 * list, does the concat demuxer bring that pre-roll back, and is the extra
 * footage in the joined clip genuinely frames from BEFORE the user's in-point
 * (as opposed to a rounding or keyframe-alignment artefact that merely makes
 * the clip long)?
 *
 * Method, independent of the original:
 *   1. build the trim args myself from server/index.ts:1628-1657 and assert the
 *      string matches what that file literally contains;
 *   2. cut with the ffmpeg the app bundles (resources/bin/ffmpeg);
 *   3. read the `elst` box out of each piece with my own mp4 box walker, so the
 *      edit list is read from the bytes rather than inferred from a duration;
 *   4. join with the PRODUCTION joinSegments/concatCopyArgs (imported, not
 *      reimplemented);
 *   5. identify every frame of the joined clip by decoded-frame md5
 *      (`ffmpeg -f framemd5`) against a map of all 750 source frames, so each
 *      delivered frame is attributed to an exact source timestamp. That is what
 *      decides "wrong content" vs "slightly long".
 *
 * Usage: npx tsx audit/run-1/verify/slice-2/v-g4-editlist.ts [tag]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  concatCopyArgs,
  concatReencodeArgs,
  joinSegments,
  runProcess,
  probeDurationSec,
} from "/home/user/stream-trimmer/server/segments.ts";

const REPO = "/home/user/stream-trimmer";
const FFMPEG = path.join(REPO, "resources", "bin", "ffmpeg"); // what the app runs
const FFPROBE = "/usr/bin/ffprobe"; // measurement only, never product code
const FIXTURE = path.join(REPO, "audit", "fixtures", "fixture.mp4");
const TAG = process.argv[2] || "a";
const OUT = path.join(REPO, "audit", "run-1", "verify", "slice-2", "out", `g4-${TAG}`);

const RANGES = [
  { start: 0.5, end: 2.25 },
  { start: 10.1, end: 12.35 },
];

function sh(bin: string, args: string[]) {
  const r = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 1 << 28 });
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
}

/** Production trim args, transcribed from server/index.ts (video branch). */
function trimArgs(src: string, seg: { start: number; end: number }, out: string) {
  return [
    "-y",
    "-ss",
    String(seg.start),
    "-to",
    String(seg.end),
    "-i",
    src,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    out,
  ];
}

/** Minimal mp4 box walker: returns every elst entry it finds, per trak. */
function readEditLists(file: string) {
  const buf = fs.readFileSync(file);
  const found: Array<{ entries: Array<{ segDuration: number; mediaTime: number }> }> = [];
  const walk = (start: number, end: number) => {
    let p = start;
    while (p + 8 <= end) {
      let size = buf.readUInt32BE(p);
      const type = buf.toString("latin1", p + 4, p + 8);
      let header = 8;
      if (size === 1) {
        size = Number(buf.readBigUInt64BE(p + 8));
        header = 16;
      } else if (size === 0) {
        size = end - p;
      }
      if (size < header || p + size > end) break;
      if (["moov", "trak", "edts", "mdia", "minf", "stbl"].includes(type)) {
        walk(p + header, p + size);
      } else if (type === "elst") {
        const version = buf.readUInt8(p + header);
        const count = buf.readUInt32BE(p + header + 4);
        let q = p + header + 8;
        const entries: Array<{ segDuration: number; mediaTime: number }> = [];
        for (let i = 0; i < count; i++) {
          if (version === 1) {
            entries.push({
              segDuration: Number(buf.readBigUInt64BE(q)),
              mediaTime: Number(buf.readBigInt64BE(q + 8)),
            });
            q += 20;
          } else {
            entries.push({
              segDuration: buf.readUInt32BE(q),
              mediaTime: buf.readInt32BE(q + 4),
            });
            q += 12;
          }
        }
        found.push({ entries });
      }
      p += size;
    }
  };
  walk(0, buf.length);
  return found;
}

function probe(file: string, ignoreEditlist: boolean) {
  const pre = ignoreEditlist ? ["-ignore_editlist", "1"] : [];
  const dur = sh(FFPROBE, [
    "-v",
    "error",
    ...pre,
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    file,
  ]).out.trim();
  const frames = sh(FFPROBE, [
    "-v",
    "error",
    ...pre,
    "-select_streams",
    "v:0",
    "-count_frames",
    "-show_entries",
    "stream=nb_read_frames,duration,start_time",
    "-of",
    "default=noprint_wrappers=1",
    file,
  ]).out.trim();
  const firstPkt = sh(FFPROBE, [
    "-v",
    "error",
    ...pre,
    "-select_streams",
    "v:0",
    "-show_entries",
    "packet=pts_time",
    "-read_intervals",
    "%+0.5",
    "-of",
    "csv=p=0",
    file,
  ]).out.trim().split(/\n/)[0];
  const o: Record<string, string> = { formatDuration: dur, firstPacketPts: firstPkt };
  for (const line of frames.split(/\n/)) {
    const [k, v] = line.split("=");
    if (k) o[k] = v;
  }
  return o;
}

/**
 * md5 of every decoded video frame, with its presentation time in SECONDS.
 * framemd5 prints pts in the output stream's time base, which it declares in a
 * `#tb 0: 1/25` header line — so the header is parsed rather than assumed.
 */
function frameMap(file: string, extraIn: string[] = []) {
  const r = sh(FFMPEG, [
    "-hide_banner",
    "-v",
    "error",
    ...extraIn,
    "-i",
    file,
    "-map",
    "0:v:0",
    "-f",
    "framemd5",
    "-",
  ]);
  let tb = 1 / 25;
  const rows: Array<{ sec: number; md5: string }> = [];
  for (const line of r.out.split(/\n/)) {
    const m = line.match(/^#tb 0:\s*(\d+)\/(\d+)/);
    if (m) tb = Number(m[1]) / Number(m[2]);
    if (!line || line.startsWith("#")) continue;
    const f = line.split(",").map((s) => s.trim());
    // stream, dts, pts, duration, size, hash
    if (f.length < 6) continue;
    rows.push({ sec: +(Number(f[2]) * tb).toFixed(6), md5: f[5] });
  }
  return rows;
}

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "v-g4-"));
  const src = path.join(work, "source.mp4");
  fs.copyFileSync(FIXTURE, src);

  const report: any = { tag: TAG, ffmpeg: FFMPEG, ranges: RANGES, pieces: [] };

  // 0. prove my trim args are the product's
  const indexSrc = fs.readFileSync(path.join(REPO, "server", "index.ts"), "utf8");
  report.trimArgsMatchSource =
    /"-ss",\s*\n?\s*String\(seg\.start\),\s*\n?\s*"-to",\s*\n?\s*String\(seg\.end\),\s*\n?\s*"-i",\s*\n?\s*source,\s*\n?\s*"-c",\s*\n?\s*"copy",/m.test(
      indexSrc,
    );
  report.myTrimArgsExample = trimArgs(src, RANGES[0], "<out>").join(" ");

  // 1. source frame fingerprints
  const srcFrames = frameMap(src);
  const byMd5 = new Map<string, number[]>();
  for (const f of srcFrames) {
    const a = byMd5.get(f.md5) ?? [];
    a.push(f.sec);
    byMd5.set(f.md5, a);
  }
  report.sourceFrames = srcFrames.length;
  report.sourceDuplicateFingerprints = [...byMd5.values()].filter((a) => a.length > 1).length;

  // 2. cut each piece with the production arguments
  const segFiles: string[] = [];
  let markedTotal = 0;
  RANGES.forEach((seg, i) => {
    const out = path.join(work, `seg-0${i + 1}.mp4`);
    const args = trimArgs(src, seg, out);
    const r = sh(FFMPEG, args);
    segFiles.push(out);
    markedTotal += seg.end - seg.start;
    const normal = probe(out, false);
    const raw = probe(out, true);
    const elst = readEditLists(out);
    fs.copyFileSync(out, path.join(OUT, `seg-0${i + 1}.mp4`));
    report.pieces.push({
      range: seg,
      marked: +(seg.end - seg.start).toFixed(3),
      ffmpegExit: r.code,
      playerSees: { duration: normal.formatDuration, frames: normal.nb_read_frames },
      bytesActuallyHold: { duration: raw.formatDuration, frames: raw.nb_read_frames },
      firstPacketPts: normal.firstPacketPts,
      editLists: elst,
      hiddenPreRollSec: +(Number(raw.formatDuration) - Number(normal.formatDuration)).toFixed(4),
    });
  });
  report.markedTotalSec = +markedTotal.toFixed(3);

  // 3. join with the production code path
  const joined = path.join(work, "clip.mp4");
  const listPath = path.join(work, "list.txt");
  const logLines: string[] = [];
  return joinSegments(
    segFiles,
    joined,
    listPath,
    markedTotal,
    { isAudio: false, audioKbps: "192" },
    {
      run: (args) => runProcess(FFMPEG, args),
      probeDuration: (f) => probeDurationSec(FFMPEG, f),
      log: (m) => logLines.push(m),
    },
  ).then((join) => {
    report.productionCopyArgs = concatCopyArgs(listPath, joined, { isAudio: false }).join(" ");
    report.productionJoin = { ...join, serverLog: logLines };
    fs.copyFileSync(joined, path.join(OUT, "joined-production.mp4"));
    report.joinedProduction = probe(joined, false);

    // 4. the copy join on its own, so the copy path is measured even when
    //    joinSegments fell through to the re-encode.
    const copyOnly = path.join(work, "copy-only.mp4");
    sh(FFMPEG, concatCopyArgs(listPath, copyOnly, { isAudio: false }));
    report.joinedCopy = probe(copyOnly, false);
    report.joinedCopyRaw = probe(copyOnly, true);
    report.joinedCopyEditLists = readEditLists(copyOnly);
    fs.copyFileSync(copyOnly, path.join(OUT, "joined-copy.mp4"));

    const reenc = path.join(work, "reenc-only.mp4");
    sh(FFMPEG, concatReencodeArgs(listPath, reenc, { isAudio: false, audioKbps: "192" }));
    report.joinedReencode = probe(reenc, false);
    fs.copyFileSync(reenc, path.join(OUT, "joined-reencode.mp4"));

    // 5. attribute every delivered frame to a source timestamp
    const attribute = (file: string) => {
      const delivered = frameMap(file);
      const rows = delivered.map((f) => {
        const hits = byMd5.get(f.md5) ?? [];
        return { outSec: f.sec, srcSec: hits.length === 1 ? hits[0] : null, hits: hits.length };
      });
      const inRange = (t: number) =>
        RANGES.some((r) => t >= r.start - 1e-6 && t < r.end - 1e-6);
      // An extra frame is one that is inside NO marked range. It counts as
      // pre-roll only if it sits in the 10 s run-up to one of the in-points
      // (the GOP the cut could not land on).
      const isPreRoll = (t: number) =>
        !inRange(t) && RANGES.some((r) => t < r.start - 1e-6 && t >= r.start - 10.001);
      const good = rows.filter((a) => a.hits === 1 && inRange(a.srcSec!));
      const pre = rows.filter((a) => a.hits === 1 && isPreRoll(a.srcSec!));
      const post = rows.filter(
        (a) => a.hits === 1 && !inRange(a.srcSec!) && !isPreRoll(a.srcSec!),
      );
      const unmatched = rows.filter((a) => a.hits !== 1);
      return {
        deliveredFrames: rows.length,
        expectedFramesForMarkedTotal: Math.round(markedTotal * 25),
        framesFromInsideMarkedRanges: good.length,
        framesFromBeforeAnInPoint: pre.length,
        framesFromAfterAnOutPointOrElsewhere: post.length,
        framesNotUniquelyIdentified: unmatched.length,
        beforeInPointSourceSeconds: pre.map((b) => b.srcSec),
        afterOutPointSourceSeconds: post.map((b) => b.srcSec),
        firstDeliveredSourceSecond: rows[0]?.srcSec,
        marksStartAt: RANGES[0].start,
        headOfClipStartsThisEarly: rows[0]?.srcSec == null ? null : +(RANGES[0].start - rows[0].srcSec!).toFixed(3),
      };
    };
    report.frameAttributionCopyJoin = attribute(copyOnly);
    report.frameAttributionPieces = segFiles.map((f) => attribute(f));

    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    fs.rmSync(work, { recursive: true, force: true });
  });
}

main();
