# Audit run 2 — report

Run 2 re-audited the fixed app across all eight areas, asking three questions
in order: did the fixes hold, what did the fixes break, and what did run 1
miss.

## Counts

| | Run 1 (verified) | Run 2 |
|---|--:|--:|
| Blocker | 10 | **1** |
| Major | 27 | **18** |
| Minor | 100 | 52 |
| Polish | 14 | 13 |
| **Total** | **151** | **84** |

| Area | Blocker | Major | Minor | Polish |
|---|--:|--:|--:|--:|
| B core loop | 0 | 6 | 6 | 1 |
| C+D bank and output | 1 | 2 | 11 | 3 |
| E exporter and owner gate | 0 | 2 | 12 | 1 |
| A+F sign-in and help | 0 | 3 | 9 | 2 |
| G server and jobs | 0 | 2 | 7 | 3 |
| H accessibility and layout | 0 | 3 | 7 | 3 |

## Did the fixes hold?

**Yes, almost entirely.** Of the 37 blocker and major findings fixed in run 1,
run 2 found two regressions in the fix itself (G2-1, B2-3) and confirmed the
rest held, most against controls that fail on demand.

The two blockers nobody had proven are now proven, with controls:

- **C-1** — run 1's code blanks the window **every run** (React error #185,
  `#root` empty). The fixed tree survives two tabs on the same video, four
  fast switches, a third tab, and a segment added with the bank live in both.
- **B-2** — run 1's code reproduced the exact artefact from the original
  report: `Video AAA [00-00-02-00-00-05].mp4`, AAA cut at a range only ever
  marked on BBB. The fixed tree gives each tab its own ranges.

One correction to the run 1 record: reverting the `ClipsColumn` call site
**alone does not** reproduce the C-1 crash. The per-tab store is the fix; the
loop needed both `ClipsColumn`s *reading* the same store, not merely writing
it. The call site is still load-bearing for a different defect — a restored
hidden tab painting no banked span — which it also closes.

Other things re-proved rather than assumed:

- **The multi-segment cut**: 5s + 8s → one file at 13.01s, frame-identified
  against all 750 source frames — 326 delivered, 325 marked, 325 distinct,
  **0 pre-roll frames, 0 frames outside the marks** — on the sectioned path
  *and* the local-trim path T1 rewrote. The pre-roll fix cost no marked
  content.
- **FCPXML**: 34 documents, all valid against Apple's real 1.10 DTD, zero
  `<library>` elements, no stray library from any refused send.
- **Campaign isolation**: 24 of 24, with a slug campaign and an opaque one
  side by side.
- **The scrollbar rule**: 36 scrollers over 29 surface/state combinations,
  zero painted gutters, every one still reachable by wheel and by Tab.
- **Sign-in focus**: 40 of 40 Tab presses stay inside the dialog (run 1: 35
  of 40 escaped).
- **Help anchors**: 27 of 27 exist in the live DOM (run 1: 19 of 26 absent).
- **The owner build still works**: a packaged owner build completes an export
  end to end from the baked list alone, so the lockout risk did not land.
- **The public bundle**: 57 additional needles, all zero, across two
  byte-identical rebuilds.

## What the fixes broke

This is what run 2 existed to find, and it found nine defects that did not
exist before the fixes.

| ID | Severity | What the fix did |
|---|---|---|
| **CD2-1** | blocker | D-5 stopped the document shrinking — and made the session batch cross campaigns, so one client's clips land in another client's library |
| **B2-1 / H2-1** | major | The sticky Cut row (added so Cut was not below the fold) now covers the segment list at 1100x760 and the whole mark bar at heights 600–660 |
| **B2-3** | major | B-5's "no video id" guard refuses `youtube.com/live/<id>`, the canonical link for a stream |
| **G2-1** | major | G-1's per-request folder means a dropped **single-range** download now loses every byte it fetched |
| **AF2-3** | major | F-3's portalled help button opens a drawer inside H-2's `inert` subtree: visible, dead, and click-through onto the button beneath |
| **AF2-2** | major | A-1's escape route is undermined by a fresh install defaulting to Best quality, so the skipped user's first Cut is refused |
| **E2-1** | major | E-1 gated the folder name in the renderer but not in `settingsStore.cjs`, so a public build shows `channel-data` on screen |
| **E2-2** | major | E-4's `export:save` guard trusts a boolean the page can set itself |
| **H2-3** | major | T10's eleven new help anchors are duplicated by a second tab, breaking every one of them and the transcript search's accessible name |

Two of these are worse than what they replaced: **CD2-1** (a cross-campaign
media leak in place of a too-small document) and **B2-1/H2-1** (the controls
you use *before* Cut are now hidden in order to reveal Cut).

## What run 1 missed

Fresh defects, found only because run 2 looked again:

- **B2-5** — a relaunch restores each tab's URL and **silently discards every
  tab's unsaved marks, then overwrites them on disk**. `MarkBar`'s mount-time
  `syncVideo(null)` clears what `TabBridge.restore()` just restored. B2-4 is
  the same bug on Ctrl+Shift+T, where the dialog explicitly promises the tab
  comes back.
- **AF2-1** — `diagnostics:read` is unredacted while `diagnostics:copy` is.
  The connect screen prints the raw log directly under the line promising "no
  cookies, tokens or personal data": 7 of 15 planted markers, including an
  email and home paths.
- **G2-2** — the new host allowlist is defeated by one backslash.
  `https://www.youtube.com\@evil.example/x` passes because Node's `URL` reads
  the host as `www.youtube.com` while Python's `urlsplit` — yt-dlp's own
  parser — reads `evil.example`. The other 36 hostile URLs are refused.
- **H2-2** — one zoom step at the default window drops below the 960px
  container threshold and undoes the layout fix entirely.
- **CD2-2 / CD2-3** — a banked cut records its used range against the wrong
  client, and the handoff panel offers another client's file path.
- **CD2-10** — "Export comments" is fully built with no control that calls it.

## Still open from run 1, by design

The action plan covered the 37 blocker and major findings only. The ~100
minor and 14 polish findings were deliberately deferred and remain open;
several were re-confirmed this run (B2-10 through B2-13, H-1's 2.016:1
contrast, H-5's invisible focus ring, G-11's HTML stack traces on 42 of 91
malformed bodies).

## Costs the fixes introduced

- The pre-roll fix makes local trim **43–140× slower** than the old copy —
  about 158s of CPU for a 600s 1080p cut. Nothing times out.
- The `ytchanwip-` prefix hides a crashed export's folder from cache
  accounting, so the user is told there is 0 B to reclaim while a
  whole-channel checkpoint sits in `/tmp`.

## Not provable here, unchanged

Real YouTube, signed-in 1080p, the editors actually launching, installers,
auto-update, and the macOS drag-out freeze (D-1), whose guard is fixed but
whose real symptom needs a window manager.
