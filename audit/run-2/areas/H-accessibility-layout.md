# Run 2 — Area H: accessibility, layout and visual consistency

Scope: every screen, overlay and state reachable in this container, **measured
only**. Where a measurement touches behaviour it is noted and handed on.
No product code was changed. Scaffolding is `audit/run-2/area-H/`; raw
measurements `audit/run-2/area-H/out/data/*.json` (+ the captured run logs
`*.log`), screenshots `audit/run-2/area-H/out/*/`.

**Totals: 0 blocker, 3 major, 7 minor, 3 polish.** 13 findings, all `confirmed`.

## Verdict per fix

| Fix | Verdict | One line |
|---|---|---|
| **H-3 / H-4 / B-10** (container query at 960) | **HELD** | Three columns appear at exactly ≥960px of host width; the app's real default 1100x760 gets them with every critical control in view and hit-testable at 0, 2 and 5 segments. Two boundary cases fall outside the fix: the 900px **minimum** window is still below 960 (H2-4), and one zoom step at the default window drops the viewport under 960 (H2-2). |
| **H-6** (scrollbars) | **HELD** | 36 live scrollers across 29 surface/state combinations: **0 painted gutters**, computed `scrollbar-width: none` on every one, wheel reaches the bottom on every one, and a **real Tab route** reaches every one — including the scrollers with no focusable children. Table below. |
| **H-1** (disabled Reload at 2.01:1) | **NOT FIXED** — never assigned | Re-measured from computed styles: **2.016:1**, pixel cross-check 1.98:1. `UrlBar.tsx:54` is byte-identical to run 1. Filed as H2-7. |
| **H-5** (invisible focus on tab close) | **NOT FIXED** — never assigned | Still Tab stop 2 from a cold start; focus ring computes, paint SHA identical before/after. Filed as H2-8. |
| **H-2** (sign-in modal focus) | **HELD** | Initial focus inside the dialog, **40 of 40 Tab presses stay inside**, the background is inert and aria-hidden through an ancestor, the scrim eats the pointer, Escape closes it. One hole: the portalled Help button stays live on top of it (H2-6). |
| **The sticky primary action** (T10 item 4) | **REGRESSED** | Cut is reachable as claimed, but the 91px sticky row **covers the whole mark bar at every width ≥960 whenever the window is 600–660px tall**, in the scroll position the app presents. Filed as H2-1. |
| **The portalled help button** (T8) | **HELD** | Box identical to its placeholder (delta 0,0) on 7 screens × 4 sizes, exactly one `#ui-help-button`, placeholder `visibility:hidden` + `pointer-events:none` + `aria-hidden`, no gap, no double control. Two faults remain: its Tab position no longer matches where it is drawn (H2-9), and it stays live and clickable over the sign-in gate (H2-6). |

**Usability at 900x600, the app's own advertised minimum: usable, but the
mark→cut loop costs a scroll per clip.** Nothing is unreachable. The mark bar is
in view and clickable as the window opens; Cut sits at y=616..652 (0 segments),
685..721 (2) or 845..881 (5) in a 600px viewport, and the whole Clips column at
768..1008 / 837..1077 / 997..1237. All of it is reached by wheel (scrollTop
0→446/515/675), by **End** on the workspace scroller — which is
`role="region" tabindex="0" aria-label="Workspace"`, so a keyboard user can
focus it — and by Tab, which scrolls `#ui-cut` into view after 8, 10 or 16
presses (`inView: true` each time). What the size cannot do is show the mark bar
and Cut at once, so every clip needs a scroll down to Cut and a scroll back up.
That is H2-4, and it is the honest residue of H-3 rather than a new break.

## The scrollbar-and-reachability table (H-6)

Every surface the brief named, opened and made to overflow for real. `gutter` is
`offsetWidth − clientWidth − borders`, i.e. layout space a bar would occupy;
`keyboard` presses **Tab from the top of the document** until focus lands inside,
then drives PageDown / End / arrows. Proof: `out/data/scrollbars.json`,
`out/data/scrollbars2.json`, `out/data/pre.json`, `out/data/extras.json`,
`out/data/channel.json`.

| Surface | Scroller | hidden | gutter Y/X | `scrollbar-width` | Bar painted? | Wheel | Keyboard route (real Tab) |
|---|---|---|---|---|---|---|---|
| Workspace stack, wrapped (900x600) | `div.cols-host` | 446px | 0 / 0 | none | no | to the bottom | the scroller itself, `tabindex=0`, `aria-label="Workspace"`; End/PageDown 446/446 |
| Help drawer body (1280x600) | `div.min-h-0.flex-1.overflow-y-auto` | 150px | 0 / 0 | none | no | to the bottom | Tab ×14 → a result button; PageDown/End 150/150 |
| Help drawer, search results | same | 87px | 0 / 0 | none | no | to the bottom | Tab ×14; 87/87 |
| Setup checklist | `#help-setup-panel` | 612px | 0 / 0 | none | no | 611/612 | Tab ×13 → button; PageDown/End 612/612 |
| Copy blocks list | `ul.flex.min-h-0.flex-col` | 55px | 0 / 0 | none | no | to the bottom | Tab ×17 → `#ui-copy-block-source`; 55/55 |
| Symbols palette | `#ui-symbol-list` | 310px | 0 / 0 | none | no | to the bottom | Tab ×15 → "Copy Bismillah"; PageDown/End 310/310 |
| Settings popover | — | — | — | — | — | — | **does not overflow** ("No app settings yet"); nothing to reach |
| Campaign menu, 20 campaigns | `#ui-col-centre` (the panel itself does not overflow) | 195px | 0 / 0 | none | no | to the bottom | Tab ×74 → button; 195/195 |
| Clips column, Bank, 60 rows | `div.flex.min-h-0.flex-1` inside `#ui-col-clips` | **7932px** | 0 / 0 | none | no | 7931/7932 | Tab ×22 lands inside; PageDown 7225 and climbing |
| Clips column, All saved | `#ui-col-centre` | 129px | 0 / 0 | none | no | to the bottom | Tab ×9; 129/129 |
| Import timestamps panel | `#ui-col-centre` | 129px | 0 / 0 | none | no | to the bottom | Tab ×9; 129/129 |
| Sign-in modal card (1000x600) | `#ui-col-centre` behind it; the card itself did not overflow at any size reached | 220px | 0 / 0 | none | no | to the bottom | Tab ×13; 220/220 |
| Sign-in modal `<pre>` ("Technical details") | `pre.max-h-32.overflow-auto`, 330×104px | 305px | 0 / 0 | none | no | n/a (inside the card) | **Tab ×4 reaches the `<pre>` itself** (`tabindex` absent, `tabIndex` −1; Chromium makes a childless scroller focusable); PageDown and End both 305/305, ArrowDown 214 |
| Import timestamps `<pre>` ("Accepted shapes", overflow-x) | `pre.overflow-x-auto`, 232px wide | 86px (x) | 0 / 0 | none | no | n/a (horizontal) | the `<pre>` takes focus programmatically; full text is also in its text content |
| Footer format popover | `#ui-col-centre` | 74px | 0 / 0 | none | no | to the bottom | Tab ×9; 74/74 |
| Tab strip, 25 tabs (horizontal) | `div.overflow-x-auto` | 116px (x) | 0 / 0 | none | no | to the bottom | every tab is `tabindex=0` |
| Transcript column | `#ui-col-centre` | 184px | 0 / 0 | none | no | to the bottom | Tab ×9; 184/184 |
| Diagnostics after a failed cut | `#ui-col-centre` | 509px | 0 / 0 | none | no | to the bottom | Tab ×1 → a segment row; 509/509 |
| Channel exporter (owner build, 1000x600) | `div.min-h-0.min-w-0` | 6px | 0 / 0 | none | no | 6/6 | Tab ×11 lands inside; PageDown 6/6 |

**Summary: 36 scrollers, 0 painted bars, 0 unreachable by wheel, 0 unreachable by
keyboard.** The only computed value of `scrollbar-width` anywhere in the app is
`none`. Per CLAUDE.md the absent bar is not a defect, and nothing was found
hiding behind one.

Two of the five `<pre>` overflow blocks could not be driven here:
`DiagnosticsDisclosure.tsx:167` needs a captured log file (the failed cut put
its text in the `role="alert"` instead) and `ErrorBoundary.tsx:34` needs a real
render throw — **not provable here**. Both inherit the same base-layer rule as
the three that were measured, so the bar is suppressed by the same CSS; that half
is code reading, i.e. `likely`, not confirmed.

## The contrast numbers

Recomputed from the computed styles of the running app with a WCAG 2.x
implementation written for this run (`run-contrast.cjs`, the `WCAG` function),
printed term by term, then cross-checked against the painted pixels.

**The disabled Reload label** (`button[aria-label="Reload source"]`, `disabled`
is `true` in the DOM):

```
declared colour   rgb(150,150,151) = #969697    13px button / 12px span, weight 400
opacity chain     [{ el: "button[Reload source]", opacity: 0.4 }]  -> effective 0.4
background        div.group.flex  rgb(28,28,31) = #1C1C1F  (first opaque ancestor)
RENDERED          0.4 x #969697 over #1C1C1F = #4D4D4F = [77, 77, 79]

linearised text   [0.073823, 0.073823, 0.078187]
linearised bg     [0.011612, 0.011612, 0.013702]
L_text = 0.2126(0.073823) + 0.7152(0.073823) + 0.0722(0.078187) = 0.074138
L_bg   = 0.2126(0.011612) + 0.7152(0.011612) + 0.0722(0.013702) = 0.011763
ratio  = (0.074138 + 0.05) / (0.011763 + 0.05) = 2.016 : 1      required 4.5
```

Pixel cross-check over the label's own line box: 1196px sampled, 73 distinct
colours, background `#1C1C1F` (81.4% of the box), glyph core `#4C4C4E` →
**1.98:1**. The same control in the live **Loading** state (stub `delayMs: 9000`)
is identical: `#4D4D4F` on `#1C1C1F`, 2.016:1.

The correctly tokenised disabled controls on the same screen, through the same
arithmetic: `#ui-mark-whole`, `#ui-cut`, `#ui-add-segment`, `#ui-mark-in` all
`#909092` on `#1C1C1F` = **5.335:1** at effective opacity 1. Run 1's finding and
slice 5's independent recomputation both stand to three decimals.

**The sweep.** 17 states, **987 visible text nodes**, collapsing to **97 distinct
colour × background × size × weight combinations**, and exactly **two** failures
on both the pixel and the CSS reading — the same control in its two labels
("Reload", "Loading"). Everything else passes. Token discipline is intact:
across every state the only text colours are `#F5F5F7`, `#969697`, `#909092`,
`#0B0B0C` (accent.on) and `#FF6363`; the only radii are 5/8/14px plus `9999px`
for status dots; the only type sizes are 12/13/16/26px. The `#FFFFFF` tier run 1
found is still absent from the public build and still present on the owner-only
exporter screen (H2-10). One icon fails: the tab close glyph at **1.00:1**,
which is H2-8, not a colour choice.

---

### H2-1  The sticky Cut row covers the whole mark bar at every width ≥960 when the window is 600–660px tall
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-2/area-H/run-sticky.cjs` under xvfb (cold start per width, the gate passed with the product's own "Continue without signing in (360p)" button).
  2. Load the stub video. Set the window to 1280x600 — a size the app permits (`minHeight: 600`, read live from the main process).
  3. Without scrolling anything, try to click In, Out, Whole video and Add segment. `elementFromPoint` at nine points across each box says what is actually there.
- **Expected**: T10's own report sets the bar: "Trading one reachability problem for another is not a fix", which is why the row is deliberately not sticky below 960px of width. The same must hold above it.
- **Actual**: the trigger is **height, not width**. T10's table measured heights 760+ at widths ≥960 and height 600 only at 900 wide, where the row is not sticky — so the case was never looked at. Measured, with the centre column at the scroll position the app presents (`scrollTop: 0`):

  | Window | 0 seg | 2 seg | 5 seg |
  |---|---|---|---|
  | 960x600 | Add segment | Add segment | Add segment |
  | 960x620 | Add segment | Add segment | Add segment |
  | 1024x600 / 620 | In, Out, Whole, **Add** | In, Out, Whole, **Add** | In, Out, Whole, **Add** |
  | 1024x660 | Add segment | Add segment | Add segment |
  | 1100x600 / 620 / 660 | In, Out, Whole, **Add** | In, Out, Whole, **Add** | In, Out, Whole, **Add** |
  | 1100x700 | Add segment | Add segment | Add segment |
  | 1280x600 / 620 / 660 | In, Out, Whole, **Add** | In, Out, Whole, **Add** | In, Out, Whole, **Add** |
  | 1440x600 / 620 / 660 | In, Out, Whole, **Add** | In, Out, Whole, **Add** | In, Out, Whole, **Add** |
  | ≥1024 at 700+ | clear | clear | clear |

  The covering element is named by the hit test: `#ui-cut-row` and its children
  `#ui-stitched-total` / `span.text-meta`. At 1280x600 with 5 segments the row is
  at `y=471..562` and In/Out/Whole/Add all sit at `y=481..517` — entirely inside
  it. 0 of 9 hit-test points on each control reach the control. Cut itself is
  `OK` at `y=513..549`, so the fix's own goal is met; the cost is the four
  controls you need before Cut.

  It **can** be scrolled clear, but the app never starts there. Sweeping the
  centre column's scrollTop in 10px steps at 5 segments
  (`probe-scrollband.cjs`): the whole mark bar is clickable at 37 of 44 positions
  at 1280x600 (`scrollTop 40..400`), 32 at 1100x600 (`90..400`), 32 at 960x600
  (`50..360`), 37 at 1440x600 (`40..400`) — and at **none** of them is
  `scrollTop 0`, which is where every fresh load leaves it. There is no visible
  affordance that a 40–90px scroll is required (correctly, per CLAUDE.md, there
  is no scrollbar), and the controls still take focus, so Tab + typing still
  works. Resizing the window taller than ~700px also clears it.

  For completeness, what this is *not*: at several zoom levels the hit test reads
  `COVERED by #ui-footer-data`, which looks like the footer painting over the mark
  bar. It is not — measured directly (`run-modal-overlap.cjs`, section 2), the
  layout area overlaps the footer by **0px** and the footer is fully visible at
  every size and zoom tested; those readings are the mark bar scrolled out of the
  wrapped scroller, with the footer behind the sampled point.
- **Proof**: `audit/run-2/area-H/out/data/h2-1-shots.txt` and the screenshots
  beside it — these are the ones to look at, because `run-sticky.cjs` took its
  own shots *after* the scrolled-to-bottom retest and so shows the cleared
  state. `shots-h2-1.cjs` re-reads the hit test in the same frame as each
  picture, at `scrollTop 0`:
  ```
  1280x600 5seg  scrollTop=0/429  cutRow sticky 471..562
      In           y 481..517  reaches 0/9  covered by #ui-cut-row,#ui-stitched-total
      Out          y 481..517  reaches 0/9  covered by #ui-cut-row,#ui-stitched-total
      Whole video  y 481..517  reaches 0/9  covered by #ui-cut-row,#ui-stitched-total
      Add segment  y 481..517  reaches 0/9  covered by #ui-cut-row
      Cut          y 513..549  reaches 9/9
  960x600  5seg   In/Out/Whole 9/9, Add segment 486..522 reaches 0/9
  1100x620 5seg   In/Out/Whole and Add segment all 0/9
  1440x900 at 150% zoom (CSS 960x600), 5 seg: Add segment 485..521 reaches 0/9
  ```
  `out/h2-1-shots/09-1280x600-5seg-scrolltop0.png` shows it plainly: of the mark
  bar only a 10px sliver of the "In / Out" row survives above the pinned
  "Stitched total · Cut as one file" panel.
  Also: `out/data/sticky.json` + `sticky.txt` (the full coverage matrix and the
  scrolled-to-bottom retest), `out/data/breakpoint.txt` (the same coverage found
  independently in the width sweep), `probe-scrollband.cjs` output quoted above
- **Suspected file**: `src/styles.css:420-423` (`.cut-row { position: sticky; bottom: 0 }` inside `@container (min-width: 960px)` — the guard is on width only), `src/components/MarkBar.tsx:404-405`

---

### H2-2  One zoom step at the default window drops the app back into the wrapped layout; at 150% and above the mark bar and Cut leave the screen
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-2/area-H/run-regressions.cjs` under xvfb.
  2. Cold start, load the video, leave the window at its default 1100x760.
  3. Press Ctrl+Plus once (driven as the real `webContents.setZoomFactor(1.25)` from the main process, the same path the View menu uses — the menu's `zoomin`/`zoomout`/`resetzoom` roles are present and enabled in this build).
  4. Read the layout mode and the rect of every critical control.
- **Expected**: the container query was moved to 960px precisely so the default
  window clears it. The default window should survive the zoom levels a low-vision
  user needs, or at least keep the mark bar and Cut reachable with an affordance.
- **Actual**: 1100 ÷ 1.25 = 880 CSS px, which is **80px under the 960 threshold**,
  so one zoom step undoes the fix:

  | Window | Zoom | CSS viewport | Layout | What leaves the screen |
  |---|---|---|---|---|
  | 1100x760 | 100% | 1100x760 | 3 columns, sticky | nothing — all 9 critical controls OK |
  | 1100x760 | **125%** | 880x608 | **wrapped**, row back in flow | Cut (619..655), Stitched total, the whole Clips column (770..1010) |
  | 1100x760 | 150% | 733x507 | wrapped | Add segment, Cut, Stitched total, Clips column; In/Out/Whole scrolled out |
  | 1100x760 | 175% | 628x434 | wrapped | the entire mark bar, Cut, Clips column |
  | 1100x760 | 200% | 550x380 | wrapped | the entire mark bar, Cut, Clips column |
  | 1440x900 | 125% | 1152x720 | 3 columns | nothing |
  | 1440x900 | **150%** | **960x600** | 3 columns, sticky | **Add segment fully covered by `#ui-cut-row`** — run 1's story S1 (13-inch laptop at 150%) now fails through H2-1 instead |
  | 1440x900 | 175% | 823x514 | wrapped | Add segment, and In/Out/Whole scrolled out |
  | 900x600 | 125% | 720x480 | wrapped | the whole mark bar and Cut |

  No horizontal page scroll appears at any level (`docScrollWidth` equals the
  viewport every time), and everything stays reachable inside the wrapped
  scroller, so this is "the three-column product disappears under zoom", not lost
  content. Run 1 reached 150%/200% only briefly and never tried 125%, which is
  the step that matters: it is the first one a user presses.

  Compounding it, run 1's H-17 is unchanged — `html { font-size: 24px }` moves
  nothing (`root 24px`, `body 13px`, `h2 13px`, `#ui-cut 13px`, zero non-px
  computed font sizes in the document), so page zoom remains the only way to get
  bigger text, and page zoom is the thing that breaks the layout.
- **Proof**: `audit/run-2/area-H/out/data/regressions.json` → `zoom` and
  `baseFont`; `out/data/reg.log`; screenshots
  `out/zoom-1100x760/*zoom150*.png`, `*zoom200*.png`, `out/zoom-1440x900/*.png`,
  `out/basefont/01-basefont-24px.png`
- **Suspected file**: `src/styles.css:402` / `src/components/shell/ThreeColumnLayout.tsx:11` (`THREE_COLUMN_MIN_PX = 960` leaves 140px of headroom over the 1100px default — less than one zoom step), `tailwind.config.ts` (px-only type scale)

---

### H2-3  With two tabs open, every workspace id is duplicated, the visible transcript search loses its accessible name, the clips tablist points at the hidden tab, and the help spotlight stops appearing
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-2/area-H/run-dupids.cjs` under xvfb — cold start seeded with two tabs, the **second** active (what Ctrl+T leaves you in).
  2. Load the video, open the Help drawer, pick the first task so a Spotlight is genuinely requested.
  3. For each id, count the copies, ask `document.getElementById` which one it returns, and test whether that one is on screen (`getClientRects().length && offsetParent !== null`).
  4. For every on-screen form control, read `labels`, `aria-label`, `aria-labelledby`, `title`.
- **Expected**: an id is unique in a document. T10 added eleven ids for the help
  catalogue and, for `ui-transcript-search`, **replaced a `useId` with a literal
  id** so the help step could find it. A per-tab subtree cannot carry literal ids.
- **Actual**: `App.tsx:468-485` renders one full workspace subtree per tab and
  hides the inactive ones with `style={{display:"none"}}`, so every id inside a
  workspace exists once per tab. Measured, two tabs:

  ```
  duplicate ids: 28       (1 tab: 0)
  <main> in document 2, on screen 1;  <header> 5 / 2;  <footer> 2 / 1
  ```

  `getElementById` returns the **first** copy in document order, which belongs to
  the hidden tab, for all 14 ids probed — `ui-mark-in`, `ui-mark-out`,
  `ui-add-segment`, `ui-cut`, `ui-timeline`, `ui-transcript-search`,
  `ui-transcript-lines`, `ui-col-clips`, `ui-source-chip`, `ui-campaign-chip`,
  `ui-settings`, `help-anchor-youtube-status`, `help-anchor-clips-tabs` — each
  with `rect {w:0,h:0}`. Three consequences, all measured:

  - **The visible transcript search has no accessible name.** With one tab:
    `#ui-transcript-search labels=1 name=true`. With two:
    `labels=0, aria-label=null, name=false`. Its `.sr-only` `<label for>` binds to
    the hidden copy (`label[for]="ui-transcript-search" → target exists but is
    off screen`, reported twice, once per tab). Run 1's H-12 recorded this field
    as correctly labelled and the URL input as the *only* unlabelled control;
    with a second tab open there are two.
  - **The clips tablist relationship breaks.** `aria-controls="clips-panel"` on
    all three of `#clips-tab-video`, `#clips-tab-bank`, `#clips-tab-all`, and
    `aria-labelledby="clips-tab-bank"` on `#clips-panel`, all resolve to the
    hidden tab's copies. Same for `label[for]="help-search"`.
  - **The help spotlight silently stops working.** `Spotlight.tsx:18-24` measures
    `getElementById(id)` and returns `null` when the rect is 0×0. With one tab
    the drawer reported `{present: true, anchor: "ui-col-transcript",
    ringPainted: true}`; with two tabs, the same task gives
    `{present: false, anchor: null, ringPainted: false}`. Every one of the eleven
    new anchors would behave this way. The ring is area F's feature; the
    measurement is here because the cause is the id scheme.

  The landmark multiplication itself is harmless: the inactive subtrees are
  `display:none`, so they are not in the accessibility tree (confirmed — at 25
  tabs the document holds 25 `<main>`, 50 `<header>` and 100 `role="tab"`, but
  only one of each is on screen). The id collision is not about visibility, and
  it is already present at two tabs — the ordinary case.
- **Proof**: `audit/run-2/area-H/out/data/dupids.json` + `dupids.txt` (the full
  1-tab vs 2-tab comparison), `out/data/tabs-tree.json` (1/3/10/25 tabs),
  screenshots `out/dup-1/01-dup-1tabs.png`, `out/dup-2/01-dup-2tabs.png`
- **Suspected file**: `src/components/TranscriptColumn.tsx:347,353` (the `<label htmlFor>` and the literal `id` that replaced its `useId`), `src/lib/helpTasks.ts` (`ANCHORS`), `src/components/Spotlight.tsx:18-24`, `src/App.tsx:468-485` (the per-tab subtree the ids live in)

---

### H2-4  At 900x600 the mark bar and Cut can never be on screen together, so every clip costs a scroll down and back
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-2/area-H/run-sticky.cjs` (its second half) and `run-breakpoint.cjs`.
  2. Read the window's real limits from the live main process, then set 900x600.
  3. Load the video, add 0 / 2 / 5 segments, and measure before and after wheel, End and Tab.
- **Expected**: the fix brief for H-3 was that the app's own sizes should work.
  900x600 is one of them.
- **Actual**: read out of the running main process, not assumed:
  `minimumSize [900,600]`, `size [1100,760]`, `contentSize [1100,760]`, and
  asking for 400x300 hands back 900x600. At 900 the layout host is 900px, below
  the 960 container query, so the wrapped layout is still what the minimum window
  gets. Measured:

  | 900x600 | Mark bar | Cut | Stitched total | Clips column |
  |---|---|---|---|---|
  | 0 segments | in view, hit OK | 616..652 **below** | 605..633 below | 768..1008 below |
  | 2 segments | in view, hit OK | 685..721 below | 673..702 below | 837..1077 below |
  | 5 segments | in view, hit OK | 845..881 below | 834..862 below | 997..1237 below |

  Everything is reachable: the workspace scroller is `role="region"
  tabindex="0" aria-label="Workspace"` with `maxScroll` 446 / 515 / 675; the
  wheel reaches the end, **End** on that focused region reaches the end, and Tab
  brings `#ui-cut` into view after 8 / 10 / 16 presses (`inView: true`,
  `hostScrollTop` 311 / 283 / 313). So this is not unreachable content — it is
  that the two halves of the one loop the product exists for are never co-visible,
  on the size the product advertises as supported. Survivable with an obvious
  workaround, hence minor; it is the honest remainder of H-3 rather than a
  regression, and it is the reason H2-1's trade-off was made.
- **Proof**: `audit/run-2/area-H/out/data/sticky.json` → `phase: "min"`,
  `out/data/sticky.txt` (the 900x600 block, including the wheel / End / Tab
  retests), `out/data/breakpoint.json`;
  screenshots `out/sticky-900x600/*-0seg.png`, `*-5seg.png`, `*-wheeled.png`
- **Suspected file**: `src/components/shell/ThreeColumnLayout.tsx:11` (`THREE_COLUMN_MIN_PX = 960` vs `electron/main.cjs:274` `minWidth: 900`)

---

### H2-5  No `banner` and no `contentinfo` landmark exists anywhere, because the app header and footer are inside `<main>`
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-2/area-H/run-regressions.cjs` (section 1) and `run-tabs-tree.cjs`.
  2. Dump the Chrome DevTools Protocol accessibility tree (`Accessibility.getFullAXTree`) with the drawer, Symbols and Copy blocks open on the Bank tab.
  3. Count `[role=banner]` / `[role=contentinfo]` and check whether the first `<header>` / `<footer>` has a `<main>` ancestor.
- **Expected**: one `banner` and one `contentinfo` landmark, so landmark
  navigation can reach the header cluster and the footer chips directly. A
  `<header>` is only a banner when it is **not** scoped inside sectioning content
  or `<main>`.
- **Actual**: `role=banner` count **0**, `role=contentinfo` count **0**, at 1, 3,
  10 and 25 tabs. `app header inside <main>: true`, `app footer inside <main>:
  true` — `App.tsx:386` wraps the whole shell in `<main>`, and `AppHeader` /
  `AppFooter` are rendered inside it. The AX tree agrees: it carries
  `main: 1, navigation: 1, region: 10, complementary: 1, sectionheader: 3,
  sectionfooter: 1` and no banner or contentinfo at all. Run 1's H-10 dumped the
  same roles and read them as "landmarks are better than the headings suggest";
  `sectionheader`/`sectionfooter` are not landmarks, so they are not.
  Alongside it, unchanged from run 1 and never assigned: **no `h1`** in the
  product (the only one is `ErrorBoundary.tsx:29`, which shows after a crash),
  one visible heading in the workspace (`h2 "Transcript"`), and
  `role="search"` count 0 on both search fields. The good news also holds: the AX
  tree reports **0 unnamed interactive nodes** out of 120 buttons, 4 tabs, 3
  searchboxes, 3 textboxes and 1 slider.
- **Proof**: `audit/run-2/area-H/out/data/regressions.json` → `axTree.roles`,
  `axTree.unnamed: []`; `out/data/tabs-tree.json` (`banner`/`contentinfo` zero at
  every tab count); `out/data/reg.log`
- **Suspected file**: `src/App.tsx:386` (the `<main>` wrapper), `src/components/shell/AppHeader.tsx:107`, `src/components/shell/AppFooter.tsx:216`

---

### H2-6  The portalled Help button stays live and clickable on top of the sign-in gate, so the drawer opens over a modal that is otherwise sealed
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-2/area-H/probe-inert.cjs` under xvfb — cold start with no cookies file and the stub refusing the auth probe (`authFail`), so the gate genuinely stays up.
  2. Wait for `[role="dialog"]`. List every `[inert]` element and walk `main`'s ancestor chain.
  3. Hit-test `#ui-help-button` at its own pixels, then click it.
- **Expected**: while an `aria-modal="true"` gate is up, nothing outside it is
  operable. T6's sweep is written to inert the dialog's siblings.
- **Actual**: the sweep inerts the children of the dialog's parent
  (`YouTubeConnectModal.tsx:175-180`), and the dialog's parent chain is
  `body > #root > div.surface-ground > div.fixed.inset-0.z-50`. So the two
  siblings inside `div.surface-ground` get `inert` + `aria-hidden="true"`, and
  `main` is correctly covered through its ancestor
  (`div.relative.min-h-0.flex-1` carries both; `mainIsEffectivelyInert: true`,
  `mainHiddenFromAX: true`). The portalled Help button is a child of
  `document.body`, **outside that subtree**, so it is missed:

  ```
  helpButton: { parent: "body", zIndex: "70", inertAttr: false,
                effectivelyInert: false, hiddenFromAX: false, isOnTop: true }
  clicking it with the gate up ->
    { drawerBefore: false, drawerOpen: true, gateStillUp: true, expanded: "true" }
  ```

  At z-70 it is painted above the z-50 scrim, it is not inert, it is not hidden
  from the accessibility tree, and clicking it opens the help drawer while the
  gate stays up. The Tab trap still holds (40 of 40 presses stay in the dialog)
  because the keydown handler forces focus back, so this is a pointer and
  screen-reader hole rather than a keyboard one. Worth stating plainly for the
  next reader, since run 1's H-2 asserted `main[inert] is false`: that is still
  literally true, and the defect it was evidence for is gone.
- **Proof**: `audit/run-2/area-H/out/data/inert.json`,
  `out/data/modal-overlap.json` → `gate` (initial focus inside the dialog,
  `Tab x40: inside=40 outside=0`, `scrimEatsPointer: div.fixed.inset-0`,
  background drive refused: Settings `aria-expanded` stays `"false"`,
  `escapeCloses: true`); screenshots `out/inert/01-inert.png`,
  `out/gate/01-gate-open.png`, `out/gate/02-gate-background-driven.png`
- **Suspected file**: `src/components/YouTubeConnectModal.tsx:175-180` (the sweep's scope), `src/components/shell/HelpButton.tsx:73-95` (portalled to `document.body` at z-70)

---

### H2-7  The disabled Reload label still renders at 2.016:1 — run 1's single off-token contrast defect was never assigned to a fix thread
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-2/area-H/run-contrast.cjs` under xvfb.
  2. Cold start; look at the Reload control at the right-hand end of the URL bar before a link is pasted, then drive the Loading state with a slow stub.
  3. Read the computed colour, the whole ancestor opacity chain and the first opaque ancestor background; compute the WCAG ratio; cross-check against the painted pixels.
- **Expected**: `disabled: #909092`, which is what every other disabled control
  in the app uses and which measures 5.335:1 on `#1C1C1F`. CLAUDE.md states it
  outright: "Disabled text uses the `disabled` token, never `fg-dim` with an
  opacity modifier — that lands around 2:1."
- **Actual**: `UrlBar.tsx:54` still reads `text-fg-dim … disabled:opacity-40`,
  byte-identical to run 1. Rendered `#4D4D4F` on `#1C1C1F` = **2.016:1** from the
  computed styles and **1.98:1** from the pixels (full arithmetic above). The same
  element reads "Loading" during a fetch and measures the same. It is the only
  off-token disabled treatment left: the whole-document scan for
  `disabled:opacity-40` controls finds exactly one rendered instance (the second
  in the source, `TimeRangeControls.tsx:45`, is only mounted once a video is
  loaded, by which time it is enabled). Severity follows slice 5's reasoning, which
  I agree with: the Incidental exception means WCAG 1.4.3 does not bind on an
  inactive control (`disabled` is `true` in the DOM whenever this text is at
  2.016:1), and the Loading state carries three other signals — a spinner in
  `rgb(255,99,99)`, the words "Loading the video", and the status region. So:
  a token violation and a readability problem, not an AA failure. One class to
  change.
- **Proof**: `audit/run-2/area-H/out/data/contrast.json` → `h1` (both states, the
  peer ratios and the disabled-control inventory), `out/data/contrast.txt`;
  screenshots `out/h1/01-urlbar-disabled.png`, `out/h1/02-urlbar-loading.png`
- **Suspected file**: `src/components/UrlBar.tsx:54`

---

### H2-8  The tab close button still takes keyboard focus while painted at `opacity: 0` — also never assigned
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-2/area-H/run-focus-portal.cjs` under xvfb.
  2. From a cold start press Tab twice; the second stop is `button[aria-label="Close New tab"]`.
  3. Screenshot the button's own box (12px padding) unfocused and focused, and compare the two buffers byte for byte. `#ui-settings` is the positive control.
- **Expected**: WCAG 2.4.7. The global rule
  `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }` is
  correct and works everywhere else.
- **Actual**: unchanged from run 1 and from slice 5. First four Tab stops:
  `tab "New tab" | button "Close New tab" | button "New tab" | Campaign`. On the
  close button: `isActive: true`, `matchesFocusVisible: true`, `tabIndex: 0`,
  `outline: "rgb(255, 99, 99) solid 2px offset 2px"` — and
  `ownOpacity: "0"`, `effectiveOpacity: 0`, with
  `beforeSha === afterSha === fcbb9650c7e73f77` and `paintChanged: false`, while
  `#ui-settings` gives `paintChanged: true` in the same run. The icon itself
  measures **1.00:1** (`#1C1C1F` on `#1C1C1F`) in every one of the 17 contrast
  states. The class is still `opacity-0 … group-hover:opacity-100` with no
  `focus-visible:opacity-100`. A keyboard user's second stop in the whole
  application is an invisible control that destroys a tab.
- **Proof**: `audit/run-2/area-H/out/data/focus-portal.json` → `h5`,
  `out/data/fp.log`; `out/data/contrast.json` → every state's `icons` entry for
  "Close …" (ratio 1); screenshot `out/h5/01-h5-tab-close.png`
- **Suspected file**: `src/components/WorkspaceTabs.tsx:85`

---

### H2-9  Help's position in the Tab order no longer matches where it is drawn: eight stops after the control beside it
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-2/area-H/run-focus-portal.cjs`.
  2. On each screen, Tab from the top and record every stop.
  3. Compare Help's index with its painted position.
- **Expected**: WCAG 2.4.3 — focus order follows meaning and operability. The
  spec puts Help "always the last item, top right, on every screen"; it is drawn
  immediately right of Settings, so it should be focused immediately after
  Settings.
- **Actual**: the portal appends the live button to `document.body`, after
  `#root`, so it is focused after the entire application. Measured on the empty
  workspace (19 stops):

  ```
  1 New tab > 2 Close New tab > 3 New tab > 4 ui-campaign-chip > 5 input >
  6 ui-copy-blocks > 7 ui-symbols > 8 help-anchor-youtube-status > 9 Check >
  10 ui-settings > 11 Workspace > 12 Follow > 13 editor handoff >
  14 clips-tab-bank > 15 ui-footer-format > 16 ui-footer-clips >
  17 ui-footer-data > 18 ui-help-button > 19 (wraps)
  ```

  Settings is stop 10 and Help, drawn 6px to its right, is stop 18 — the whole
  workspace region, the transcript controls, the clips tabs and all three footer
  chips come between them. With a video loaded Help is stop 21 of 26, again after
  the footer. T8 flagged "it is now last"; measured, it is last-but-one before the
  wrap, which is the same problem stated more precisely. Everything else about the
  portal is right: on 7 screens × 4 window sizes the button's box is identical to
  its placeholder's (`delta {dx:0, dy:0}`, `slotMatchesButton: true`),
  `position: fixed`, `zIndex: 70`, exactly one `#ui-help-button` in the document,
  and the placeholder is `visibility: hidden`, `pointer-events: none`,
  `aria-hidden="true"` and the same 32×32 box — no gap, no double control.
- **Proof**: `audit/run-2/area-H/out/data/focus-portal.json` → `portal` and
  `tabOrders`, `out/data/fp.log`; screenshots `out/portal-*/`
- **Suspected file**: `src/components/shell/HelpButton.tsx:73-95` (no `tabIndex` management to restore the header position)

---

### H2-10  The channel exporter's scope control is white on accent (2.91:1) and conveys its selection by colour alone
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Build the **owner** shape into a scratchpad copy of the tree, so the audited tree is neither built nor changed: `cp` the tree out, then `VITE_ENABLE_CHANNEL_DATA=1 VITE_OWNER_MACHINES='*' VITE_OWNER_SALT=… npm run build && node scripts/build-server.cjs` inside the copy.
  2. `node audit/run-2/area-H/run-channel.cjs` under xvfb (it launches that copy).
  3. Click Channel data; read the selected chip's computed colour, painted background and ARIA state.
- **Expected**: `accent.on = #0B0B0C` for text on an accent fill, which the
  primary buttons use; and a selected state exposed programmatically
  (`aria-pressed`, `role="radio"`, or `aria-current`).
- **Actual**: `#ui-channel-link` is present in the owner build and the screen is
  reachable. The selected "All" chip paints **`#FFFFFF` on `#FF6363` = 2.91:1**
  at 12px — fails AA for normal text and fails the 3:1 bar even if it were large.
  It is still the single off-token text colour in the product (`#FFFFFF x1`
  against `#969697 x26`, `#F5F5F7 x11`, `#909092 x1`), exactly as run 1 found;
  the finding was never assigned to a fix thread. On top of run 1's reading,
  `aria-pressed` is **`null`** on the selected chip and there is no
  `role="radiogroup"`, `aria-current` or `aria-selected` anywhere in the control
  (`ChannelExportPanel.tsx:158-172` sets only `bg-accent text-white`), so which
  scope is selected is conveyed by colour alone — a screen-reader user is told
  nothing, and so is a user who cannot distinguish the fill. The rest of the
  screen is clean: 44 text nodes, one failure, radii 5/8/9999, sizes 12/13,
  11 ids with no duplicates, and its scroller shows no bar and is Tab-reachable
  (`Tab ×11`, PageDown 6/6).
- **Proof**: `audit/run-2/area-H/out/data/channel.json` + `channel.txt`;
  screenshots `out/channel/01-channel-screen.png`, `02-channel-1000x600.png`
- **Suspected file**: `src/components/ChannelExportPanel.tsx:158-172`

---

### H2-11  Bank rows and campaign rows truncate up to 414px of text with no `title`
- **Severity**: polish
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-2/area-H/run-extras.cjs` under xvfb, seeded with one campaign whose name is 76 characters and 60 bank rows with long labels.
  2. Open the Bank tab at 1280x700, then the campaign menu.
  3. For every clipped text box, record the hidden width, whether it has its own `title`, whether an ancestor carries one, and whether it has an `aria-label`.
- **Expected**: run 1 recorded, as a pass, that "the long-string pass found 4
  truncations and all 4 carry a `title`". The same should hold at scale.
- **Actual**: 61 clipped boxes on the Bank tab and 62 with the campaign menu
  open. The two that matter:
  - every bank row's label, `span.truncate.text-body.text-fg`, hides
    **267–275px** with `text-overflow: ellipsis`, **no own `title`** and no
    ancestor `title`. It does carry an `aria-label`, so a screen-reader user gets
    the whole string and a sighted user cannot — the same shape as run 1's H-14.
  - a campaign row in the picker, `span.min-w-0.flex-1.truncate`
    (`CampaignMenu.tsx:261`), hides **414px**, again with no `title`. Only the
    sibling Edit button's `aria-label="Edit {name}"` carries the full name. That
    matters more than it looks: C-5 lets two campaigns hold the same name, and
    the picker row is where you would tell them apart.
  The header's own campaign chip (`span.max-w-[160px].truncate`, 298px hidden)
  does get an ancestor `title`, as run 1 said, so the pattern exists in the
  codebase and is simply not applied in these two places.
- **Proof**: `audit/run-2/area-H/out/data/extras.json` → `truncations.bank`,
  `truncations.campaignMenu`; `out/data/extras.txt`; screenshots
  `out/extras-shell/05-clips-bank-60.png`, `06-campaign-menu-truncation.png`
- **Suspected file**: `src/components/ClipsColumn.tsx` (the bank row label), `src/components/CampaignMenu.tsx:261`

---

### H2-12  `styles.css` carries the scrollbar rule twice and the container-query block twice, and only one of the two copies has the `.cut-row` rule in it
- **Severity**: polish
- **Status**: confirmed
- **Steps**:
  1. `grep -n "scrollbar-width: none\|::-webkit-scrollbar\|container-type: inline-size\|@container (min-width: 960px)" src/styles.css`
  2. Read lines 85-104, 135-137, 371-388 and 399-424.
- **Expected**: one copy of each rule. The duplication is harmless to the
  rendered page, which is why no test caught it, but it is a trap for the next
  change.
- **Actual**: three duplications, all merge artifacts of T3 and T10 landing in
  the same file:
  - `*::-webkit-scrollbar { width:0; height:0 }` plus `* { scrollbar-width: none; -ms-overflow-style: none }` appear **twice** in the base layer, at 85-94 and 95-104, with two near-identical comments.
  - `.cols-host { container-type: inline-size }` appears **twice**: inside `@layer components` at 135-137 and unlayered at 399-401.
  - `@container (min-width: 960px) { … }` appears **twice** unlayered, at 371-388 and 402-424, with the same `.cols-row` / `.cols-side` / `.cols-clips` / `.cols-centre` bodies.
  The hazard is the asymmetry: `.cut-row` exists in exactly one place in the file
  (line 420), inside the **second** copy. Anyone who finds the first
  `@container (min-width: 960px)` block and edits it — the obvious thing to do
  when fixing H2-1 — will change nothing about the sticky row.
- **Proof**: `audit/run-2/area-H/out/data/styles-duplication.txt` — the grep
  output plus both copies of each block, side by side
- **Suspected file**: `src/styles.css`

---

### H2-13  `aria-controls` points at an id that does not exist while the thing it names is closed
- **Severity**: polish
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-2/area-H/run-regressions.cjs` (section 1).
  2. In each state, for every `aria-controls` / `aria-labelledby` / `aria-describedby` / `label[for]`, check that `document.getElementById(ref)` exists.
- **Expected**: an ARIA relation names an element that is in the document, or the
  attribute is dropped while the target is absent.
- **Actual**: two dangling references, each present whenever its target is
  collapsed:
  - `aria-controls="ui-help-drawer"` on `#ui-help-button` — the drawer is only mounted while open, so on the empty workspace, with a video loaded and with segments added the reference resolves to nothing (measured in 3 of 7 states).
  - `aria-controls="help-setup-panel"` on `#help-setup-toggle` — the same, while the setup checklist is collapsed.
  Both are the low-impact kind: `aria-expanded` is set correctly on both
  triggers, so the state is still announced, and the reference starts resolving
  the moment the target opens. Worth tidying because it is the one id-integrity
  problem that exists even with a single tab open; the serious one is H2-3.
- **Proof**: `audit/run-2/area-H/out/data/regressions.json` → `ids[*].danglingRefs`,
  `out/data/reg.log`; `out/data/dupids.json` → `ariaRefs`
- **Suspected file**: `src/components/shell/HelpButton.tsx:81`, `src/components/HelpDrawer.tsx:101-108`

---

## Re-confirmed from run 1, never assigned to a fix thread

These were measured again and are unchanged. They carry no new run-2 id because
they are run 1's findings, still open, with run 1's own numbers; I state them so
the planner does not have to re-derive the state of the area.

| Run 1 | Still present? | What I measured this run |
|---|---|---|
| H-1 | yes | 2.016:1 — filed as H2-7 with fresh arithmetic |
| H-5 | yes | identical paint SHAs — filed as H2-8 |
| H-7 (no `prefers-reduced-motion`) | yes | **0** `prefers-reduced-motion` rules in any stylesheet; **5** `repeat: Infinity` loops in source (`OverlayLoader.tsx:61`, `DownloadBar.tsx:121`, `YouTubeConnectModal.tsx:65` and `:242`, `ChannelExportPanel.tsx:78`); no `useReducedMotion` anywhere |
| H-10 (no `h1`, one heading) | yes | `h1` count 0 in every state (the only `<h1>` is `ErrorBoundary.tsx:29`); one visible heading in the workspace; `role="search"` count 0. Extended into H2-5 |
| H-11 (white on accent) | yes | 2.91:1 in the owner build — filed as H2-10 with the missing `aria-pressed` added |
| H-12 (URL input unlabelled) | yes | `input[type=url]`: `labels=0, aria-label=null, hasAccessibleName=false`, placeholder only. With two tabs it is joined by the transcript search (H2-3) |
| H-14 (bank search placeholder clipped) | yes, generalised | the truncation pattern measured at scale in H2-11 |
| H-17 (type ignores the base font size) | yes | `html{font-size:24px}` → `body 13px`, `h2 13px`, `#ui-cut 13px`; **0** elements with a non-px computed font size. Compounds H2-2 |
| H-6 | **fixed** | see the table above |
| H-2 | **fixed** | see H2-6 |
| H-3 / H-4 / B-10 | **fixed at the default window** | see H2-4 and H2-2 for the two sizes outside the fix |
| H-8, H-9, H-13, H-15, H-16, H-18 | not re-driven this run | out of scope for the fixes under test; no reason to believe they moved |

## Coverage

**States measured**: workspace empty · video loading (slow stub) · video error
(real yt-dlp strings) · video loaded · 2 segments · 5 segments · settings
popover · campaign popover (empty and 12/20 campaigns) · footer format popover ·
footer data popover · session chip menu · Copy blocks · Symbols palette · help
drawer (idle and searching) · setup checklist expanded · clips tab "This video" ·
"Bank" (empty, 30 rows, 60 rows) · "All saved" · Import timestamps · the sign-in
gate (fresh install, auth probe refused) with both disclosures expanded · after
a failed cut with the diagnostics disclosures open · 1 / 2 / 3 / 10 / 25 open
tabs · the channel exporter screen in a purpose-built owner build.

**Sizes**: a width sweep at 940 / 950 / 955 / 959 / 960 / 961 / 965 / 980 /
1000 / 1024 / 1060 / 1100 / 1160 / 1200 at **both** 760 and 600 height, plus
900x600, 960x600, 1024x768, 1100x760, 1280x800, 1440x900, 1920x1080; and a
height sweep at 600 / 620 / 660 / 700 / 760 / 820 for each of widths 960 / 1024 /
1100 / 1280 / 1440, each at 0, 2 and 5 segments.

**Zoom**: real `webContents.setZoomFactor` at 100 / 125 / 150 / 175 / 200% on
1100x760, 900x600 and 1440x900, at 0 and 2 segments, plus an
`html { font-size: 24px }` probe.

**Keyboard**: full Tab traversals from a cold start and with a video loaded on 7
screens; focus-paint byte diffs; 40-press trap test on the gate; and, for every
one of the 36 scrollers, a real Tab-from-the-top traversal followed by
PageDown / End / ArrowDown / ArrowRight.

**Measurement volume**: 987 visible text nodes over 17 states → 97 distinct
colour × background × size × weight combinations; 36 scrollers and 23 clipped
boxes over 29 surface/state combinations; nine-point `elementFromPoint` hit tests
on 13 critical controls at 97 size/segment combinations; the CDP accessibility
tree; the full token inventory per state.

**Scripts** (all under `audit/run-2/area-H/`): `lib/h2.cjs`, `lib/drive.cjs`,
`lib/launch.cjs`, `lib/stub.cjs`, `lib/probe.js`, `smoke.cjs`,
`run-breakpoint.cjs`, `run-sticky.cjs`, `run-scrollbars.cjs`,
`run-scrollbars2.cjs`, `run-pre.cjs`, `run-contrast.cjs`, `run-focus-portal.cjs`,
`run-regressions.cjs`, `run-modal-overlap.cjs`, `run-dupids.cjs`,
`run-tabs-tree.cjs`, `run-extras.cjs`, `run-channel.cjs`, `probe-inert.cjs`,
`probe-scrollband.cjs`, `probe-import-pre.cjs`, `diag-signin.cjs`,
`diag-load.cjs`.

### How the gate was passed, and two harness traps worth recording

Run 1's trick for reaching the signed-in app offline — a synthetic
`yt-cookies.txt` plus a stub that answers yt-dlp's `--simulate` probe — no longer
reaches `signed_in` on this tree: the chip reads "Sign-in expired" and the gate
opens about 3.5s after boot (`diag-signin.cjs`). Every measurement here therefore
gets past it the way a user now can, through the product's own **"Continue
without signing in (360p)"** button, exactly as `audit/run-2/BRIEF.md` directs.
Nothing was hidden, removed or suppressed in the DOM. For the gate's own
measurements the route is reversed: no cookies file at all and the stub's
`authFail` switch on, so the dialog is deterministic instead of racing a probe
that would otherwise answer "signed in".

Two traps cost this run time and are worth passing on:

- **Do not put the stub root inside the repository.** `make-stub-root.cjs` writes
  a CommonJS `yt-dlp`, and the repo's `package.json` has `"type": "module"`, so a
  stub under `audit/…` dies with `require is not defined in ES module scope`. The
  server then silently prefers the **real** `/usr/local/bin/yt-dlp`, which tries
  to reach YouTube, and every "the video did not load" looks like a product bug.
  Keep the stub root in the scratchpad.
- **Do not `waitForSelector("header")` with several tabs seeded.** Every
  workspace mounts in full, so the document holds 2 headers per tab and the first
  one belongs to a `display:none` tab; the wait times out on a perfectly healthy
  app. Wait for `#root` and then for `[role="tab"]`.

## Not provable here

- **Transcript-loaded states.** The stub returns no subtitles, so the transcript
  list, its search field and its prev/next buttons were measured only in their
  disabled state. Their contrast, focus rings and tab-order position with real
  cues are **not provable here**. (The transcript search's *name* is provable and
  is H2-3.)
- **Screen-reader output itself.** Roles, names, relations, live regions and the
  AX tree are measured; what VoiceOver/NVDA/Orca speaks is **not provable here**.
- **Two of the five `<pre>` overflow blocks** — `DiagnosticsDisclosure.tsx:167`
  (needs a captured log file) and `ErrorBoundary.tsx:34` (needs a real render
  throw).
- **Platform scrollbar rendering.** Linux Chromium would paint classic 15px bars
  without the rule; macOS overlay bars behave differently. The *rule* is proven
  applied and the content proven reachable; the macOS appearance is **not
  provable here**.
- **Real OS text-size settings** (macOS/Windows accessibility text scaling) and
  **forced-colors / high-contrast mode** — **not provable here**; only the
  `html { font-size }` and `setZoomFactor` routes were exercised.
- **Packaged-window chrome.** 900x600 and 1100x760 are read out of the live main
  process and the clamp was tested, but on a platform with window decorations the
  *content* height at the minimum is smaller than 600, so the real-world H2-1 and
  H2-4 cases are slightly worse than measured, never better. What the shipped
  installer opens at per OS is **not provable here**.
- **Signed-in 1080p UI differences** — **not provable here**; every run here is
  the signed-out (360p) path.
- **macOS editor-handoff dialogs** — **not provable here**; Linux container.
- **The owner exporter screen beyond its first frame.** The owner build was made
  in a scratchpad copy and the screen measured, but the export run itself was not
  driven.

## Noted in passing — not area H's to fix

- **Every workspace mounts in full.** At 25 tabs the document holds 25 `<main>`,
  50 `<header>`, 100 `role="tab"` and 3,817 elements against 169 at one tab
  (`out/data/tabs-tree.json`). The hidden copies are `display:none` so the
  accessibility tree is spared, but this is the mechanism behind H2-3 and behind
  B-9. Area B.
- **The campaign row name is the only place two same-named campaigns can be told
  apart** (C-5) and it is the one that truncates without a `title` (H2-11).
- **A cut with the stub in this container ends in an `ffmpeg exited with code 1`
  alert** when the stub is told to fail, and `Choose a clips folder in the footer`
  otherwise; no clips folder is configured by default. Areas B/G.
- **`aria-pressed` missing on a segmented control** also appears outside the
  exporter: the footer format chips were not re-checked this run.
