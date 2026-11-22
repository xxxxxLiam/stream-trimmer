# Area D scripts — output, folders and editor handoff

Audit scaffolding only. **No product code is changed or imported by any of
these.** Findings are in `audit/run-1/areas/D-output-handoff.md`; captured
output is in `out/logs/`, screenshots and generated documents elsewhere under
`out/`.

## Setup these scripts expect

```bash
# the stub root they run against (a copy of the harness stub plus the auth
# marker server/youtubeAuth.ts keys on, so the YouTube gate can be passed)
node audit/harness/make-stub-root.cjs <SCRATCH>/stubD2
cp audit/fixtures/fixture.mp4 <SCRATCH>/stubD2/fixture.mp4
# then insert, above `const argv = process.argv.slice(2);` in
# <SCRATCH>/stubD2/resources/bin/yt-dlp:
#   process.stderr.write("Found YouTube account cookies\n");

# media the FCPXML matrix probes with real ffprobe
mkdir -p <SCRATCH>/Dmedia && cd <SCRATCH>/Dmedia
cp audit/fixtures/fixture.mp4 clip30.mp4
ffmpeg -f lavfi -i "testsrc=s=640x360:r=30000/1001:d=3" -f lavfi -i "sine=f=440:r=48000:d=3" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest ntsc.mp4
ffmpeg -f lavfi -i "color=c=black:s=320x240:r=1000:d=0.001" -c:v libx264 \
  -pix_fmt yuv420p -video_track_timescale 1000 tiny.mp4
printf '' > empty.mp4
ffmpeg -f lavfi -i "sine=f=440:d=2" -c:a aac audioonly.m4a
```

`SCRATCH` is the session scratchpad path hard-coded at the top of `lib-D.cjs`
and of each standalone script; Apple's `FCPXMLv1_10.dtd` sits beside it.

## The scripts

| Script | Needs Electron | What it proves |
|---|---|---|
| `00-smoke.cjs` | yes | the harness drives the app; what the preload exposes |
| `10-ipc-hostile.cjs` | yes | 100 hostile `file:*`/`clip:*`/`export:save`/`editor:*` calls, with a filesystem diff and a liveness probe — D-6, D-7, D-11, D-12, D-13, D-20 |
| `11-startdrag-freeze.cjs` | yes | `file:startDrag` wedges the main process; `--control` is the same run with a path that does not exist — D-1 |
| `20-fcpxml-matrix.cjs` | no | the FCPXML hostile-input matrix, validated against Apple's 1.10 DTD |
| `25-batch-abort.cjs` | no | one bad clip loses the batch (D-9); the clips/data separation rule (D-15) |
| `30-folders.cjs` | — | superseded; kept as the record that `window.electronAPI` cannot be patched from the renderer |
| `31-folders-real.cjs` | yes | choosing the clips and data folders separately, with Electron's dialog replaced — D-15, D-21, D-24, D-25 |
| `40-handoff-e2e.cjs` | yes | the whole handoff panel end to end — D-5, D-16, D-17 and the passes |
| `50-save-interruptions.cjs` | yes | saving a clip, filename collision, folder lost mid-download — D-2, D-10 |
| `60-symbols-copyblocks.cjs` | yes | copy blocks (D-3); first symbol pass, which exposed the duplicate names |
| `61-symbols-exact.cjs` | yes | all 58 symbols byte-exact, addressed by section — D-14 and D-PASS-5 |
| `70-state-order-drag.cjs` | yes | old state shapes, no campaign, the silent after-cutting failure, the real drag — D-1, D-4, D-8, D-18 |
| `80-order-unwritable.cjs` | yes | targets that are files or have no parent; CapCut collision policy — D-19 |
| `90-campaign-switch.cjs` | yes | switching campaign re-points the folders |
| `95-user-stories.cjs` | yes | stories 3, 4, 11, 12 |
| `96-three-clips.cjs` | yes | three clips in one send, and what blocked it (the cross-area used-ranges defect) |
| `lib-D.cjs`, `lib-cut.cjs` | — | shared boot/cut helpers |

Run the Electron ones under a virtual display:

```
xvfb-run -a --server-args="-screen 0 1440x900x24" node audit/run-1/area-D/<script>.cjs
```

`11-startdrag-freeze.cjs` and `70-state-order-drag.cjs` deliberately leave a
wedged Electron process behind; clean up with
`pkill -9 -f "user-data-dir=/tmp/clipper-"`.
