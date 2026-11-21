#!/usr/bin/env node
/**
 * File: fakeFfmpeg.cjs
 * Path: server/testSupport/fakeFfmpeg.cjs
 * Description: A stand-in for ffmpeg, so a clip download can be driven end to
 * end without decoding anything. It answers the only two ways the server uses
 * ffmpeg: probing a finished clip for its resolution, and trimming a
 * whole-file download down to the requested range.
 *
 * The "media" it works on is the one-line text file the fake yt-dlp writes,
 * which carries the height the download was supposed to deliver. That is what
 * lets a test say "this player client hands back 360p" and have the server
 * discover it exactly as it would from a real file.
 */
const fs = require("node:fs");

const argv = process.argv.slice(2);

// Every call is recorded when FAKE_FFMPEG_LOG is set, so a test can show which
// path ran (a plain trim, a stream-copy join, a re-encode) and that a single
// segment never reached the concat demuxer at all.
function record(kind) {
  const file = process.env.FAKE_FFMPEG_LOG;
  if (!file) return;
  try {
    fs.appendFileSync(file, `${kind}\n`);
  } catch {
    /* best effort */
  }
}
const dashI = argv.indexOf("-i");
const input = dashI === -1 ? null : argv[dashI + 1];

function durationOf(file) {
  try {
    const m = fs.readFileSync(file, "utf8").match(/duration=([\d.]+)/);
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
}

function hms(sec) {
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec - h * 3600 - m * 60;
  return `${pad(h)}:${pad(m)}:${s.toFixed(2).padStart(5, "0")}`;
}

function heightOf(file) {
  try {
    const m = fs.readFileSync(file, "utf8").match(/height=(\d+)/);
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
}

// The concat demuxer: `-f concat -safe 0 -i list.txt [-c copy | re-encode] out`.
// The "media" is the one-line text file the fake yt-dlp writes, so joining is
// adding their durations. FAKE_CONCAT_COPY_FAIL makes the stream copy fail and
// FAKE_CONCAT_SKEW makes it come out that many seconds too long, which is what
// forces the re-encode path; a re-encode is always exact.
if (argv.includes("concat")) {
  const reencode = argv.includes("libx264") || argv.includes("libmp3lame");
  record(reencode ? "concat-reencode" : "concat-copy");
  const output = argv[argv.length - 1];
  const files = [];
  try {
    for (const line of fs.readFileSync(input, "utf8").split("\n")) {
      const m = line.match(/^file '(.*)'$/);
      if (m) files.push(m[1].replace(/'\\''/g, "'"));
    }
  } catch (err) {
    process.stderr.write(`fake ffmpeg: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (!reencode && process.env.FAKE_CONCAT_COPY_FAIL) {
    process.stderr.write("fake ffmpeg: Non-monotonous DTS in output stream\n");
    process.exitCode = 1;
    return;
  }
  let total = 0;
  for (const f of files) total += durationOf(f);
  if (!reencode) total += Number(process.env.FAKE_CONCAT_SKEW || 0);
  fs.writeFileSync(
    output,
    `fake clip height=${heightOf(files[0])} duration=${total} joined=${reencode ? "reencode" : "copy"} parts=${files.length}\n`,
  );
  process.exitCode = 0;
  return;
}

// probeDelivered() asks for a bare `-i <file>` with nothing to write, so the
// input is the last argument. Real ffmpeg prints the stream table and exits
// non-zero; the server reads the text and ignores the status.
if (input && dashI + 2 === argv.length) {
  record("probe");
  const height = heightOf(input);
  const duration = durationOf(input);
  if (duration > 0) {
    process.stderr.write(
      `  Duration: ${hms(duration)}, start: 0.000000, bitrate: 1128 kb/s\n`,
    );
  }
  if (height > 0) {
    const width = Math.round((height * 16) / 9);
    process.stderr.write(
      `  Stream #0:0(und): Video: h264 (avc1 / 0x31637661), yuv420p, ${width}x${height} [SAR 1:1 DAR 16:9], 1000 kb/s, 30 fps\n` +
        `  Stream #0:1(und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 128 kb/s\n`,
    );
  }
  process.exitCode = 1;
  return;
}

// Everything else is a trim: the output path is the last argument.
record("trim");
const output = argv[argv.length - 1];
try {
  fs.copyFileSync(input, output);
  process.exitCode = 0;
} catch (err) {
  process.stderr.write(`fake ffmpeg: ${err.message}\n`);
  process.exitCode = 1;
}
