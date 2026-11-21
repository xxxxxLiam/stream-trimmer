# Area H — accessibility, layout and visual consistency

Scope: every screen, overlay and state that can be reached in this container,
measured only. No feature behaviour was tested and no product code was changed.
Everything under `audit/run-1/area-H/` is this area's own scaffolding.

**How the numbers were produced.** Contrast is not eyeballed and not inferred
from the stylesheet. For every text node the probe takes the computed colour
with every ancestor `opacity` composited in, then reads the *background from
the real rendered pixels*: a Playwright screenshot of the viewport is handed
back into the page, drawn on a canvas, and the histogram of the text's own line
box (via `Range.getClientRects()`, excluding pixels near the glyph colour) gives
the background actually painted — gradients, tints, scrims and shadows
included. A second, pure-CSS composite is computed as a cross-check, and a
failure is only reported when **both** readings fail, which keeps glyph-dense
boxes (the Arabic symbol chips) from producing phantom failures. Focus rings are
read the same way, scanline by scanline, from the control's own border row
outward. Probe: `audit/run-1/area-H/lib/probe.js`.

**Totals: 0 blocker, 6 major, 7 minor, 5 polish.** 18 findings, all `confirmed`.

Good news first, because it bounds the rest: **token discipline is close to
perfect.** Across all 28 measured states the running app uses only the approved
border radii (14/8/5 px, plus `9999px` for status dots), only the approved type
sizes (20/16/13/12/26 px — no 11px, no strays), and only the approved text
tiers (`#F5F5F7`, `#969697`, `#909092`, `#FF6363`). Exactly **one** off-token
colour exists in the whole product (H-11). The previously reported
`rgba(255,255,255,0.35)` tier is gone.

1,795 visible text nodes were measured across 28 states, collapsing to 123
distinct colour × background × size × weight combinations. Five of the 123 come
back under threshold on the pixel reading; three are real (two of them the same
defect, H-1, and one H-11) and two are sampler artifacts that the CSS
cross-check clears, listed under "Measurements deliberately not reported" below.
So: **two genuine contrast defects in the whole product.**

---

### H-1  Disabled text is drawn with `opacity-40`, not the disabled token, and lands at 2.01:1
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Cold start the app signed in (`node audit/run-1/area-H/run-sweep.cjs` under xvfb).
  2. Look at the Reload button at the right-hand end of the URL bar, before any link is pasted.
  3. Read the computed colour and the painted background behind it.
- **Expected**: text inside a disabled control uses `disabled #909092`, which the
  design system states is 5.67:1 on panel. Every other disabled control in the
  app does exactly this and measures 5.04–5.67:1.
- **Actual**: `UrlBar.tsx` styles this one with `text-fg-dim` plus
  `disabled:opacity-40`. 0.4 × `#969697` over `#1C1C1F` renders as **`#4D4D4F`,
  measured 2.01:1 against `#1C1C1F`** (CSS cross-check 2.01:1) at 12px — less
  than half the 4.5:1 required, and worse than the 3.25:1 tier that was already
  removed for failing. Behind the sign-in modal's scrim it is `#49494B` on
  `#161618` = **2.02:1**. The same element reads "Loading" during a fetch, so the
  one word that tells you the app is working is the least readable text in it.
  Counted 18 occurrences across 15 of the 28 measured states — it is present on
  every screen, in every state, from the first frame.
  For comparison, the correctly-tokenised disabled controls beside it:
  `#909092` on `#202023` = 5.10:1 (Whole video), on `#1C1C1F` = 5.34:1 (Cut as
  one file), on `#1B1B1E` = 5.39:1 (the ⌘↵ key hint).
- **Proof**: `audit/run-1/area-H/out/data/sweep.json` (search `"#4D4D4F"`),
  `audit/run-1/area-H/out/data/states.json`,
  screenshot `audit/run-1/area-H/out/sweep/01-workspace-empty.png`
- **Suspected file**: `src/components/UrlBar.tsx:54` (`disabled:opacity-40`)

---

### H-2  The sign-in modal does not trap focus, does not take focus, leaves the app behind it live, and ignores Escape
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-H/run-keyboard2.cjs` — launches with no cookies file and a stub that refuses auth, so the modal genuinely stays up.
  2. Wait for the modal. Press Tab 40 times. Record where focus lands each time.
  3. Press Escape.
- **Expected**: `role="dialog" aria-modal="true"` promises a modal. Focus moves
  into it on open, Tab cycles only inside it, the rest of the app is `inert` or
  `aria-hidden`, and Escape dismisses it (or, for a deliberate gate, the dialog
  at least holds focus).
- **Actual**: measured on the real DOM —
  - initial focus is `<body>`; nothing inside the dialog is focused and nothing is announced;
  - **35 of 40 Tab stops land outside the modal**, on the workspace behind a 90%-opaque scrim: the tab strip, the close-tab button, Campaign, the URL input, Copy blocks, Symbols, Channel data, the session chip, Check, Settings, Help, Follow, the footer chips;
  - the background is neither inert nor hidden: `main[aria-hidden]` is `null`, `main[inert]` is `false`, so a screen reader reads the whole workspace straight through the dialog;
  - **Escape does not close it** (`closedByEscape: false`).
  A keyboard-only or screen-reader user on a fresh install is therefore driving
  a UI they cannot see, and can reach controls the modal exists to block.
- **Proof**: `audit/run-1/area-H/out/data/keyboard2.json` → `modal.tabSequence`,
  `modal.escapedCount: 35`, `modal.backgroundInert`;
  `audit/run-1/area-H/out/data/stories.json` → S2;
  screenshots `audit/run-1/area-H/out/modal/01-signin-modal.png`,
  `audit/run-1/area-H/out/stories-modal/01-S2-modal-keyboard.png`
- **Suspected file**: `src/components/YouTubeConnectModal.tsx:202-213` (the dialog wrapper; no focus trap, no initial focus, no Escape handler), `src/App.tsx:471`

---

### H-3  The mark bar and Cut fall below the fold again — at 1024x768 with Help open, at 900x700, and at 150% zoom on a 1440x900 laptop
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-H/run-layout.cjs` and `node audit/run-1/area-H/run-zoom.cjs` under xvfb.
  2. Load a video, then set the window to each size; for zoom use the real
     `webContents.setZoomFactor` (what Ctrl+Plus does), not a CSS `zoom` hack.
  3. Read the bounding rect of `#ui-mark-in`, `#ui-mark-out`, `#ui-mark-whole`,
     `#ui-add-segment`, `#ui-cut` against the viewport height.
- **Expected**: the previously reported regression was supposed to be fixed. The
  mark bar is the whole job; it should be visible at every supported size.
- **Actual**: it is not fixed. Measured positions (viewport height in brackets):

  | Case | Mark in/out, Whole, Add segment | Cut as one file | Clip length |
  |---|---|---|---|
  | 1024x768, Help drawer open | y=872 **(768)** — fully below | y=997 — below | y=986 — below |
  | 900x700, no drawer | visible | y=677, h=36 → bottom 713 **(700)** — half cut | visible |
  | 1440x900 @150% zoom (CSS 960x600) | y=579, h=36 → bottom 615 **(600)** — half cut | y=704 — below | y=692 — below |
  | 1280x800 @150% zoom (CSS 853x533) | y=864 **(533)** — below | y=989 — below | y=977 — below |
  | 1280x800 @200% zoom (CSS 640x400) | y=904 **(400)** — below | y=1029 — below | y=1018 — below |

  They remain reachable — 533–659px of scrolling inside the column scroller —
  but nothing on screen indicates they are there, and the scroll container is an
  unnamed `div`. 1280x800 and above with the drawer closed are clean.
- **Proof**: `audit/run-1/area-H/out/data/layout.json`,
  `audit/run-1/area-H/out/data/zoom.json`,
  screenshots `audit/run-1/area-H/out/layout/11-help-1024x768.png`,
  `audit/run-1/area-H/out/layout/01-empty-900x700.png`,
  `audit/run-1/area-H/out/zoom/05-zoom150-1440x900.png`,
  `audit/run-1/area-H/out/stories/01-S1-13in-150pct.png`
- **Suspected file**: `src/components/shell/ThreeColumnLayout.tsx:30-54` (the `min-[1160px]` breakpoint; below it the columns wrap and the centre column stops being its own scroller), `src/components/PreviewPanel.tsx` (fixed `aspect-video` plate consumes the height)

---

### H-4  At 1024px wide and below, the whole Clips (COLLECT) column is below the fold with nothing to say it exists
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-H/run-layout.cjs`.
  2. Set the window to 1024x768 (and 900x700). Do not scroll.
  3. Read the rect of `#ui-col-clips`.
- **Expected**: the product is described as three columns, transcript | preview |
  clips. On a 1024x768 machine the user should at least know the third one is there.
- **Actual**: at 1024x768 `#ui-col-clips` sits at **y=905 in a 768px viewport**
  (`belowFold: true`), 374–415px of scrolling away inside
  `div.min-h-0.min-w-0.flex-1`, which has no accessible name. At 900x700,
  y=829 in a 700px viewport. The breakpoint that keeps the three columns side by
  side is `min-[1160px]`; between 1160px and the stacking point there is no
  intermediate layout, so 1024x768 — a very common lectern/old-laptop size —
  gets a single tall stack with no affordance, no overview, and no hint that
  the bank and saved clips live further down.
- **Proof**: `audit/run-1/area-H/out/data/layout.json` (`empty-1024x768`,
  `empty-900x700` → `critical[Clips column]`),
  `audit/run-1/area-H/out/data/stories.json` → S6,
  screenshots `audit/run-1/area-H/out/layout/02-empty-1024x768.png`,
  `audit/run-1/area-H/out/stories/07-S6-1024-bank.png`
- **Suspected file**: `src/components/shell/ThreeColumnLayout.tsx:32,50`

---

### H-5  The tab close button takes keyboard focus while painted at `opacity: 0`, so the focus ring is never visible
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-H/run-keyboard.cjs`.
  2. From a cold start, press Tab twice — the second stop is `button[aria-label="Close New tab"]`.
  3. Screenshot the button's box before and after focusing, and diff the two PNGs.
- **Expected**: WCAG 2.4.7 — a control that can receive focus must show it. The
  app's global rule (`:focus-visible { outline: 2px solid var(--accent) }`) is
  correct and works everywhere else.
- **Actual**: measured — the element **is** in the tab order (stop #1 from a cold
  start, stop #22 with a video loaded), `document.activeElement` is it,
  `:focus-visible` matches, and `outline` computes to `solid 2px rgb(255,99,99)`
  — but its effective opacity is **0**, because visibility is driven only by
  `group-hover:opacity-100`. A byte-for-byte diff of the before/after
  screenshots of its own box shows **no paint change at all**
  (`paintChanged: false`), while every other control tested shows one. The icon
  itself measures 1.00:1 against its background (icon `#1C1C1F` on `#1C1C1F`).
  A keyboard user lands on an invisible control that destroys a tab; a mouse
  user cannot see it until the pointer is already inside the tab.
- **Proof**: `audit/run-1/area-H/out/data/keyboard.json` → `focusPaint` entry for
  `div[role="tab"] button[aria-label^="Close"]`;
  `audit/run-1/area-H/out/data/sweep.json` → `icons` (ratio 1);
  `audit/run-1/area-H/out/data/stories.json` → S5;
  screenshot `audit/run-1/area-H/out/stories/06-S5-tab-close-focus.png`
- **Suspected file**: `src/components/WorkspaceTabs.tsx:82` (`opacity-0 … group-hover:opacity-100`, no `focus-visible:opacity-100`)

---

### H-6  Six places paint a 15px native scrollbar; the design calls for hidden scrollbars and the app has no scrollbar CSS at all
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-H/run-rings.cjs` (scrollbar inventory at all five sizes) and `node audit/run-1/area-H/run-sweep.cjs`.
  2. For every scrollable element, measure `offsetWidth − clientWidth − borders`; a non-zero result is a scrollbar occupying layout space.
  3. `grep -rn "scrollbar" src/` — zero hits.
- **Expected**: scrollbars hidden (`::-webkit-scrollbar { display:none }` /
  `scrollbar-width: none`) while the content stays scrollable by wheel and keyboard.
- **Actual**: every scroller reports `scrollbar-width: auto` and a **15px**
  gutter. Measured instances:

  | Gutter | Hidden content | Element | Seen in |
  |---|---|---|---|
  | 15px | 395–415px | `main > … > div.min-h-0.min-w-0.flex-1` (the whole workspace column stack) | 900x700, 1024x768 |
  | 15px | 597px | `#help-setup-panel` | setup checklist |
  | 15px | 371px | `aside#ui-help-drawer > div.min-h-0.flex-1.overflow-y-auto` | help drawer |
  | 15px | 24px | symbol palette body (`div.surface-panel.fixed.right-4 > div.flex.min-h-0.flex-col`) | symbol palette |
  | 15px | 122px | the sign-in modal card (`div.max-h-[90vh].w-full.max-w-md`) | all three sign-in states |
  | 15px | 8px | `details > pre.max-h-32.overflow-auto` inside the sign-in modal | sign-in modal |

  Scrollability itself is fine and must stay that way: measured on
  `#help-setup-panel`, wheel/programmatic scroll moved it, and PageDown with a
  button inside focused moved `scrollTop` to 567px. So this is purely the
  missing hide, not a reachability problem. (On Linux Chromium these are classic
  15px bars; on macOS overlay scrollbars they may be invisible at rest, which is
  exactly why the hide has to be explicit rather than left to the platform.)
  Horizontal scrollbars: none — `document.scrollWidth > innerWidth` was false at
  every size and every zoom level tested.
- **Proof**: `audit/run-1/area-H/out/data/rings.json` → `scrollbars`,
  `audit/run-1/area-H/out/data/sweep.json` → `scrollers`,
  `audit/run-1/area-H/out/data/stories.json` → S10;
  screenshots `audit/run-1/area-H/out/sweep/05-symbol-palette.png`,
  `audit/run-1/area-H/out/sweep/07-setup-checklist.png`,
  `audit/run-1/area-H/out/layout/11-help-1024x768.png`,
  `audit/run-1/area-H/out/modal/01-signin-modal.png`
- **Suspected file**: `src/styles.css` (no `::-webkit-scrollbar` or `scrollbar-width` rule anywhere in the file)

---

### H-7  No `prefers-reduced-motion` support anywhere: 22 elements keep animating, including an infinite loop
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-H/run-stories.cjs`.
  2. Emulate `prefers-reduced-motion: reduce` on the page.
  3. Walk every visible element's computed `transition-duration` / `animation-name`, and count `prefers-reduced-motion` rules in every loaded stylesheet.
- **Expected**: when the OS asks for reduced motion, non-essential animation stops or shortens.
- **Actual**: `matchMedia("(prefers-reduced-motion: reduce)").matches` is `true`,
  and nothing changes. Measured with the query active: **22 elements still
  animate**, **0 `prefers-reduced-motion` rules** exist in any stylesheet. The
  running set is 23 × `color, background-color, border-color, text-decoration-color,
  fill, stroke 0.15s` plus an `opacity 0.15s`; on top of that the source carries
  5 × `animate-spin`, 3 × `animate-pulse`, 16 × `motion.div` and 2 × `motion.li`,
  and no `useReducedMotion` call anywhere. The worst case is the launch-time
  sign-in bar, which animates `x: ["-100%","300%"]` with
  `repeat: Infinity` — a continuously sweeping element on the very first screen
  of a fresh install.
- **Proof**: `audit/run-1/area-H/out/data/stories.json` → S8 and
  `extra.reducedMotion` (`matches:true, animatedCount:22, reducedMotionRules:0`);
  `audit/run-1/area-H/out/data/sweep.json` → `motion`;
  screenshot `audit/run-1/area-H/out/stories/04-S8-reduced-motion.png`
- **Suspected file**: `src/styles.css` (no media block), `src/components/YouTubeConnectModal.tsx:173-177` (`repeat: Infinity`), `src/App.tsx:92-97`

---

### H-8  Four popovers claim `role="dialog"` but never move or trap focus and set no `aria-modal`
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-H/run-keyboard2.cjs`.
  2. Focus `#ui-settings` from the keyboard, press Enter, then inspect `document.activeElement` and the dialog's attributes.
  3. Repeat for the footer format chip, the campaign chip, and the data-folder confirm chip.
- **Expected**: either move focus into the dialog and trap it (and set `aria-modal`), or drop `role="dialog"`/`aria-haspopup="dialog"` and expose it as a plain disclosure.
- **Actual**: measured — for Settings, `aria-modal` is `null`, focus stays on the
  trigger (`focusInside: false`), and nothing is announced beyond the trigger's
  `aria-expanded` flipping to `true`. Same for the format popover, the campaign
  popover and Copy blocks. A screen-reader user is told a dialog opened and then
  has to hunt forward through the page for content that, in the Settings case,
  reads only "No app settings yet." (The Help drawer does this correctly: it
  moves focus to `#help-search`.) Escape closes all of them and — measured on an
  open-then-Escape sequence rather than after tabbing away — focus is correctly
  restored to the trigger in five of six cases.
- **Proof**: `audit/run-1/area-H/out/data/keyboard2.json` → `escape`;
  `audit/run-1/area-H/out/data/stories.json` → S3;
  screenshot `audit/run-1/area-H/out/stories/08-S3-settings-dialog.png`
- **Suspected file**: `src/components/shell/AppHeader.tsx:170-181`, `src/components/shell/AppFooter.tsx:51-59` and `:151-186`, `src/components/shell/CampaignChip.tsx`

---

### H-9  Escape from the symbol palette drops focus on `<body>` — the only overlay that fails to restore it
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-H/run-stories.cjs`.
  2. Focus `#ui-symbols`, press Enter to open the palette, press Escape.
  3. Read `document.activeElement`.
- **Expected**: focus returns to the Symbols button, as it does for Settings, the format popover, the campaign popover, Copy blocks and the Help drawer (all measured `focusRestored: true`).
- **Actual**: the palette closes correctly, but focus lands on `<body>`
  (`focusRestored: false`). The next Tab restarts from the top of the document,
  so a keyboard user who dips into the palette mid-clip loses their place and
  has to tab back through the whole header. The palette is also the only overlay
  that fully traps focus while open (0 of 40 Tab presses left it), which makes
  the inconsistent exit more jarring.
- **Proof**: `audit/run-1/area-H/out/data/keyboard2.json` → `escape` (`#ui-symbols` row),
  `audit/run-1/area-H/out/data/keyboard.json` → `overlays`,
  `audit/run-1/area-H/out/data/stories.json` → S7;
  screenshot `audit/run-1/area-H/out/stories/11-S7-escape-focus.png`
- **Suspected file**: `src/components/SymbolPalette.tsx`

---

### H-10  No `h1` anywhere, and the whole workspace exposes exactly one heading
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-H/run-sweep.cjs` / `run-stories.cjs`.
  2. Collect every visible `h1`–`h6` and every landmark, and dump the Chrome
     DevTools Protocol accessibility tree (`Accessibility.getFullAXTree`).
- **Expected**: one `h1` naming the screen, and headings over the three columns so
  heading navigation works.
- **Actual**: the workspace exposes `[{level: 2, text: "Transcript"}]` and nothing
  else. There is no `h1` in the product; heading navigation starts at an `h2` for
  the left column and then stops. The centre and clips columns have no heading at
  all, and neither does the footer. Landmarks are better than the headings
  suggest — the AX tree shows `main`, `navigation`, 4 × `region`, 2 ×
  `sectionheader`, 1 × `sectionfooter`, `tablist`/`tab`/`tabpanel` — and
  **every interactive node in the AX tree has an accessible name** (0 unnamed
  buttons, links, textboxes, tabs or sliders), so the icon-only buttons are
  correctly labelled. The gap is purely the heading tree, plus no `role="search"`
  on either search field.
- **Proof**: `audit/run-1/area-H/out/data/stories.json` → S12, `extra.axRoles`,
  `extra.axUnnamed: []`; `audit/run-1/area-H/out/data/sweep.json` → `semantics.headings`
- **Suspected file**: `src/App.tsx:354-430`, `src/components/shell/ThreeColumnLayout.tsx`

---

### H-11  The channel-data segmented control uses white on accent — 2.91:1, and the only off-token colour in the app
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-H/run-states.cjs` on an owner build (`#ui-channel-link` present).
  2. Click Channel data.
  3. Read the computed colour and painted background of the selected "All" chip.
- **Expected**: the token for text on an accent fill is `accent.on = #0B0B0C`,
  which the primary buttons use and which measures 7.74:1 on `#FF7979`.
- **Actual**: the selected segment paints **`#FFFFFF` on `#FF6363` = 2.91:1** at
  12px — fails AA for normal text, and fails the 3:1 bar even if it were large.
  It is also the single off-token text colour found in the entire product: the
  token scan across all 28 states turned up no other stray colour, no stray
  radius and no stray type size.
- **Proof**: `audit/run-1/area-H/out/data/states.json` → `channel-data` →
  `text` (search `"#FFFFFF"`) and `tokens.textColors`;
  screenshot `audit/run-1/area-H/out/states-main/11-channel-data.png`
- **Suspected file**: `src/components/ChannelExportPanel.tsx` (the scope segmented control, `button.rounded-chip.px-2.5.py-1`)

---

### H-12  The URL input has no label — only a placeholder that vanishes as soon as you type
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-H/run-sweep.cjs`.
  2. For every `input`/`select`/`textarea`, check `labels`, `aria-label`, `aria-labelledby`, `title`.
- **Expected**: a persistent programmatic label (WCAG 3.3.2 / 4.1.2). A
  placeholder is not a label.
- **Actual**: `#ui-source-chip input[type=url]` has none of the four — its only
  description is `placeholder="Paste a YouTube link. It loads on paste."`, which
  disappears the moment a link is in the field. It is the single most important
  control in the app and the first thing anyone touches. It is also the **only**
  unlabelled form control found: the help search has a `<label for>`, the
  transcript search has an `.sr-only` label, the bank search has `aria-label`,
  and the browser `<select>` in the sign-in modal has `aria-label`.
- **Proof**: `audit/run-1/area-H/out/data/sweep.json` → `semantics.issues`
  (`form-control-no-label`, every state)
- **Suspected file**: `src/components/UrlBar.tsx:38-49`

---

### H-13  Download progress is painted but not exposed: no `role="progressbar"`, no `aria-valuenow`
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-H/run-download.cjs` — loads a video, marks 00:00:05→00:00:12 by typing into the In/Out fields, adds the segment, presses Cut.
  2. Poll the DOM ten times at 500ms while the cut runs; count `[role=progressbar]` and `[aria-valuenow]`, and list every live region with its text.
- **Expected**: either `role="progressbar"` with `aria-valuenow`/`aria-valuetext`,
  or a polite live region that actually carries the percentage.
- **Actual**: measured in flight — **0 elements with `role="progressbar"`** at
  every sample, and the only `aria-valuenow` on the page is the timeline slider's
  (`"0"`). Live regions do exist and do their job for start/finish/failure:
  `role="status"` reading "1 segment, 00:00:07 · MP4", `role="alert"` carrying
  the failure text, plus three `aria-live="polite"` counters. But the percentage
  the progress bar draws is never in any of them, so a screen-reader user is told
  a cut started and later that it ended, and hears nothing in between.
- **Proof**: `audit/run-1/area-H/out/data/download.json` → `samples`
  (`progressbar: 0`, `valuenow: ["0"]`), `audit/run-1/area-H/out/data/stories.json` → S9;
  screenshots `audit/run-1/area-H/out/download/02-download-mid.png`,
  `audit/run-1/area-H/out/download/04-bank-search-clipped.png`
- **Suspected file**: `src/components/shell/DownloadBar.tsx:80`, `src/components/DownloadsPanel.tsx`

---

### H-14  The bank search placeholder is cut off at the default clips-column width, with no title
- **Severity**: polish
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-H/run-download.cjs`, or any run that opens the Bank tab at 1440x900.
  2. Look at the search field at the top of the Bank tab.
- **Expected**: the prompt reads in full, or the truncation carries a `title`.
- **Actual**: the field renders **103px wide** (19.5px of that is padding) and the
  placeholder "Search the bank" is cut to "Search the". There is no `title`
  attribute, so hovering reveals nothing. It does carry `aria-label="Search the
  bank"`, so screen-reader users are fine — this is a sighted-user defect only.
  It reproduces at 1440x900 and 1920x1080, i.e. at the column's *maximum* width,
  because "Import timestamps" beside it takes the rest of the row.
- **Proof**: `audit/run-1/area-H/out/data/download.json` → `bankSearch`
  (`inputWidthPx: 103`, `placeholder: "Search the bank"`);
  screenshots `audit/run-1/area-H/out/download/04-bank-search-clipped.png`,
  `audit/run-1/area-H/out/states-main/09-bank-populated.png`
- **Suspected file**: `src/components/ClipsColumn.tsx:327`

---

### H-15  Text inputs get a 1px focus border where every button gets a 2px ring, and the URL bar's is only 3.32:1
- **Severity**: polish
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-H/run-rings.cjs`.
  2. Focus each control from the keyboard, screenshot the viewport, and read the
     pixel colour of each scanline from the control's own border row (y0) outward.
- **Expected**: one consistent focus treatment. The global rule gives buttons
  `outline: 2px solid var(--accent)` at `outline-offset: 2px`.
- **Actual**: measured rows (y0 = the control's own top border row):

  | Control | y-4 | y-3 | y-2 | y-1 | y0 | page | strongest |
  |---|---|---|---|---|---|---|---|
  | `button` Whole video | `#FF6363` | `#FF6363` | `#1D1D1F` | `#1D1D1F` | `#2E2E31` | `#1D1D1F` | **5.78:1**, 2px thick |
  | `.field` In timecode | `#1D1D1F` | `#462A2B` | `#462A2B` | `#462A2B` | `#FF6363` | `#1E1E20` | **5.72:1**, 1px thick |
  | `.field` help search | `#1A1A1C` | `#432729` | `#432729` | `#432729` | `#FF6363` | `#1A1A1C` | **5.97:1**, 1px thick |
  | URL bar wrapper | `#0B0B0C` | `#371B1C` | `#371B1C` | `#371B1C` | `#A44647` | `#0B0B0C` | **3.32:1**, 1px thick |

  So the contrast bar (3:1, SC 1.4.11) is met everywhere — this is not an AA
  failure — but three things are off: the `.field` indicator is a third the
  thickness of the button one; the 3px `rgba(255,99,99,0.18)` glow that is meant
  to carry it measures only **1.29:1** (`#462A2B` on `#1E1E20`), so it adds
  almost nothing; and the URL bar, which uses `border-accent/60` rather than full
  accent, lands at 3.32:1 — within 0.32 of failing, on the first control anyone
  touches. All of these explicitly cancel the global ring with
  `outline-none` / `outline: none`.
- **Proof**: `audit/run-1/area-H/out/data/rings.json` → `rings`;
  `audit/run-1/area-H/out/data/keyboard2.json` → `rings`;
  `audit/run-1/area-H/out/data/stories.json` → S4, S11;
  screenshots `audit/run-1/area-H/out/stories/02-S11-field-focus.png`, `10-S4-url-focus.png`
- **Suspected file**: `src/styles.css:263-278` (`.field`), `src/components/UrlBar.tsx:32,48`

---

### H-16  The floating panels cover the header's Settings and Help and part of the mark bar
- **Severity**: polish
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-H/run-rings.cjs` at 1440x900.
  2. Open the symbol palette (then Copy blocks). Compute the pairwise box
     intersection of every visible interactive control where neither contains the other.
- **Expected**: a non-modal floating panel should not sit on top of the controls
  that are meant to stay available — the spec puts Help "always the last item,
  top right, on every screen".
- **Actual**: with the symbol palette open, **16 control pairs overlap**,
  including Settings × "Keep on top" (15×9px), Settings × "Close symbols"
  (11×11px), **Help × "Close symbols" (15×11px)**, the session chip × "Keep on
  top", Check × "Keep on top", and Add segment × a phrase chip (132×22px). With
  Copy blocks open: Settings × close (11×8px), Help × close (15×8px), the "All
  saved" tab × a Copy button (71×9px). With the campaign popover open, "New
  campaign" overlaps the transcript's Follow button, search field and
  prev/next match buttons. The panels are `fixed right-4` with no top offset for
  the 48px header, so the header's right-hand cluster is simply unreachable
  while a panel is open.
- **Proof**: `audit/run-1/area-H/out/data/rings.json` → `overlaps`;
  `audit/run-1/area-H/out/data/sweep.json` → `overlaps` for `symbol-palette`;
  screenshots `audit/run-1/area-H/out/sweep/05-symbol-palette.png`, `04-copy-blocks.png`, `03-campaign-popover.png`
- **Suspected file**: `src/components/SymbolPalette.tsx`, `src/components/CopyBlocks.tsx` (`.surface-panel.fixed.right-4`)

---

### H-17  Type does not respond to the OS/browser base font size — only to page zoom, which triggers H-3
- **Severity**: polish
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-H/run-layout.cjs`.
  2. Set `document.documentElement.style.fontSize = "24px"` (what a browser/OS
     "larger text" setting does).
  3. Read the computed `font-size` of the body and of a heading.
- **Expected**: at least the body tiers scale with the user's base font size.
- **Actual**: measured `rootFontSize: "24px"`, `bodyPx: "13px"`,
  `headingPx: "13px"` — **no change at all**. Every size in
  `tailwind.config.ts` is an absolute px value (20/16/13/12/26) and every
  control height is a px token (36/28/24/32/48/32), so the only route to larger
  text is page zoom — which is precisely the route that pushes the mark bar off
  screen (H-3). The two defects compound: the user who most needs bigger text is
  the one who loses the Cut button.
- **Proof**: `audit/run-1/area-H/out/data/layout.json` → the `base-font-24px`
  run (`fontProbe`); screenshot `audit/run-1/area-H/out/layout/16-base-font-24px.png`
- **Suspected file**: `tailwind.config.ts:24-30` (fontSize scale), `:46-53` (spacing scale)

---

### H-18  Three decorative SVGs are neither `aria-hidden` nor labelled
- **Severity**: polish
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-H/run-sweep.cjs`.
  2. For every visible `<svg>`, check for `aria-hidden="true"`, a `role="img"` with
     a name, or an enclosing labelled control.
- **Expected**: decorative icons carry `aria-hidden="true" focusable="false"`, as
  the help drawer's close icon correctly does.
- **Actual**: three do not, and are not inside any labelled control, so they can
  surface as stray graphic nodes:
  - the search magnifier in the URL bar (`div#ui-source-chip > div.group > svg.bi.bi-search`),
  - the camera glyph in the empty preview plate (`div.absolute.inset-0 > svg.bi.bi-camera-video`),
  - the clock glyph in the "All saved" tab header (`div#clips-panel > … > svg.bi.bi-clock`).
  This is low impact — the AX tree dump found no unnamed interactive node and
  the surrounding text carries the meaning — but it is inconsistent with the
  rest of the icon handling.
- **Proof**: `audit/run-1/area-H/out/data/sweep.json` → `semantics.issues`
  (`svg-not-hidden-not-labelled`)
- **Suspected file**: `src/components/UrlBar.tsx:36`, `src/components/PreviewPanel.tsx`, `src/components/ClipsColumn.tsx`

---

## User stories run (step 4)

Each was executed against the real app; the verdicts and their measurements are
in `audit/run-1/area-H/out/data/stories.json`, screenshots in
`audit/run-1/area-H/out/stories*/`.

| # | Access need | Verdict |
|---|---|---|
| S1 | A clipper on a 13-inch laptop (1440x900) at 150% browser zoom, marking a segment by keyboard only | **Fails** — CSS viewport 960x600; Mark in/out, Whole video, Add segment, Cut and the length readout are all off screen before a key is pressed (H-3) |
| S2 | A keyboard-only clipper on a fresh install, met by the blocking sign-in modal | **Fails** — focus starts on `<body>`, 35/40 Tab stops land behind the scrim, nothing is inert, Escape is a no-op (H-2) |
| S3 | A screen-reader user opening Settings from the header | **Fails** — `role="dialog"` with no `aria-modal`, no focus move, nothing announced (H-8) |
| S4 | A low-vision clipper pasting a link, needing to see where the keyboard is | **Marginal pass** — 1px `#A44647` border at 3.32:1; the global 2px ring is cancelled (H-15) |
| S5 | A keyboard user closing one of several open video tabs | **Fails** — the close button takes focus at `opacity: 0`; pixel diff shows nothing is painted (H-5) |
| S6 | A clipper on a 1024x768 machine looking for the clip bank | **Fails** — Clips column at y=905 in a 768px viewport, 415px of scrolling inside an unnamed container (H-4) |
| S7 | A keyboard-only clipper who opens the symbol palette and presses Escape | **Fails** — focus lands on `<body>`; the next Tab restarts at the top (H-9) |
| S8 | A clipper with vestibular sensitivity whose OS is set to Reduce Motion | **Fails** — query matches, 22 elements still animate, 0 rules, one `repeat: Infinity` loop (H-7) |
| S9 | A screen-reader user waiting for a cut to finish | **Partial** — start, finish and failure are announced via `role="status"`/`role="alert"`; the percentage is not exposed at all (H-13) |
| S10 | A clipper who was told the design hides scrollbars, scrolling the setup checklist | **Half fails** — a 15px bar is painted over 597px of hidden content, but wheel and PageDown both work (H-6) |
| S11 | A low-vision clipper tabbing to the In/Out timecode fields | **Marginal pass** — 1px `#FF6363` border at 5.72:1, but the 3px glow meant to carry it is 1.29:1 and a third the thickness of the button ring (H-15) |
| S12 | A screen-reader user orienting by headings and landmarks | **Fails on headings** — one `h2` in the whole workspace, no `h1`; landmarks and accessible names are good (H-10) |
| S13 | A clipper with a long campaign name and a long lecture title in a 900x700 window | **Mostly passes** — all 4 truncations carry `title`, no horizontal scroll; still loses Cut and the Clips column off screen (H-3, H-4) |

---

## Coverage

**Screens and states measured** (28 distinct states, all with full contrast,
semantics, scrollbar, overlap and layout passes):

workspace empty · workspace with an active campaign · video loading · video
error (real yt-dlp 403/unavailable strings) · video loaded · segment added ·
download in flight · after cut · settings popover · campaign popover (empty and
populated) · footer format/quality popover · footer data-folder confirm popover ·
session chip menu · copy blocks · symbol palette · help drawer · setup checklist
(expanded) · clips tab "This video" · clips tab "Bank" (empty and populated with
3 rows) · clips tab "All saved" (empty and populated) · sign-in modal fresh ·
sign-in modal with both disclosures expanded · sign-in modal expired · channel
data exporter (owner build; `#ui-channel-link` was present in this build) ·
long-string variant (184-char video title, 83-char campaign name).

**Sizes**: 900x700, 1024x768, 1280x800, 1440x900, 1920x1080 — each for the empty
workspace, a loaded video, and the long-string variant; plus the help drawer
open at 1024x768 / 1280x800 / 1440x900.

**Zoom**: real `webContents.setZoomFactor` at 100% / 150% / 200% on both 1280x800
and 1440x900 (CSS viewports 853x533, 640x400, 960x600, 720x450), plus a
`html { font-size: 24px }` probe.

**Keyboard**: full Tab traversal from a cold start (19 stops) and with a video
loaded (26 stops, wrap detected); focus-paint diffs on 12 controls; open/trap/
Escape/restore on 6 overlays and the modal; 40-press trap tests on the modal and
each overlay.

**Measurement volume**: 1,795 visible text nodes → 123 distinct colour ×
background × size × weight combinations; 7 icon-only controls; 6 distinct
visible scrollbars; the full token inventory (radii, type sizes, text colours,
backgrounds, gaps, paddings) in every state; the CDP accessibility tree.

**Scripts** (all under `audit/run-1/area-H/`): `lib/probe.js`, `lib/drive.cjs`,
`lib/launch.cjs`, `lib/stub.cjs`, `lib/states.cjs`, `run-sweep.cjs`,
`run-layout.cjs`, `run-zoom.cjs`, `run-keyboard.cjs`, `run-keyboard2.cjs`,
`run-states.cjs`, `run-stories.cjs`, `run-rings.cjs`, `run-download.cjs`,
`smoke.cjs`, `probe-signin.cjs`. Raw measurements in
`audit/run-1/area-H/out/data/*.json`, screenshots in `audit/run-1/area-H/out/*/`.

**Reaching the signed-in app offline.** The shared harness cannot get past the
sign-in gate with no network, so area H added two pieces of its own scaffolding,
both inside `audit/run-1/area-H/`: `lib/launch.cjs` wraps `launchApp()` and drops
a synthetic Netscape `yt-cookies.txt` into the fresh user-data dir before Electron
starts (the launch-time restore reads it), and `lib/stub.cjs` adds one behaviour
to the harness stub — the `--simulate` auth probe prints yt-dlp's real
"Found YouTube account cookies" marker, which `server/youtubeAuth.ts` classifies
as `signed_in`. An `authFail` switch turns it off so the modal states can be
measured for real. No product code was read into, copied into or changed by any
of this.

---

## Measurements deliberately not reported as findings

Two combinations fail on the pixel reading and pass on the CSS cross-check, so
they are sampler artifacts, not defects. Recorded here so nobody re-finds them:

- `#F5F5F7` on a sampled `#88888A` = **3.25:1** — the `ﷺ` chip in the symbol
  palette. The glyph fills most of its own line box, so the histogram picks up
  antialiasing instead of the chip. CSS background is `#1C1C1F`, giving the
  correct **15.61:1**.
- `#969697` on a sampled `#4B2728` = **4.39:1** — the mark bar's "Out" label and
  its `kbd` chip, measured *through* the sign-in modal's 90% scrim and the
  ambient accent radial gradient. The real backgrounds are `#161618` (6.12:1)
  and `#1C1C1F` (5.75:1).

Also checked and clean, so stated as passes rather than left silent: no
horizontal scrollbar at any size or zoom level tested; the long-string pass found
4 truncations and all 4 carry a `title`; the AX tree has zero unnamed buttons,
links, textboxes, tabs or sliders; the clips tablist implements roving
`tabindex` with working Left/Right arrow keys; Escape closes every overlay; five
of six overlays restore focus to their trigger; and the disabled-state token
`#909092` measures 5.04–5.67:1 everywhere it is actually used.

## Not provable here

- **Transcript-loaded states.** The stub returns no subtitles, so the transcript
  list, its search field and its prev/next match buttons were only ever measured
  in their disabled state. Their contrast, focus rings and tab-order position
  with real cues are **not provable here** (network policy; `audit/inventory.md` §0).
- **Screen-reader output itself.** The AX tree, roles, names, live regions and
  heading structure are measured; what VoiceOver/NVDA/Orca actually speaks, and
  whether a live-region update is announced in practice, is **not provable here**.
- **Platform scrollbar rendering.** Linux Chromium paints classic 15px bars. On
  macOS overlay scrollbars the same elements may look clean at rest, so the
  *visual* severity of H-6 on macOS/Windows is **not provable here** — but the
  absence of any scrollbar CSS is, and that is what the finding rests on.
- **Real OS text-size settings** (macOS/Windows accessibility text scaling, as
  opposed to browser zoom) — **not provable here**; only the `html { font-size }`
  and `setZoomFactor` routes were exercised.
- **Packaged-app window chrome**: title bar, traffic lights, minimum window size
  and what the installer's default window size actually is. H-3 and H-4 are
  reported against sizes set programmatically; whether the shipped build can even
  be resized to 900x700 is **not provable here** (needs the packaged app per OS).
- **High-contrast / forced-colors mode** and **Windows "Make text bigger"** —
  **not provable here**.
- **Signed-in 1080p UI differences** (quality menu contents, any 1080p-only
  affordance) — **not provable here**; the session is synthetic.
- **macOS editor-handoff dialogs** (Final Cut / Premiere / CapCut) — **not
  provable here**; Linux container.

## Noted in passing — not area H's to fix

- Cutting a marked 7-second segment in this container ends in
  `yt-dlp exited with code null` with an empty clips folder
  (`audit/run-1/area-H/out/data/download.json` → `savedFiles: []`,
  screenshot `out/download/04-bank-search-clipped.png`). Area B/G.
- The preview thumbnail `<img>` 404s offline and renders as a broken-image box
  with its alt text visible. Expected given the network policy; the alt text is
  correct, which is why area H does not flag it.
