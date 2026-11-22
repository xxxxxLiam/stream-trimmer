# RB — core loop and layout (run 2)

Status: B2-1/H2-1 fixed. H2-2 fixed at 125%, partial at 150% and above. B2-3 fixed. B2-4 and B2-5 fixed (one cause).
Suite: 649/649 (609 before, plus 40 including the other threads' tests). `tsc --noEmit` is clean. Nothing committed.

## What changed
- `MarkBar.tsx`: the sticky Cut row is gone. Order is now In/Out/Add, then the overlap warning, then Stitched total + Cut (in flow, directly under Add), then the segment list. The list is the part that grows, so Cut never moves when segments are added and never covers anything.
- `SegmentList.tsx`: the list scrolls inside `.seg-scroll`. Every row is a button, so Tab reaches all of them, and the browser scrolls the list to the focused row.
- `styles.css`:
  - The video box is capped by viewport height (`.cols-centre .aspect-video`, with a tighter cap while a list is open, floor 150px wide).
  - `.seg-scroll` has `max-height: clamp(112px, 100vh - 620px, 280px)`.
  - Three-column breakpoint 960 -> 840, so 1100/1.25 = 880 stays three-column and 900 gets it too.
  - Below 840 the columns wrap with the mark column first.
  - The duplicate scrollbar rule, the duplicate `.cols-host` and the duplicate container block are gone (H2-12), and so is `.cut-row`.
  - The scrollbar rule is unchanged: one copy, still 0-width.
- `ThreeColumnLayout.tsx`: `THREE_COLUMN_MIN_PX = 840`.
- `useSegments.ts`: `restore()` arms an "awaiting video" guard. `syncVideo(null)` is ignored until the clipper reaches the restored video, then normal behaviour resumes. This is the B2-4/B2-5 fix.
- `clip.ts`: `extractVideoId` rewritten.
  - Accepts `/live/`, `/embed/`, `/shorts/`, `/v/`, `/e/`, `watch?v=`, `youtu.be`, `m.`/`music.`, `youtube-nocookie.com`, a trailing slash, `?si=`/`&t=` tracking, a scheme-less paste and surrounding whitespace.
  - Refuses channels, `@handle/live`, playlists, search, bare words and non-YouTube hosts.
  - `?v=` on a non-YouTube host is now refused. That is stricter than before.
  - `/clip/<id>` is still refused: it is not a video id.
- `useClipper.ts`: NOT touched by me. RD's AF2-2 effect is already in HEAD (`git diff` on the file is empty), so there is nothing to reconcile.

## Tests and negative controls
| ID | Test | Negative control | Result |
|---|---|---|---|
| B2-3 | `src/lib/clip.test.ts` (3 tests) | removed `"live"` from the path kinds | FAILS (2 tests); restored, passes. Real app: base refuses `/live/` with "not a single video", new loads it. |
| B2-4/B2-5 | `useSegments.test.ts` (+3 tests) | `restore()` no longer arms the guard | FAILS (restored clip wiped); restored, passes. |
| B2-4/B2-5 end to end | `b09-b8-tab-memory.cjs` on HEAD tree vs fixed tree | HEAD tree | HEAD: reopened tab `rows: []`, relaunch rewrites the record with no `segments`. Fixed: reopened tab keeps `00:02:00-00:02:30`, relaunch keeps both tabs' segments, and the record on disk keeps them. |
| B2-1/H2-1 | `MarkBar.cutRow.test.ts` rewritten (5 tests: no sticky, order, list scroller, height cap, one scrollbar rule). `ThreeColumnLayout.test.tsx` updated (125% zoom step, minimum window, mark column first). | not run as a source revert | Real mouse click on segment 1's x at its drawn coordinates, 1100x760. HEAD: top element `#ui-cut-row`, count 1 -> 1 and 4 -> 4. Fixed: reaches the x, 1 -> 0 and 4 -> 3. |

The B2-1/H2-1 source-level tests were not reverted individually. The hit-test runs below against the HEAD build are the control.

## Hit-test (9 points per control, scrollTop 0 on host and centre, segments added with Ctrl+Shift+Enter, real Electron)
Columns: In / Out / Whole / Add / Cut. "all" means every control scored 9/9. HEAD baseline at 1100x760: In/Out/Whole/Add/Cut all 9/9, but the first segment's x scored 3/9 and rows 2-4 scored 0/9.

| Window | Zoom (CSS px) | 0 / 1 / 4 / 5 segments |
|---|---|---|
| 900x600 | 100% | all 9/9 (Cut was OFFSCREEN before) |
| 1100x760 | 100% | all 9/9; row x 9/9 for rows 1-2 with 4 or 5 segments |
| 1100x760 | 125% (880x608) | all 9/9 |
| 1100x760 | 150% (733x507, wrapped) | all 9/9 |
| 1160x760 | 100% | all 9/9 |
| 1160x760 | 125% | all 9/9 |
| 1280x800 | 100% / 125% / 150% | all 9/9 |
| 1440x900 | 100% / 125% / 150% / 175% | all 9/9 |

Failures remain only where the CSS viewport is shorter than about 480px:
- 1100x760 at 175% (628x434): Cut 6/9.
- 1100x760 at 200% (550x380): Cut 0/9.
- 1280x800 at 175% and 200%: Cut 0/9.
- 1440x900 at 200%: Cut 0/9.
- 900x600 at 125% or more: Cut 3/9 or less. This is moot, since the minimum becomes 1160x760.

In these cases In, Out, Whole and Add are still 9/9 (except 900x600 at 175% and above). Cut is one scroll away, still inside the scroller.
- The header wraps to two or three rows at those zooms and eats the height. That is not in my files.
- The 1100x760 at 150% result needed the 150px player floor, `gap-3`, `pt-2` and a vertically centred Cut.

## Segment rows
With four or five segments, rows beyond the visible list are inside the list's own scroller, not hit-testable until scrolled. Measured at 1100x760: the list shows two rows plus half of a third, rows 1-2 score 9/9, and row 3 appears as "inlist" (clipped by the list's own scroller) in the run output.
- Keyboard: focusing row 5's button scrolls the list to it (scrollTop 151, x inside the list).
- Wheel over the list scrolls it (scrollTop 150).
- Scrollbar rule: 6 scrollers on the main screen, 0 gutters (`offsetWidth - clientWidth`), `scrollbar-width: none` on all, no horizontal page scroll (docScrollWidth equals the viewport width).

## Regressions re-run against the fixed build
- `b01` (two tabs, same video, bank live, third tab): never crashed, 0 React errors.
- `b02` (per-tab stores): tab 1 keeps its two segments, tab 2 cuts only its own range, `crashed:false`.
- `b10` (multi-segment cut): one file, decoded 13.01s, 0 frames before any in-point, 0 outside every mark.

## Not verified / caveats
- Real YouTube: not verified against real YouTube (stub yt-dlp). `/live/` is proven only as "the client no longer refuses it and sends the canonical watch URL".
- Player at the floor: at the 150px floor the "owner blocks playback" fallback text overflows its box (PreviewPanel, not mine). The real iframe was not seen at that size.
- Tab order: in wrapped mode (below 840) the mark column comes first visually through CSS `order`, while DOM order is unchanged. Tab order therefore differs from visual order in that mode only.
- Help drawer (B2-2): at 1100 it leaves 700px, which wraps; the mark column now comes first so In/Out/Add/Cut are what you see, but I did not re-measure that case.
- Selector assumption: the centre column's first child must be PreviewPanel for the player cap to apply (it targets `.aspect-video` inside `.cols-centre`).

## Needed but not owned
- Header height at high zoom (wraps to 2-3 rows) is what remains of H2-2 at 175% and above.
- `electron/main.cjs` minimum size, which the coordinator is changing.
- `PreviewPanel` blocked-embed fallback at very small boxes.
