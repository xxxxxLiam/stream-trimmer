#!/usr/bin/env node
/**
 * File: fakeYtDlp.cjs
 * Path: server/testSupport/fakeYtDlp.cjs
 * Description: A stand-in for the yt-dlp binary, so the channel exporter can
 * be driven end to end without touching YouTube. It answers the four call
 * shapes the exporter makes — channel listing, per-video metadata, comments,
 * and subtitles — from a synthetic channel described by environment
 * variables.
 *
 * The exporter spawns this the same way it spawns the real thing: argv is
 * [url, ...flags], JSON goes to stdout, exit 0 means success.
 */
const fs = require("node:fs");

const argv = process.argv.slice(2);

// stdout to a pipe is asynchronous, and process.exit() throws away whatever
// has not been flushed. A channel listing is hundreds of kilobytes, far more
// than the pipe buffer, so exiting explicitly would truncate it. Setting
// exitCode and returning lets node drain the stream first.
function emit(text, code = 0) {
  process.exitCode = code;
  if (text) process.stdout.write(text);
}
function fail(message) {
  process.exitCode = 1;
  process.stderr.write(message);
}
const has = (flag) => argv.includes(flag);
const valueOf = (flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? null : argv[i + 1];
};
const num = (name, fallback) => {
  const raw = process.env[name];
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

const LONGFORM = num("FAKE_LONGFORM", 12);
const SHORTS = num("FAKE_SHORTS", 8);
const COMMENTS_PER_VIDEO = num("FAKE_COMMENTS", 3);
const TRANSCRIPT_LINES = num("FAKE_TRANSCRIPT_LINES", 2);
const CHANNEL_NAME = process.env.FAKE_CHANNEL_NAME || "Test Channel";
const SUBS = num("FAKE_SUBS", 4242);
// Videos whose comment fetch fails, as a comma-separated list of ids.
const NO_COMMENTS = new Set(
  (process.env.FAKE_NO_COMMENTS || "").split(",").filter(Boolean),
);

// Text that only survives a correct UTF-8 path: an emoji outside the BMP, a
// non-Latin script, and the CSV quote character.
const TRICKY = 'héllo — 日本語 🎬 "quoted"';

if (has("--version")) {
  emit("2099.01.01\n");
  return;
}

const url = argv[0] || "";

// --- the synthetic channel ------------------------------------------------
// Long-form ids are lf000001…, shorts are sh000001…. View counts descend with
// the index, so the most-viewed video of each kind is the first one, and a
// ranking bug shows up as the wrong ids being selected.
const pad = (n) => String(n).padStart(6, "0");
const longformId = (i) => `lf${pad(i)}`;
const shortsId = (i) => `sh${pad(i)}`;

function kindOf(id) {
  if (id.startsWith("lf")) return "longform";
  if (id.startsWith("sh")) return "shorts";
  return null;
}
function indexOf(id) {
  return Number(id.slice(2));
}
function viewsFor(id) {
  // Long-form outranks shorts overall, so a "top N" of mixed content has a
  // predictable composition.
  const i = indexOf(id);
  return kindOf(id) === "longform" ? 1_000_000 - i : 500_000 - i;
}
function durationFor(id) {
  return kindOf(id) === "longform" ? 300 : 30;
}
function titleFor(id) {
  return `${kindOf(id) === "longform" ? "Video" : "Short"} ${indexOf(id)} ${TRICKY}`;
}

function listing() {
  const wantsShorts = /\/shorts/.test(url);
  const end = Number(valueOf("--playlist-end")) || Infinity;
  const entries = [];
  if (wantsShorts) {
    // The real Shorts tab reports view counts but no duration.
    for (let i = 1; i <= SHORTS && entries.length < end; i++) {
      const id = shortsId(i);
      entries.push({ id, title: titleFor(id), view_count: viewsFor(id) });
    }
  } else {
    // The real Videos tab reports duration but no view counts, in the
    // channel's own popularity order.
    for (let i = 1; i <= LONGFORM && entries.length < end; i++) {
      const id = longformId(i);
      entries.push({ id, title: titleFor(id), duration: durationFor(id) });
    }
  }
  return {
    _type: "playlist",
    channel: CHANNEL_NAME,
    channel_follower_count: SUBS,
    entries,
  };
}

function videoId() {
  const m = url.match(/[?&]v=([^&]+)/);
  return m ? m[1] : null;
}

function metadata(id) {
  return {
    id,
    title: titleFor(id),
    description: `Description for ${id} ${TRICKY}`,
    upload_date: "20250101",
    duration: durationFor(id),
    view_count: viewsFor(id),
    like_count: indexOf(id) * 10,
    comment_count: COMMENTS_PER_VIDEO,
    channel: CHANNEL_NAME,
    thumbnail: `https://i.ytimg.com/vi/${id}/hq.jpg`,
    tags: ["alpha", "beta"],
    hashtags: ["#tagged"],
  };
}

function comments(id) {
  const out = [];
  for (let i = 0; i < COMMENTS_PER_VIDEO; i++) {
    out.push({
      id: `${id}-c${i}`,
      parent: i % 3 === 2 ? `${id}-c${i - 1}` : "root",
      author: `Commenter ${i}`,
      author_id: `UC${id}${i}`,
      // A newline inside a field is the other thing a CSV writer must survive.
      text: `Comment ${i} on ${id}\nsecond line ${TRICKY}`,
      like_count: i,
      is_pinned: i === 0,
      author_is_uploader: i === 1,
      time_text: "1 year ago",
      timestamp: 1700000000 + i,
    });
  }
  return out;
}

function writeSubtitles(id) {
  const out = valueOf("--output");
  if (!out) return;
  const blocks = ["WEBVTT", ""];
  // HH:MM:SS.mmm — the exporter's VTT parser wants exactly two digits per
  // field, so a long transcript must roll over into minutes and hours rather
  // than counting seconds past 99.
  const t = (n) => {
    const pad2 = (x) => String(x).padStart(2, "0");
    return `${pad2(Math.floor(n / 3600))}:${pad2(Math.floor(n / 60) % 60)}:${pad2(n % 60)}.000`;
  };
  for (let i = 0; i < TRANSCRIPT_LINES; i++) {
    blocks.push(`${t(i * 2)} --> ${t(i * 2 + 2)}`);
    blocks.push(`Caption ${i} of ${id} ${TRICKY}`);
    blocks.push("");
  }
  fs.writeFileSync(`${out}.en.vtt`, blocks.join("\n"), "utf8");
}

// --- dispatch -------------------------------------------------------------
function main() {
  if (has("--flat-playlist")) return emit(JSON.stringify(listing()));

  const id = videoId();
  if (!id) return fail(`fake yt-dlp: unsupported url ${url}\n`);

  if (has("--write-auto-subs") || has("--write-subs")) {
    writeSubtitles(id);
    return emit("");
  }

  if (has("--write-comments")) {
    if (NO_COMMENTS.has(id)) {
      return fail("ERROR: Comments are disabled for this video\n");
    }
    return emit(JSON.stringify({ ...metadata(id), comments: comments(id) }));
  }

  return emit(JSON.stringify(metadata(id)));
}

main();
