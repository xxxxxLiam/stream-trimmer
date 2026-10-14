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
const dashI = argv.indexOf("-i");
const input = dashI === -1 ? null : argv[dashI + 1];

function heightOf(file) {
  try {
    const m = fs.readFileSync(file, "utf8").match(/height=(\d+)/);
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
}

// probeDelivered() asks for a bare `-i <file>` with nothing to write, so the
// input is the last argument. Real ffmpeg prints the stream table and exits
// non-zero; the server reads the text and ignores the status.
if (input && dashI + 2 === argv.length) {
  const height = heightOf(input);
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
const output = argv[argv.length - 1];
try {
  fs.copyFileSync(input, output);
  process.exitCode = 0;
} catch (err) {
  process.stderr.write(`fake ffmpeg: ${err.message}\n`);
  process.exitCode = 1;
}
