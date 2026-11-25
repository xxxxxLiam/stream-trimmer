/**
 * File: fcpxml.test.ts
 * Path: src/renderer/src/shared/utils/fcpxml.test.ts
 * Description: Pins the FCPXML generator: rational time, probed format values,
 *   notes, one event for a whole session, XML escaping, and (where xmllint and
 *   ffprobe exist) validation against Apple's DTD and a real probed file.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseLook } from "../../../../common/utils/fcpLook";
import { sampleExport } from "../../../../common/utils/fcpLook.fixture";
import {
  AFTER_CUTTING_VALUES,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_PROJECT_PATTERN,
  buildFcpxml,
  buildSessionFcpxml,
  libraryLocation,
  libraryPath,
  normalizeTimeline,
  projectNameFor,
  resolveProjectNames,
  resolveTimeline,
  type FcpxmlProject,
  clipName,
  clipNotes,
  fcpxmlFilename,
  fileUrl,
  formatTime,
  normalizeEditorSettings,
  parseFfmpegInfo,
  parseFfprobe,
  parseRational,
  resolveEventName,
  secondsToFrames,
  snapFrameRate,
  sourceTimecode,
  xmlEscape,
  type FcpClip,
  type MediaInfo,
} from "./fcpxml";

const NTSC: MediaInfo = {
  width: 1920,
  height: 1080,
  fps: { num: 30000, den: 1001 },
  durationSec: 10.01,
  hasAudio: true,
  audioRate: "48k",
  audioChannels: 2,
};

function clip(over: Partial<FcpClip> = {}): FcpClip {
  return {
    id: "M-abc-01",
    label: "the hook",
    path: "/Users/me/Clips/M-abc-01.mp4",
    segments: [{ start: 72, end: 90 }],
    sourceUrl: "https://www.youtube.com/watch?v=abc",
    media: NTSC,
    ...over,
  };
}

const DTD = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "fcpxml-1.10.dtd");
const hasXmllint = spawnSync("xmllint", ["--version"]).status === 0;

/** Validate against Apple's full FCPXML 1.10 DTD; returns xmllint's complaint or "". */
function validate(xml: string): string {
  const dir = mkdtempSync(join(tmpdir(), "fcpxml-"));
  const file = join(dir, "t.fcpxml");
  writeFileSync(file, xml);
  const r = spawnSync("xmllint", ["--noout", "--dtdvalid", DTD, file], {
    encoding: "utf8",
  });
  return r.status === 0 ? "" : r.stderr;
}

// ---- rational time ---------------------------------------------------------

test("frame duration is rational, never decimal seconds", () => {
  assert.equal(formatTime(1, { num: 30000, den: 1001 }), "1001/30000s");
  assert.equal(formatTime(1, { num: 25, den: 1 }), "1/25s");
  assert.equal(formatTime(300, { num: 30000, den: 1001 }), "300300/30000s");
  assert.equal(formatTime(0, { num: 25, den: 1 }), "0s");
});

test("seconds become whole frames, rounded down", () => {
  const ntsc = { num: 30000, den: 1001 };
  assert.equal(secondsToFrames(10.01, ntsc), 300);
  assert.equal(secondsToFrames(10.0, ntsc), 299);
  assert.equal(secondsToFrames(1, { num: 25, den: 1 }), 25);
});

test("frame rates parse and snap to the exact NTSC rational", () => {
  assert.deepEqual(parseRational("30000/1001"), { num: 30000, den: 1001 });
  assert.deepEqual(parseRational("25/1"), { num: 25, den: 1 });
  assert.equal(parseRational("0/0"), null);
  assert.equal(parseRational("N/A"), null);
  assert.deepEqual(snapFrameRate({ num: 2997, den: 100 }), { num: 30000, den: 1001 });
  assert.deepEqual(snapFrameRate({ num: 2398, den: 100 }), { num: 24000, den: 1001 });
  assert.deepEqual(snapFrameRate({ num: 30, den: 1 }), { num: 30, den: 1 });
});

// ---- probing ---------------------------------------------------------------

test("ffprobe JSON gives size, exact rate, duration and audio", () => {
  const info = parseFfprobe({
    streams: [
      { codec_type: "video", width: 1280, height: 720, avg_frame_rate: "30000/1001", r_frame_rate: "30000/1001" },
      { codec_type: "audio", sample_rate: "44100", channels: 2 },
    ],
    format: { duration: "12.345000" },
  });
  assert.equal(info.width, 1280);
  assert.equal(info.height, 720);
  assert.deepEqual(info.fps, { num: 30000, den: 1001 });
  assert.equal(info.durationSec, 12.345);
  assert.equal(info.audioRate, "44.1k");
  assert.equal(info.audioChannels, 2);
});

test("ffprobe: a 0/0 average rate falls back to r_frame_rate", () => {
  const info = parseFfprobe({
    streams: [{ codec_type: "video", width: 640, height: 360, avg_frame_rate: "0/0", r_frame_rate: "25/1" }],
    format: { duration: "3" },
  });
  assert.deepEqual(info.fps, { num: 25, den: 1 });
  assert.equal(info.hasAudio, false);
});

test("ffprobe: a rotated phone clip swaps width and height", () => {
  const info = parseFfprobe({
    streams: [
      {
        codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "30/1",
        side_data_list: [{ rotation: -90 }],
      },
    ],
    format: { duration: "3" },
  });
  assert.equal(info.width, 1080);
  assert.equal(info.height, 1920);
});

test("ffprobe: missing video, rate or duration is refused with a reason", () => {
  assert.throws(() => parseFfprobe({ streams: [{ codec_type: "audio" }], format: {} }), /no video stream/);
  assert.throws(
    () => parseFfprobe({ streams: [{ codec_type: "video", width: 10, height: 10 }], format: { duration: "1" } }),
    /frame rate/,
  );
  assert.throws(
    () => parseFfprobe({ streams: [{ codec_type: "video", width: 10, height: 10, avg_frame_rate: "30/1" }], format: {} }),
    /duration/,
  );
});

const FFMPEG_TEXT = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'a.mp4':
  Duration: 00:01:02.50, start: 0.000000, bitrate: 2000 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 1900 kb/s, 29.97 fps, 29.97 tbr, 30k tbn (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)`;

test("ffmpeg -i fallback reads size, snaps 29.97 to 30000/1001, reads audio", () => {
  const info = parseFfmpegInfo(FFMPEG_TEXT);
  assert.equal(info.width, 1920);
  assert.equal(info.height, 1080);
  assert.deepEqual(info.fps, { num: 30000, den: 1001 });
  assert.equal(info.durationSec, 62.5);
  assert.equal(info.audioRate, "48k");
  assert.equal(info.audioChannels, 2);
});

test("ffmpeg -i fallback refuses a rate it cannot know exactly", () => {
  assert.throws(() => parseFfmpegInfo(FFMPEG_TEXT.replace("29.97 fps", "17.3 fps")), /cannot be read exactly/);
});

// ---- names and notes -------------------------------------------------------

test("clip name is the id plus its label; no em dash", () => {
  assert.equal(clipName({ id: "T1-A01", label: "the hook" }), "T1-A01 - the hook");
  assert.equal(clipName({ id: "T1-A01" }), "T1-A01");
  assert.equal(clipName({ id: "T1-A01", label: "  " }), "T1-A01");
});

test("notes hold the canonical URL and every segment's source timecodes", () => {
  const one = clipNotes({ sourceUrl: "https://www.youtube.com/watch?v=abc", segments: [{ start: 72, end: 90 }] });
  assert.equal(
    one,
    "Source: https://www.youtube.com/watch?v=abc\nSource timecodes: 00:01:12 to 00:01:30",
  );
  const two = clipNotes({
    sourceUrl: "https://www.youtube.com/watch?v=abc",
    segments: [{ start: 72, end: 90 }, { start: 604, end: 620.5 }],
  });
  assert.match(two, /2 segments, joined in this order\): 00:01:12 to 00:01:30; 00:10:04 to 00:10:20\.500$/);
  assert.equal(sourceTimecode(3725), "01:02:05");
});

test("event name: campaign or source, with a fallback", () => {
  assert.equal(resolveEventName({ from: "campaign", campaignName: "Shorts", sourceTitle: "Talk" }), "Shorts");
  assert.equal(resolveEventName({ from: "source", campaignName: "Shorts", sourceTitle: "Talk" }), "Talk");
  assert.equal(resolveEventName({ from: "source", campaignName: "Shorts" }), "Shorts");
  assert.equal(resolveEventName({ from: "campaign" }), "Clips");
});

test("settings default to off and coerce junk", () => {
  assert.equal(normalizeEditorSettings(undefined).afterCutting, "nothing");
  assert.equal(normalizeEditorSettings({ afterCutting: "bogus" }).afterCutting, "nothing");
  // Premiere was removed (it cannot import FCPXML); a stored value falls back to nothing.
  assert.equal(normalizeEditorSettings({ afterCutting: "premiere" }).afterCutting, "nothing");
  assert.equal(normalizeEditorSettings({ afterCutting: "finalcut" }).afterCutting, "finalcut");
  assert.equal(normalizeEditorSettings({ eventName: "source" }).eventName, "source");
});

// ---- document --------------------------------------------------------------

test("single segment: version, format, rational durations, note", () => {
  const xml = buildFcpxml({ eventName: "Shorts", clips: [clip()] });
  assert.match(xml, /<fcpxml version="1\.10">/);
  assert.match(xml, /<format id="r1" frameDuration="1001\/30000s" width="1920" height="1080" colorSpace="1-1-1 \(Rec\. 709\)"\/>/);
  // 10.01s at 30000/1001 is 300 frames.
  assert.match(xml, /<asset id="a1" name="M-abc-01 - the hook" start="0s" duration="300300\/30000s" hasVideo="1" format="r1" hasAudio="1" audioSources="1" audioChannels="2" audioRate="48k">/);
  assert.match(xml, /<media-rep kind="original-media" src="file:\/\/\/Users\/me\/Clips\/M-abc-01\.mp4"\/>/);
  assert.match(xml, /<event name="Shorts">/);
  assert.match(xml, /<asset-clip ref="a1" name="M-abc-01 - the hook" start="0s" duration="300300\/30000s" format="r1" tcFormat="NDF">/);
  assert.match(xml, /<note>Source: https:\/\/www\.youtube\.com\/watch\?v=abc\nSource timecodes: 00:01:12 to 00:01:30<\/note>/);
  assert.ok(!xml.includes("\u2014"));
  assert.ok(!/duration="[\d.]+s"/.test(xml.replace(/\d+\/\d+s/g, "")), "no decimal-second durations");
});

test("multi-segment clip is ONE asset with the ranges in its note", () => {
  const xml = buildFcpxml({
    eventName: "Shorts",
    clips: [clip({ segments: [{ start: 72, end: 90 }, { start: 604, end: 620 }] })],
  });
  assert.equal((xml.match(/<asset /g) ?? []).length, 1);
  assert.equal((xml.match(/<asset-clip /g) ?? []).length, 1);
  assert.match(xml, /00:01:12 to 00:01:30; 00:10:04 to 00:10:20/);
});

test("several clips: one event, one asset each, formats shared or split", () => {
  const pal: MediaInfo = { ...NTSC, fps: { num: 25, den: 1 }, durationSec: 4 };
  const xml = buildFcpxml({
    eventName: "Session",
    clips: [
      clip({ id: "A-01", path: "/c/a.mp4" }),
      clip({ id: "A-02", path: "/c/b.mp4" }),
      clip({ id: "A-03", path: "/c/c.mp4", media: pal }),
    ],
  });
  assert.equal((xml.match(/<event /g) ?? []).length, 1);
  assert.equal((xml.match(/<asset-clip /g) ?? []).length, 3);
  assert.equal((xml.match(/<format /g) ?? []).length, 2);
  assert.match(xml, /<format id="r2" frameDuration="1\/25s"/);
  assert.match(xml, /<asset id="a3"[^>]*duration="100\/25s"[^>]*format="r2"/);
});

test("a clip with no audio omits the audio attributes", () => {
  const xml = buildFcpxml({ eventName: "E", clips: [clip({ media: { ...NTSC, hasAudio: false, audioRate: undefined, audioChannels: undefined } })] });
  assert.ok(!xml.includes("hasAudio"));
});

test("an empty clip list is refused", () => {
  assert.throws(() => buildFcpxml({ eventName: "E", clips: [] }), /no clips/);
});

// ---- escaping --------------------------------------------------------------

test("xmlEscape covers & < > and both quotes, drops control characters", () => {
  assert.equal(xmlEscape(`a&b<c>d"e'f`), "a&amp;b&lt;c&gt;d&quot;e&apos;f");
  assert.equal(xmlEscape("a\u0000b\u0008c"), "abc");
});

test("file URLs encode spaces, apostrophes, ampersands and non-Latin text", () => {
  assert.equal(fileUrl("/Users/me/My Clips/Bob's & Co.mp4"), "file:///Users/me/My%20Clips/Bob%27s%20%26%20Co.mp4");
  assert.equal(fileUrl("/Users/me/\u0645\u0631\u062D\u0628\u0627.mp4"), "file:///Users/me/%D9%85%D8%B1%D8%AD%D8%A8%D8%A7.mp4");
  assert.equal(fileUrl("C:\\Clips\\a b.mp4"), "file:///C:/Clips/a%20b.mp4");
  assert.throws(() => fileUrl("relative/a.mp4"), /relative/);
});

const AWKWARD = [
  { id: "M-a-01", label: "Bob's \"big\" idea & more <b>", path: "/Users/me/My Clips/Bob's & Co \"q\".mp4" },
  { id: "M-a-02", label: "\u0628\u0633\u0645 \u0627\u0644\u0644\u0647 \u65E5\u672C\u8A9E \u0420\u0443\u0441", path: "/Users/me/\u0645\u0631\u062D\u0628\u0627/\u65E5\u672C\u8A9E.mp4" },
];

test("awkward names produce well-formed XML that parses back to the originals", () => {
  const xml = buildFcpxml({
    eventName: `Q&A "live" <1>`,
    clips: AWKWARD.map((a) => clip({ ...a, segments: [{ start: 1, end: 2 }] })),
  });
  assert.ok(!xml.includes("Bob's & Co"), "raw ampersand must not appear");
  assert.match(xml, /<event name="Q&amp;A &quot;live&quot; &lt;1&gt;">/);
  assert.match(xml, /M-a-02 - \u0628\u0633\u0645/);
  assert.match(xml, /src="file:\/\/\/Users\/me\/My%20Clips\/Bob%27s%20%26%20Co%20%22q%22\.mp4"/);
  if (hasXmllint) {
    assert.equal(validate(xml), "");
    // Re-read the attributes through a real XML parser: the names must round-trip.
    const py = "import sys,json,xml.etree.ElementTree as E;r=E.fromstring(sys.stdin.buffer.read());print(json.dumps([next(r.iter('event')).get('name')]+[a.get('name') for a in r.iter('asset-clip')]+[m.get('src') for m in r.iter('media-rep')],ensure_ascii=False))";
    const out = JSON.parse(execFileSync("python3", ["-I", "-c", py], { input: xml, encoding: "utf8" }));
    assert.equal(out[0], `Q&A "live" <1>`);
    assert.equal(out[1], `M-a-01 - Bob's "big" idea & more <b>`);
    assert.equal(out[2], clipName(AWKWARD[1]));
    assert.equal(decodeURIComponent(out[4]), "file:///Users/me/\u0645\u0631\u062D\u0628\u0627/\u65E5\u672C\u8A9E.mp4");
  }
});

test("em dashes in labels are replaced, not emitted", () => {
  const xml = buildFcpxml({ eventName: "E\u2014F", clips: [clip({ label: "a\u2014b" })] });
  assert.ok(!xml.includes("\u2014"));
});

test("filename is safe and ends in .fcpxml", () => {
  assert.equal(fcpxmlFilename("Shorts"), "Shorts.fcpxml");
  assert.equal(fcpxmlFilename(`a/b:c*d?"e`), "a b c d e.fcpxml");
  assert.equal(fcpxmlFilename("  "), "Clips.fcpxml");
  assert.equal(fcpxmlFilename("..hidden"), "hidden.fcpxml");
});

// ---- DTD -------------------------------------------------------------------

test("output validates against Apple's FCPXML 1.10 DTD (xmllint)", { skip: !hasXmllint }, () => {
  const xml = buildFcpxml({
    eventName: "Shorts",
    clips: [clip(), clip({ id: "B", path: "/x/b.mp4", segments: [{ start: 1, end: 2 }, { start: 5, end: 6 }] })],
  });
  assert.equal(validate(xml), "");
});

test("the DTD check can fail (mutation guard: a wrong version is rejected)", { skip: !hasXmllint }, () => {
  const xml = buildFcpxml({ eventName: "E", clips: [clip()] }).replace('version="1.10"', 'version="1.9"');
  assert.notEqual(validate(xml), "");
});

// ---- session batch ---------------------------------------------------------

test("session batch: ONE document for every clip, bad files reported not dropped", async () => {
  const result = await buildSessionFcpxml(
    [
      { id: "A-01", path: "/c/a.mp4", segments: [{ start: 0, end: 5 }] },
      { id: "A-02", path: "/c/missing.mp4", segments: [{ start: 0, end: 5 }] },
      { id: "A-03", label: "x", path: "/c/c.mp4", segments: [{ start: 0, end: 5 }] },
    ],
    "Shorts",
    async (p) => {
      if (p.includes("missing")) throw new Error("No such file");
      return { kind: "ffprobe", json: { streams: [{ codec_type: "video", width: 1080, height: 1920, avg_frame_rate: "30/1" }], format: { duration: "5" } } };
    },
  );
  assert.equal(result.included, 2);
  assert.deepEqual(result.skipped, [{ id: "A-02", reason: "No such file" }]);
  assert.equal(result.filename, "Shorts.fcpxml");
  assert.equal((result.xml.match(/<event /g) ?? []).length, 1);
  assert.equal((result.xml.match(/<asset-clip /g) ?? []).length, 2);
  assert.match(result.xml, /<format id="r1" frameDuration="1\/30s" width="1080" height="1920" colorSpace="1-1-1 \(Rec\. 709\)"\/>/);
});

test("session batch: nothing probeable is an error naming the reason", async () => {
  await assert.rejects(
    buildSessionFcpxml([{ id: "A", path: "/c/a.mp4", segments: [] }], "E", async () => {
      throw new Error("ffprobe not found");
    }),
    /ffprobe not found/,
  );
});

// ---- real file -------------------------------------------------------------

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;

test("a real 29.97 fps file probes and validates end to end", { skip: !hasFfmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), "fcpxml-real-"));
  const file = join(dir, "Bob's clip & more.mp4");
  const gen = spawnSync("ffmpeg", [
    "-v", "error", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30000/1001:duration=2",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
    "-shortest", "-pix_fmt", "yuv420p", "-y", file,
  ]);
  assert.equal(gen.status, 0, String(gen.stderr));
  const json = JSON.parse(
    execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file], { encoding: "utf8" }),
  );
  const media = parseFfprobe(json);
  assert.equal(media.width, 640);
  assert.equal(media.height, 360);
  assert.deepEqual(media.fps, { num: 30000, den: 1001 });
  const xml = buildFcpxml({ eventName: "Real", clips: [clip({ path: file, media })] });
  assert.match(xml, /frameDuration="1001\/30000s" width="640" height="360"/);
  if (hasXmllint) assert.equal(validate(xml), "");
});

// ---- A6: two events, a project, library targeting, vertical timeline --------

const PROJECT: FcpxmlProject = {
  eventName: "Exports",
  namePattern: "{clipId} {label}",
  timeline: { kind: "vertical", width: 1080, height: 1920, fps: "30" },
};

/** Parse with python so assertions read the real tree, not regexes. */
function tree(xml: string): { library: string | null; hasLibraryEl: boolean; order: string[]; events: { name: string; clips: string[]; projects: { name: string; fmt: string; refs: string[] }[] }[]; formats: Record<string, string>; assets: string[] } {
  const py = `
import sys,json,xml.etree.ElementTree as E
r=E.fromstring(sys.stdin.buffer.read())
opt=[o.get('value') for o in r.iterfind('import-options/option') if o.get('key')=='library location']
fm={f.get('id'):f.get('width')+'x'+f.get('height')+'@'+f.get('frameDuration') for f in r.iter('format')}
ev=[]
for e in r.findall('event'):
  ev.append({'name':e.get('name'),'clips':[c.get('ref') for c in e.findall('asset-clip')],
   'projects':[{'name':p.get('name'),'fmt':p.find('sequence').get('format'),'refs':[c.get('ref') for c in p.iter('asset-clip')]} for p in e.findall('project')]})
print(json.dumps({'library':(opt[0] if opt else None),'hasLibraryEl':r.find('library') is not None,'order':[c.tag for c in r],'events':ev,'formats':fm,'assets':[a.get('id') for a in r.iter('asset')]},ensure_ascii=False))`;
  return JSON.parse(execFileSync("python3", ["-I", "-c", py], { input: xml, encoding: "utf8" }));
}

test("clip in ONE event, no project, when no project is asked for", { skip: !hasXmllint }, () => {
  const xml = buildFcpxml({ eventName: "Raw", clips: [clip()] });
  assert.equal(validate(xml), "");
  const t = tree(xml);
  assert.equal(t.events.length, 1);
  assert.deepEqual(t.events[0].clips, ["a1"]);
  assert.equal(t.events[0].projects.length, 0);
  assert.ok(!xml.includes("<project"));
  assert.ok(!xml.includes("<sequence"));
});

test("clip in TWO events: raw asset-clip plus a project that references the SAME asset", { skip: !hasXmllint }, () => {
  const xml = buildFcpxml({ eventName: "Raw", clips: [clip()], project: PROJECT });
  assert.equal(validate(xml), "");
  const t = tree(xml);
  assert.deepEqual(t.events.map((e) => e.name), ["Raw", "Exports"]);
  assert.deepEqual(t.events[0].clips, ["a1"]);
  assert.deepEqual(t.events[1].projects, [{ name: "M-abc-01 the hook", fmt: "r2", refs: ["a1"] }]);
  assert.deepEqual(t.assets, ["a1"], "the asset is referenced, never duplicated");
  assert.equal((xml.match(/<asset /g) ?? []).length, 1);
});

test("several clips in one batch: each gets its own project and asset", { skip: !hasXmllint }, () => {
  const clips = [
    clip({ id: "A-01", label: "one", path: "/c/a.mp4" }),
    clip({ id: "A-02", label: "two", path: "/c/b.mp4", projectName: "From my notes" }),
    clip({ id: "A-03", label: "", path: "/c/c.mp4" }),
  ];
  const xml = buildFcpxml({ eventName: "Raw", clips, project: PROJECT });
  assert.equal(validate(xml), "");
  const t = tree(xml);
  assert.deepEqual(t.events[1].projects.map((p) => p.name), ["A-01 one", "From my notes", "A-03"]);
  assert.deepEqual(t.events[1].projects.map((p) => p.refs[0]), ["a1", "a2", "a3"]);
  assert.deepEqual(t.assets, ["a1", "a2", "a3"]);
});

test("a vertical timeline over a horizontal source does NOT inherit the source", { skip: !hasXmllint }, () => {
  const xml = buildFcpxml({ eventName: "Raw", clips: [clip()], project: PROJECT });
  const t = tree(xml);
  assert.equal(t.formats.r1, "1920x1080@1001/30000s", "source format stays on the asset");
  assert.equal(t.formats.r2, "1080x1920@1/30s", "timeline is vertical at the chosen rate");
  assert.equal(t.events[1].projects[0].fmt, "r2");
  assert.match(xml, /<asset [^>]*format="r1"/);
});

test("timeline choices: vertical, match source, custom, each with an explicit rate", () => {
  assert.deepEqual(resolveTimeline({ kind: "vertical", width: 1, height: 1, fps: "29.97" }, NTSC), { width: 1080, height: 1920, fps: { num: 30000, den: 1001 } });
  assert.deepEqual(resolveTimeline({ kind: "source", width: 1, height: 1, fps: "source" }, NTSC), { width: 1920, height: 1080, fps: { num: 30000, den: 1001 } });
  assert.deepEqual(resolveTimeline({ kind: "source", width: 1, height: 1, fps: "25" }, NTSC), { width: 1920, height: 1080, fps: { num: 25, den: 1 } });
  assert.deepEqual(resolveTimeline({ kind: "custom", width: 1080, height: 1080, fps: "24" }, NTSC), { width: 1080, height: 1080, fps: { num: 24, den: 1 } });
  // bad stored values fall back to vertical 1080x1920 at 30, never to the source
  assert.deepEqual(normalizeTimeline({ kind: "nope", fps: "banana", width: -4 }), { kind: "vertical", width: 1080, height: 1920, fps: "30" });
  assert.equal(normalizeTimeline({ kind: "vertical", fps: "source" }).fps, "30");
  assert.equal(DEFAULT_EDITOR_SETTINGS.timelineFormat.kind, "vertical");
  assert.equal(DEFAULT_EDITOR_SETTINGS.createProject, false);
});

test("a custom rate different from the source gives whole timeline frames", { skip: !hasXmllint }, () => {
  const xml = buildFcpxml({
    eventName: "Raw",
    clips: [clip()],
    project: { ...PROJECT, timeline: { kind: "custom", width: 1080, height: 1350, fps: "25" } },
  });
  assert.equal(validate(xml), "");
  assert.match(xml, /<sequence format="r2" duration="250\/25s"/); // 10.01 s source -> 250 frames
  assert.equal(tree(xml).formats.r2, "1080x1350@1/25s");
});

test("library goes in import-options (not <library location>), events are bare", { skip: !hasXmllint }, () => {
  const withLib = buildFcpxml({ eventName: "Raw", clips: [clip()], project: PROJECT, library: "/Users/me/Movies/Client A's Library.fcpbundle" });
  assert.equal(validate(withLib), "");
  const tw = tree(withLib);
  assert.equal(tw.library, "file:///Users/me/Movies/Client%20A%27s%20Library.fcpbundle");
  assert.ok(tw.library?.startsWith("file:///"));
  assert.match(withLib, /<option key="library location" value="file:\/\/\//);
  assert.deepEqual(tw.order, ["import-options", "resources", "event", "event"]);
  assert.equal(tw.hasLibraryEl, false);
  assert.ok(!withLib.includes("<library"), "the export-only <library location> must be gone");
  assert.ok(!withLib.includes("location=\""), "no location attribute anywhere");
  const without = buildFcpxml({ eventName: "Raw", clips: [clip()], project: PROJECT });
  assert.equal(validate(without), "");
  assert.equal(tree(without).library, null);
  assert.ok(!without.includes("import-options"));
  assert.deepEqual(tree(without).order, ["resources", "event", "event"]);
  const blank = buildFcpxml({ eventName: "Raw", clips: [clip()], library: "   " });
  assert.ok(!blank.includes("import-options"));
});

test("library accepts a file URL as is, and refuses a relative path", () => {
  assert.equal(libraryLocation("file:///Users/me/L.fcpbundle/"), "file:///Users/me/L.fcpbundle");
  assert.equal(libraryLocation("file:///Users/me/L.fcpbundle"), "file:///Users/me/L.fcpbundle");
  assert.equal(libraryPath("file:///Users/me/My%20L.fcpbundle/"), "/Users/me/My L.fcpbundle");
  assert.equal(libraryPath("/Users/me/L.fcpbundle"), "/Users/me/L.fcpbundle");
  assert.throws(() => libraryLocation("Movies/L.fcpbundle"), /relative/);
});

test("escaping: apostrophes, ampersands and non-Latin names in events, projects and library", { skip: !hasXmllint }, () => {
  const xml = buildFcpxml({
    eventName: `Bob's "raw" & co`,
    library: "/Users/me/\u65E5\u672C\u8A9E & Co/L's.fcpbundle",
    project: { ...PROJECT, eventName: "\u0645\u0631\u062D\u0628\u0627 <exports>" },
    clips: [clip({ label: "Tom & Jerry's \u0420\u0443\u0441" })],
  });
  assert.equal(validate(xml), "");
  const t = tree(xml);
  assert.equal(t.events[0].name, `Bob's "raw" & co`);
  assert.equal(t.events[1].name, "\u0645\u0631\u062D\u0628\u0627 <exports>");
  assert.equal(t.events[1].projects[0].name, "M-abc-01 Tom & Jerry's \u0420\u0443\u0441");
  assert.equal(decodeURIComponent(t.library ?? ""), "file:///Users/me/\u65E5\u672C\u8A9E & Co/L's.fcpbundle");
  assert.ok(!xml.includes("Tom & Jerry"), "raw ampersand must not appear");
});

test("project name: pattern tokens, dangling separators, per-clip override, duplicates", () => {
  const c = { id: "M-01", label: "hook" };
  assert.equal(projectNameFor(c, "{clipId} {label}"), "M-01 hook");
  assert.equal(projectNameFor({ id: "M-01" }, "{clipId} - {label}"), "M-01");
  assert.equal(projectNameFor(c, "{campaign}: {clipId}", { campaignName: "Shorts" }), "Shorts: M-01");
  assert.equal(projectNameFor({ id: "M-01", projectName: "  My   notes\u2014name " }, "{clipId}"), "My notes - name");
  assert.equal(projectNameFor({ id: "M-01" }, "{label}"), "M-01", "an empty name falls back to the id");
  assert.deepEqual(
    resolveProjectNames([{ id: "A", projectName: "Same" }, { id: "B", projectName: "Same" }, { id: "C", projectName: "Same" }], { namePattern: "{clipId}" }),
    ["Same", "Same 2", "Same 3"],
  );
});

test("same name for both events merges them into one event", { skip: !hasXmllint }, () => {
  const xml = buildFcpxml({ eventName: "Shared", clips: [clip()], project: { ...PROJECT, eventName: " Shared " } });
  assert.equal(validate(xml), "");
  const t = tree(xml);
  assert.equal(t.events.length, 1);
  assert.equal(t.events[0].clips.length, 1);
  assert.equal(t.events[0].projects.length, 1);
});

test("session batch with a project: names reported, library and timeline carried", async () => {
  const result = await buildSessionFcpxml(
    [
      { id: "A-01", label: "x", path: "/c/a.mp4", segments: [{ start: 0, end: 5 }] },
      { id: "A-02", path: "/c/b.mp4", segments: [{ start: 0, end: 5 }], projectName: "Typed" },
    ],
    "Raw",
    async () => ({ kind: "ffprobe", json: { streams: [{ codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "30000/1001" }], format: { duration: "5" } } }),
    { library: "/L/Client.fcpbundle", project: PROJECT, libraryExists: async (p) => p === "/L/Client.fcpbundle" },
  );
  assert.deepEqual(result.projectNames, ["A-01 x", "Typed"]);
  assert.match(result.xml, /<option key="library location" value="file:\/\/\/L\/Client\.fcpbundle"\/>/);
  assert.ok(!result.xml.includes("<library"));
  assert.equal((result.xml.match(/<project /g) ?? []).length, 2);
  assert.equal(validateIfPossible(result.xml), "");
});

function validateIfPossible(xml: string): string {
  return hasXmllint ? validate(xml) : "";
}

test("DTD check rejects a project outside an event (mutation guard for the structure)", { skip: !hasXmllint }, () => {
  const xml = buildFcpxml({ eventName: "Raw", clips: [clip()], project: PROJECT }).replace('<project name="M-abc-01 the hook">', '<project name="x"><bogus/>');
  assert.notEqual(validate(xml), "");
});

test("a file:// library URL containing & is escaped in the attribute", { skip: !hasXmllint }, () => {
  const xml = buildFcpxml({ eventName: "Raw", clips: [clip()], library: "file:///Users/me/A&B.fcpbundle" });
  assert.equal(validate(xml), "");
  assert.equal(tree(xml).library, "file:///Users/me/A&B.fcpbundle");
});

test("settings from an older version gain safe defaults for the new fields", () => {
  const s = normalizeEditorSettings({ afterCutting: "finalcut", eventName: "source" });
  assert.equal(s.fcpLibrary, "");
  assert.equal(s.createProject, false);
  assert.equal(s.projectEvent, "");
  assert.equal(s.projectNamePattern, "{clipId} {label}");
  assert.equal(s.timelineFormat.kind, "vertical");
  const t = normalizeEditorSettings({ fcpLibrary: "  /L/a.fcpbundle ", createProject: true, projectEvent: "X", timelineFormat: { kind: "custom", width: 1080, height: 1350, fps: "25" } });
  assert.equal(t.fcpLibrary, "/L/a.fcpbundle");
  assert.deepEqual(t.timelineFormat, { kind: "custom", width: 1080, height: 1350, fps: "25" });
});

const FFPROBE_5S = async () => ({ kind: "ffprobe" as const, json: { streams: [{ codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "30" }], format: { duration: "5" } } });
const ONE = [{ id: "A-01", path: "/c/a.mp4", segments: [{ start: 0, end: 5 }] }];

test("a library path that does not exist is refused, never sent", async () => {
  await assert.rejects(
    buildSessionFcpxml(ONE, "Raw", FFPROBE_5S, { library: "/L/Typo.fcpbundle", libraryExists: async () => false }),
    /no library at \/L\/Typo\.fcpbundle.*nothing was sent/s,
  );
});

test("a library that cannot be checked is refused too (fail closed)", async () => {
  await assert.rejects(buildSessionFcpxml(ONE, "Raw", FFPROBE_5S, { library: "/L/X.fcpbundle" }), /could not be checked/);
  // No library named: no check needed.
  const ok = await buildSessionFcpxml(ONE, "Raw", FFPROBE_5S);
  assert.ok(!ok.xml.includes("import-options"));
});

test("the checker receives the decoded local path, for a path or a file URL", async () => {
  const seen: string[] = [];
  const exists = async (p: string) => (seen.push(p), true);
  await buildSessionFcpxml(ONE, "Raw", FFPROBE_5S, { library: "file:///L/My%20Lib.fcpbundle/", libraryExists: exists });
  assert.deepEqual(seen, ["/L/My Lib.fcpbundle"]);
});

test("Premiere is not an After cutting choice", () => {
  assert.deepEqual([...AFTER_CUTTING_VALUES], ["nothing", "reveal", "finalcut"]);
});

test("the default project name pattern includes the clip id, so names do not collide by construction", () => {
  assert.ok(DEFAULT_PROJECT_PATTERN.includes("{clipId}"));
  assert.ok(DEFAULT_EDITOR_SETTINGS.projectNamePattern.includes("{clipId}"));
  // A blank pattern falls back to it.
  assert.equal(projectNameFor({ id: "M-07", label: "x" }, "  "), "M-07 x");
  const names = resolveProjectNames([{ id: "A", label: "same" }, { id: "B", label: "same" }], { namePattern: DEFAULT_PROJECT_PATTERN });
  assert.notEqual(names[0], names[1]);
});

// ---- D-9: one unusable clip must not take the batch down --------------------

test("session batch: a clip shorter than a timeline frame is left out with a reason, the rest are exported", { skip: !hasXmllint }, async () => {
  const probe = async (p: string) =>
    p.includes("tiny")
      ? { kind: "ffprobe" as const, json: { streams: [{ codec_type: "video", width: 1080, height: 1920, avg_frame_rate: "1000/1" }], format: { duration: "0.001" } } }
      : { kind: "ffprobe" as const, json: { streams: [{ codec_type: "video", width: 1080, height: 1920, avg_frame_rate: "30/1" }], format: { duration: "5" } } };
  const clips = [
    { id: "G-01", path: "/c/g1.mp4", segments: [{ start: 0, end: 5 }] },
    { id: "T-SUBFRAME", path: "/c/tiny.mp4", segments: [{ start: 0, end: 1 }] },
    { id: "G-02", path: "/c/g2.mp4", segments: [{ start: 0, end: 5 }] },
  ];
  for (const project of [PROJECT, undefined]) {
    const r = await buildSessionFcpxml(clips, "Raw", probe, { project });
    const sub = project ? 1 : 0; // without a project the same clip is a valid one-frame asset
    assert.equal(r.included, 2 + (1 - sub));
    assert.equal(r.skipped.length, sub);
    if (project) {
      assert.equal(r.skipped[0].id, "T-SUBFRAME");
      assert.match(r.skipped[0].reason, /shorter than one timeline frame/);
      assert.equal(r.projectNames.length, 2);
    }
    assert.equal(validate(r.xml), "");
  }
});

// ---- the user's own look ----------------------------------------------------
//
// The bundled DTD is 1.10 only, and its version attribute is fixed. So for exports written at
// 1.11 to 1.13 the check below validates the same document with only that attribute set back to
// 1.10: it proves the structure around the look is valid, not that Final Cut at 1.13 accepts it.
// Not verified in Final Cut (macOS only): see the PR for what to try on a Mac.

for (const version of ["1.10", "1.11", "1.12", "1.13"]) {
  test(`a project with the user's look (export version ${version}) keeps the look and validates against the DTD`, { skip: !hasXmllint }, () => {
    const look = parseLook(sampleExport({ version }));
    const xml = buildFcpxml({ eventName: "Raw", clips: [clip(), clip({ id: "B", path: "/x/b.mp4" })], project: { ...PROJECT, look } });
    assert.match(xml, new RegExp(`<fcpxml version="${version.replace(".", "\\.")}">`));
    assert.equal((xml.match(/<adjust-transform scale="1\.2 1\.2"\/>/g) ?? []).length, 2, "the look is on every project clip");
    assert.match(xml, /<effect id="fx1" name="Color Board"/);
    assert.equal(validate(xml.replace(/<fcpxml version="[\d.]+">/, '<fcpxml version="1.10">')), "");
  });
}

test("the look's DTD check can fail (mutation guard: an element the DTD does not know is rejected)", { skip: !hasXmllint }, () => {
  const look = parseLook(sampleExport({ clipChildren: '<adjust-transform scale="1.2 1.2"/><not-a-final-cut-element/>' }));
  const xml = buildFcpxml({ eventName: "Raw", clips: [clip()], project: { ...PROJECT, look } });
  assert.notEqual(validate(xml.replace(/<fcpxml version="[\d.]+">/, '<fcpxml version="1.10">')), "");
});
