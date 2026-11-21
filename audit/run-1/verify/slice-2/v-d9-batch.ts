/**
 * slice-2 verification of D-9 ("one clip shorter than a timeline frame throws
 * away the whole batch"), written from the finding's Steps.
 *
 * The product module src/lib/fcpxml.ts is imported UNCHANGED (tsx, no
 * recompilation step of my own) and driven with real files and the real ffprobe
 * invocation electron/editorOpen.cjs: probeMedia uses
 * (`-v error -print_format json -show_streams -show_format`).
 *
 * Cases, as the finding states them:
 *   A  3 good clips + one 0-byte .mp4 that cannot be probed, project ON
 *   B  3 good clips + one real 1-frame 1000 fps file (0.001 s), project ON
 *   C  case B with project OFF
 * Plus two extra cases of my own, to test whether the claimed cause is the
 * cause and whether it is reachable with ordinary media:
 *   D  one real 1-frame 60 fps clip (0.0167 s) on the default 30 fps timeline
 *   E  case B with the timeline set to "source" (fps follows the media)
 *
 * Usage: npx tsx audit/run-1/verify/slice-2/v-d9-batch.ts [tag]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildSessionFcpxml,
  DEFAULT_TIMELINE,
  type FcpxmlProject,
  type RawProbe,
} from "/home/user/stream-trimmer/src/lib/fcpxml.ts";

const REPO = "/home/user/stream-trimmer";
const FFMPEG = path.join(REPO, "resources", "bin", "ffmpeg");
const FFPROBE = "/usr/bin/ffprobe";
const FIXTURE = path.join(REPO, "audit", "fixtures", "fixture.mp4");
const TAG = process.argv[2] || "a";
const OUT = path.join(REPO, "audit", "run-1", "verify", "slice-2", "out", `d9-${TAG}`);

const probe = async (file: string): Promise<RawProbe> => {
  const r = spawnSync(
    FFPROBE,
    ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file],
    { encoding: "utf8", maxBuffer: 8 << 20 },
  );
  if (r.status !== 0) throw new Error(`ffprobe could not read ${path.basename(file)}: ${(r.stderr || "").trim()}`);
  return { kind: "ffprobe", json: JSON.parse(r.stdout) };
};

const project = (timeline = DEFAULT_TIMELINE): FcpxmlProject => ({
  eventName: "Projects",
  namePattern: "{clipId}",
  timeline,
  campaignName: "Audit",
  sourceTitle: "Stub video",
});

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "v-d9-"));

  // three good clips, really cut from the fixture
  const good: Array<{ id: string; path: string; segments: never[] }> = [];
  for (let i = 0; i < 3; i++) {
    const p = path.join(work, `good-${i + 1}.mp4`);
    spawnSync(FFMPEG, ["-y", "-ss", String(i * 3), "-to", String(i * 3 + 2), "-i", FIXTURE, "-c", "copy", p]);
    good.push({ id: `M-GOOD-${i + 1}`, path: p, segments: [] });
  }
  // a 0-byte mp4: probes as a failure
  const brokenPath = path.join(work, "broken.mp4");
  fs.writeFileSync(brokenPath, "");
  // a real one-frame 1000 fps file: 0.001 s
  const subPath = path.join(work, "subframe.mp4");
  spawnSync(FFMPEG, [
    "-y", "-f", "lavfi", "-i", "testsrc=size=64x64:rate=1000:duration=0.001",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", subPath,
  ]);
  // a real one-frame 60 fps file: 0.0167 s — ordinary media, sub-frame at 30 fps
  const p60 = path.join(work, "one-frame-60fps.mp4");
  spawnSync(FFMPEG, [
    "-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=60:duration=0.0167",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", p60,
  ]);

  const describe = (f: string) => {
    const r = spawnSync(FFPROBE, ["-v", "error", "-show_entries", "stream=r_frame_rate,nb_frames,duration:format=duration", "-of", "default=noprint_wrappers=1", f], { encoding: "utf8" });
    return (r.stdout || "").trim().replace(/\n/g, " ");
  };

  const cases: Array<{ name: string; clips: any[]; project?: FcpxmlProject }> = [
    { name: "A-unprobeable-project-on", clips: [...good, { id: "M-BROKEN", path: brokenPath, segments: [] }], project: project() },
    { name: "B-subframe-project-on", clips: [...good, { id: "M-SUBFRAME", path: subPath, segments: [] }], project: project() },
    { name: "C-subframe-project-off", clips: [...good, { id: "M-SUBFRAME", path: subPath, segments: [] }] },
    { name: "D-oneframe60fps-project-on", clips: [...good, { id: "M-60FPS", path: p60, segments: [] }], project: project() },
    { name: "E-subframe-source-timeline", clips: [...good, { id: "M-SUBFRAME", path: subPath, segments: [] }], project: project({ kind: "source", width: 1080, height: 1920, fps: "source" }) },
  ];

  const results: any[] = [];
  for (const c of cases) {
    let row: any = { case: c.name };
    try {
      const r = await buildSessionFcpxml(c.clips, "Raw clips", probe, { project: c.project });
      const file = path.join(OUT, `${c.name}.fcpxml`);
      fs.writeFileSync(file, r.xml);
      row = {
        ...row,
        threw: false,
        included: r.included,
        projects: r.projectNames.length,
        skipped: r.skipped,
        documentWritten: file,
        assetCount: (r.xml.match(/<asset /g) || []).length,
        projectCount: (r.xml.match(/<project /g) || []).length,
      };
    } catch (err) {
      row = { ...row, threw: true, error: err instanceof Error ? err.message : String(err), documentWritten: null };
    }
    results.push(row);
  }

  const report = {
    tag: TAG,
    media: {
      good: good.map((g) => describe(g.path)),
      brokenBytes: fs.statSync(brokenPath).size,
      subframe: describe(subPath),
      oneFrame60fps: describe(p60),
    },
    defaultTimeline: DEFAULT_TIMELINE,
    cases: results,
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  fs.rmSync(work, { recursive: true, force: true });
}

main();
