# Audit run 1 — report

Eight areas audited in parallel against the real packaged-shape app, then
every blocker and major re-run from scratch by five independent verifiers who
wrote their own reproductions rather than re-running the originals.

## Counts

| | Filed | After verification |
|---|--:|--:|
| Blocker | 14 | **10** |
| Major | 54 | **27** |
| Minor | 70 | 100 |
| Polish | 13 | 14 |
| **Total** | **151** | **151** |

68 blocker/major findings were verified: **33 confirmed as filed, 31
downgraded, 3 duplicates, 1 raised, 0 refuted.**

Nothing was fabricated. Every measurement the verifiers re-took held up,
several to the pixel. What did not hold up was severity: roughly half of the
blocker/major set was filed too high, which is the expected failure mode of
an auditor who has just spent an hour inside one area.

## The ten blockers

| ID | What breaks | Where |
|---|---|---|
| A-1 | The sign-in modal cannot be dismissed, locking out anyone without a cookies.txt from an app that works signed out at 360p | `YouTubeConnectModal.tsx` |
| B-1 | Transcript search blanks the app and loses every unsaved mark, including on simply clearing the box | `TranscriptColumn.tsx` |
| B-2 | One global segment list shared by every tab; a tab can cut a range marked on a different video | `useSegments.ts` |
| C-1 | Two tabs plus a non-empty bank blanks the app (React #185) | `useSegments.ts` (same store) |
| D-2 | Saving a clip silently destroys a file of the same name and reports success | `electron/main.cjs` |
| E-2 | Clearing the cache mid-export empties comments.csv and transcripts.csv, then reports success | `resumeCache.ts` |
| E-3 | Two exports at once corrupt each other; the empty result overwrites the full one | `ChannelExportContext` |
| F-6 | "Copy log" puts live cookies, bearer tokens and the user's email on the clipboard, under UI copy promising it does not | `electron/main.cjs` |
| G-1 | Two downloads of the same clip share one work folder and delete each other's files; both report success | `server/index.ts` |
| G-12 | A settings.json with a BOM is destroyed during boot, taking the clip bank, with no backup | `settingsStore.cjs` |

## Root causes worth naming

Several findings are one defect seen from different angles. Fixing the cause
closes them all; fixing them one by one would not.

- **B-2 and C-1 are one bug.** `useSegments.ts` holds the clip in a
  module-level variable with no per-tab scope while `App.tsx` mounts every
  tab at once. B-2 is its `syncVideo` path, C-1 its `setBankedRanges` path.
  Scoping the store per tab closes both; no change to `ClipsColumn.tsx`
  alone can fix B-2.
- **H-3, H-4 and B-10 are one bug.** `electron/main.cjs:261` opens the window
  at 1100px; `ThreeColumnLayout.tsx:32` switches to three columns at
  `min-[1160px]`. The default window is narrower than the app's own
  breakpoint, so every first launch gets the stacked fallback with Cut
  clipped. Holding height constant and sweeping width: broken at 1159px,
  correct at 1160px.
- **F-6 and F-7 are two defects with one cause.** `redact()` works — the
  Copy-diagnostics bundle leaked 1 of 9 planted markers — but it is not
  applied in `diagnostics:copy` (main) or when `DownloadBar` renders
  `{error}` (renderer). Both leaked 9 of 9.
- **E-2 and G-8 share a deletion.** `clearCache` has no in-use marker, so it
  deletes files a running job still needs.

## Constraints the fixes must respect

- **A-1 before H-2, or together.** A focus trap alone makes A-1 *worse*: the
  keyboard crack is currently the only way to reach anything behind the gate.
- **The absence of a scrollbar is not a defect** (`CLAUDE.md`). Where content
  is unreachable, fix the reachability without restoring the bar.

## What held up

Reported because an audit that only lists failures misrepresents the system.

- The multi-segment cut, the product's headline feature: two ranges (5s + 8s)
  produce one file that real ffmpeg decodes at 13.02s; reconfirmed at 13.01s
  and 10.01s with three ranges including a reordered list.
- The Final Cut fix shipped in 4.0.1: 34 generated documents, all valid
  against Apple's real FCPXML 1.10 DTD, including a hostile matrix; a missing
  library fails closed with no stray library created in any run.
- No shell injection anywhere: 21 hostile URLs, each arriving as exactly one
  argv element, canary directory empty.
- Transcript windowing: 6,000 cues in ~660ms with 40 rows in the DOM. The
  original "it loads everything" diagnosis was wrong; the slowness is the
  layout breakpoint and every tab staying mounted.
- Token discipline: across 28 states and 1,795 text nodes, one off-token
  colour in the whole app, and the failing 3.25:1 tier is gone.
- All 58 palette symbols copy byte-exactly, combining marks included.
- No leakage between campaigns while switching: 24 of 24 assertions.
- Atomic cookie import: 48 malformed attempts and a SIGKILL disturbed nothing.

## Not provable in this container

- Real YouTube metadata, transcripts, downloads and signed-in 1080p
  behaviour — the network policy refuses the hosts.
- **D-1** (drag-out wedges the main process): reproduces 3/3, but there is no
  window manager or real pointer here, so a nested GTK drag loop can never
  receive a button release. Needs retesting on macOS. The product-side
  keeper is that `file:startDrag` is unguarded.
- Final Cut, Premiere and CapCut actually launching — macOS only.
- Installers, code signing and auto-update.

## Methodology notes

- **A harness flaw of our own:** `tsx` is a wrapper, so killing it orphans
  the server; with a fixed port a later run silently talks to the earlier
  run's server. It invalidated one verification run before being caught and
  probably explains some suspiciously identical repeat measurements in area
  G. Verifier harnesses pick a free port and kill the process group.
- **A-5's headline number was ours, not the app's.** "18 yt-dlp processes per
  sweep" only happens when every browser returns `inconclusive`, which is our
  stub's default. Real output gives 6.
- **H-6's premise** was unprovable from the repository and has since been
  confirmed by the user as a standing rule; it is recorded in `CLAUDE.md`.
