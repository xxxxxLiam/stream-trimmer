# Verification — slice 5: layout, accessibility, and the clip bank at scale

Independent re-run of 13 findings: B-6, B-9, B-10, C-2, C-5, C-6, C-7,
H-1 … H-6. Every one was driven from the finding's own **Steps** with scripts
written for this verification (`audit/run-1/verify/slice-5/`), never by running
the original author's script. Every case is a **cold start** — `launchApp()`
mints a fresh `--user-data-dir` per launch — and every case was attempted at
least twice.

**No product code was changed.** The only scaffolding this slice added is its
own stub root (`v5-stubroot.cjs`), which answers yt-dlp's `--simulate` auth
probe with yt-dlp's own "Found YouTube account cookies" marker, plus a
synthetic Netscape `yt-cookies.txt` written into the fresh user-data dir before
Electron starts. That gets past the sign-in gate **without hiding anything in
the DOM**, so the layout and focus measurements are taken on the real,
unmodified page. `signedIn:false` turns it off again for H-2.

## Verdicts at a glance

| ID | Verdict | Severity (mine) | Severity (claimed) |
|---|---|---|---|
| B-6 | CONFIRMED | major | major |
| B-9 | DOWNGRADED | minor | major |
| B-10 | DUPLICATE-OF-H-3 | — (part of H-3) | major |
| C-2 | CONFIRMED | major | major |
| C-5 | DOWNGRADED | minor | major |
| C-6 | DOWNGRADED | minor | major |
| C-7 | DOWNGRADED | minor | major |
| H-1 | DOWNGRADED | minor | major |
| H-2 | CONFIRMED | major | major |
| H-3 | CONFIRMED | major | major |
| H-4 | DUPLICATE-OF-H-3 | — (part of H-3) | major |
| H-5 | DOWNGRADED | minor | major |
| H-6 | DOWNGRADED | polish | major |

**4 confirmed · 0 refuted · 7 downgraded · 2 duplicate.** Nothing in this slice
was flaky: every case reproduced on every attempt, and the layout and contrast
numbers were byte-identical between runs.

Note on the pattern: no finding in this slice was fabricated. Every *measurement*
holds up, several to the pixel. What does not hold up is the severity: seven of
thirteen were filed as `major` for defects that are survivable, have a plain
workaround, or are cosmetic against the bar in `audit/harness/README.md`.

## What a user can actually produce

`electron/main.cjs:261-264` sets `width: 1100, height: 760, minWidth: 900,
minHeight: 600`. Read out of the live main process and tested, not inferred:

```
minimumSize [900,600]  currentSize [1100,760]  currentContentSize [1100,760]
window clamp test: asked for 400x300 -> got 900x600
hasApplicationMenu true, zoom roles present and enabled:
  resetzoom, zoomin, zoomout, zoom
```

So **900x600 is a real, reachable window** (the app refuses to go smaller, and
nothing smaller was tested here), **1100x760 is what every user gets on first
launch**, and page zoom is reachable because no custom menu replaces Electron's
default View menu. On a platform with window decorations the *content* height at
the 900x600 minimum is smaller than 600, so the real-world case is slightly
worse than measured, never better. Nothing in this slice rests on a viewport a
user could not have.

---

### B-6 — Cancel does not stop the engine, and killing the app orphans it
- **Verdict**: CONFIRMED
- **Severity**: major
- **Runs**: 2 attempts, 2 reproduced (identical)
- **What I did**: cold start signed in; loaded the video with a fast stub, then
  rewrote `stub.json` to `delayMs: 240000` so only the *download* takes minutes;
  typed 00:00:05 → 00:00:12, Add segment, Cut; waited for the Cancel control to
  appear, counted engine processes by this slice's own stub path (so another
  helper's run cannot be counted as mine), pressed Cancel, waited 15 s and
  counted again; then started a second cut and SIGKILLed the Electron main
  process and counted 6 s later.
- **Proof**: `audit/run-1/verify/slice-5/v5-b6-cancel.cjs`,
  output `audit/run-1/verify/slice-5/out/b6.txt`, screenshots
  `out/b6-1/01-b6-01-cut-running.png`, `out/b6-1/02-b6-02-after-cancel.png`.
  Both runs:
  ```
  during the cut: 3 yt-dlp process(es)
  UI right after Cancel: {"cancelStillShown":false,"statusText":""}
  15s after Cancel: 3 still running        (etimes 19s — same pids)
  before SIGKILL of the app: 4
  6s after the app was killed: 4 still running
  ```
  The UI returns to idle instantly while the children run on; killing the app
  orphans all of them. Severity stands: Cancel is a core function, it is wholly
  ineffective, and there is no other way to stop the work from inside the app —
  even quitting does not.

---

### B-9 — With many tabs the strip never scrolls to the active tab and the + button is off screen
- **Verdict**: DOWNGRADED
- **Severity**: minor (claimed major)
- **Runs**: 2 attempts, 2 reproduced (identical)
- **What I did**: cold start with `clipper.workspaces` seeded to 25 tabs and
  `activeId` on the last one. Found the strip properly (it has **no**
  `role="tablist"` — it is the `overflow-x-auto` div that owns the `role="tab"`
  children and the New tab button) and measured scroll geometry and mount counts.
- **Proof**: `audit/run-1/verify/slice-5/v5-h5-h6-b9.cjs` (`b9`),
  output `audit/run-1/verify/slice-5/out/b9.txt`, screenshot
  `out/b9-1/01-25-tabs.png`:
  ```
  tabsInVisibleStrip 25, scrollLeft 0, scrollWidth 2171, clientWidth 1081
  activeInView false (active tab left edge x=2072), newTabButtonInView false (x=2157)
  mountedMarkBars 25, mountedCutButtons 25, mountedTranscriptCols 25
  headersInWholeDoc 50, roleTabInWholeDoc 100
  ```
- **Why the original was wrong**: the behaviour is real — the selected tab is
  never scrolled into view and the + button sits past the right edge — but the
  finding's reason for calling it major is **"a strip that has no visible
  scrollbar"**, and that is false. `horizontalScrollbarPx` is **15**, and the
  screenshot shows a classic Chromium horizontal scrollbar directly under the
  strip. The strip scrolls by wheel, drag and keyboard, so there is a plain
  workaround and nothing is unreachable. (The same 15px bar is H-6, which the
  same area filed as a defect — the two findings contradict each other.) The
  real cost is the missing `scrollIntoView` plus 25 fully mounted workspaces;
  survivable, so minor.

---

### B-10 — The primary action sits below the fold at the app's own minimum window size
- **Verdict**: DUPLICATE-OF-H-3
- **Severity**: part of H-3 (major)
- **Runs**: 2 attempts, 2 reproduced
- **What I did**: cold start per window size, video loaded, read the rect of
  `#ui-cut` against the viewport; then added 1–5 segments at 1024x768 and
  repeated — and, which B-10 does not do, repeated the same segment sweep at
  1280x800 and 1440x900.
- **Proof**: `audit/run-1/verify/slice-5/v5-layout.cjs`, outputs
  `out/layout-run1.txt` / `out/layout-run2.txt`, screenshot
  `out/layout-900x600-r2/01-900x600-0seg.png`.
  B-10's headline number is **exact**: at 900x600, `Cut` is
  `y=665..701` (empty workspace `677..713`) in a 600px viewport — fully below.
  The per-segment drift reproduces too, one segment later than claimed:
  ```
  1024x768: 0 seg cut 712..748 visible | 1 seg 727..763 visible
            2 seg 781..817 BELOW | 3 seg 834..870 | 4 seg 888..924 | 5 seg 941..977
  1280x800: 0..5 segments — cut stays at 616..652, always visible
  1440x900: 0..5 segments — cut stays at 716..752, always visible
  ```
- **Why this is not its own defect**: see the breakpoint experiment under H-3.
  B-10 and H-3 are the same control going off the same fold for the same reason
  at overlapping sizes, and one change in `ThreeColumnLayout.tsx` fixes both.
  B-10's own suspected file is already `ThreeColumnLayout.tsx`. "Every segment
  pushes the primary action further out of sight" is true only below 1160px
  wide; above it the centre column is its own scroller and `#ui-cut` does not
  move at all.

---

### C-2 — A deleted campaign's bank survives, and a new campaign with the same name adopts it
- **Verdict**: CONFIRMED
- **Severity**: major
- **Runs**: 4 attempts, 4 reproduced (identical)
- **What I did**: cold start with no campaigns; created **Acme Q4** through the
  header popover; loaded the video; Bank tab; imported
  `A01 1:00-1:30 acme hook | hook | T1` and `A02 2:00-2:40 acme payoff | payoff | T2`;
  Remove → Confirm on Acme Q4; read `settings.json` off disk; created a new
  campaign also called **Acme Q4**; opened the Bank tab again.
- **Proof**: `audit/run-1/verify/slice-5/v5-c.cjs` (`c2`), output
  `audit/run-1/verify/slice-5/out/c2.txt`, screenshots
  `out/c2-1/01-c2-01-banked.png`, `02-c2-02-after-delete.png`,
  `03-c2-03-recreated.png`:
  ```
  campaigns after delete: []
  bank row counts still on disk after delete: {"acme-q4":{"stub0000001":2}}
  campaigns after recreating 'Acme Q4': [{"id":"acme-q4", ...}]
  bank view after recreate: rowCount 2,
    ["Import timestamps","hook","payoff","Tier 1","Tier 2","2 clips","Sort by tier",
     "00:01:00 - 00:01:30","0:30","A01 acme hook","hook","T1","In band","banked", ...]
  ```
  The campaign list is empty, the bank entry is byte-identical on disk, the id
  slugs back to `acme-q4`, and the new campaign opens showing the deleted
  client's two clips with their categories and tiers already in the filter chips.
  Severity stands: data the user believes they deleted is retained indefinitely
  and then resurfaces under a different client, and there is no bulk way to
  clear it (C-12 — the clips column has no undo, clear or multi-select).

---

### C-5 — Two campaigns can carry the same name, and nothing tells them apart
- **Verdict**: DOWNGRADED
- **Severity**: minor (claimed major)
- **Runs**: 4 attempts, 4 reproduced (identical)
- **What I did**: cold start seeded with **Acme Q4**; created **Beta Launch**
  through the popover; Edit Beta Launch → name `Acme Q4` → Save; read the
  persisted campaigns, the popover rows and the header chip.
- **Proof**: `audit/run-1/verify/slice-5/v5-c.cjs` (`c5`), output
  `audit/run-1/verify/slice-5/out/c5.txt`, screenshot
  `out/c5-1/01-c5-duplicate-names.png`:
  ```
  before: [["acme","Acme Q4"],["beta-launch","Beta Launch"]]
  after : [["acme","Acme Q4"],["beta-launch","Acme Q4"]]
  validation alert shown: null
  popover rows: ["Acme Q4 | 0:30 to 1:00 | Edit | Remove",
                 "Acme Q4 | 0:30 to 1:00 | Edit | Remove"]
  header chip: "Campaign\nAcme Q4"
  ```
- **Why the original was wrong**: only on severity. The behaviour is exactly as
  described, including the two visually identical rows. But this is a missing
  validation on a name the user typed themselves, the ids stay distinct so no
  data is mixed or lost, and the fix from the user's side is one rename away in
  the same popover they are already standing in. "Wrong but survivable, with a
  workaround" is the definition of minor in `audit/harness/README.md`. It is a
  real hazard — the next cut can land on the wrong client — but a hazard the
  user has to create and can undo.

---

### C-6 — A 5,000-row bank makes the list unusable: 1–2 s per search keystroke
- **Verdict**: DOWNGRADED
- **Severity**: minor (claimed major)
- **Runs**: 4 attempts at 5,000 rows (2 in the main run, 2 in the scale sweep),
  4 reproduced; plus a 5-point scale sweep run twice and a 200-row control
  twice
- **What I did**: cold start with `clipper.bank` seeded to N rows under the
  active campaign and video; opened the Bank tab; clicked into **Search the
  bank**; sent nine real keystrokes (`l i n e ␣ 4 9 9 9`), each timed from
  before the key press to after a double `requestAnimationFrame`, so the number
  includes React's commit and the paint rather than just the event dispatch. A
  200-row control bank was measured the same way in the same process. Then a
  sweep at 100 / 500 / 1,000 / 2,000 / 5,000 rows to find where it stops being
  usable, and a timed 5,000-line import commit with every range inside the
  stub's 1:00:00 so all 5,000 rows actually land.
- **Proof**: `audit/run-1/verify/slice-5/v5-c.cjs` (`c6`) and
  `v5-c6b-scale.cjs`; outputs `out/c6.txt`, `out/c6b.txt`; screenshots
  `out/c6-5000-1/01-c6-5000-after-typing.png`.

  Measured per keystroke (ms), 5,000-row bank:
  ```
  run 1: 1589, 817, 699, 635, 681, 901, 450, 66, 54
  run 2: 1571, 763, 701, 750, 651, 982, 383, 67, 40
  ```
  Same keys, 200-row bank:
  ```
  run 1:   90,  61,  51,  50,  66,  51,  49, 35, 33
  run 2:  138,  66,  67,  66,  67,  67,  33, 39, 28
  ```
  `rows in DOM: 5000` and `5000 clips` confirm there is no virtualisation at all,
  and opening the Bank tab on 5,000 rows costs 286–345 ms.
  Where the knee actually is (worst of the first four keystrokes, two runs):
  ```
    100 rows:  71 / 86 ms      500 rows: 174 / 137 ms
   1000 rows: 322 / 324 ms    2000 rows: 672 / 734 ms
   5000 rows: 1443 / 1553 ms
  ```
  And the import commit the finding also times, with every range inside the
  stub's 1:00:00 so all the rows land:
  ```
  "Import 4997 clips" -> previewMs 125 / 151, commitMs 3801 / 3985, rowsStored 4997
  ```
  i.e. **3.8–4.0 s**, not the 5.4–6.1 s claimed.
- **Why the original was wrong**: the mechanism (unwindowed `<ul>`, re-filter on
  every change) and the first-keystroke cost are real and reproduce exactly. The
  severity is not. Two reasons. First, the headline overstates the steady state:
  **one** keystroke is in the 1–2 s band (1.57–1.59 s); the rest of the
  match-everything keystrokes land at 0.38–0.98 s, and the moment the query
  narrows they drop to 40–67 ms. Second, and decisive, the scale needed to get
  there is not a scale this product reaches: `clipper.bank` is keyed **per
  campaign per video**, so 5,000 rows means five thousand clips marked on one
  video. At the sizes a real bank reaches — 100 to 500 clips on one video is
  already generous — the worst keystroke is 71–174 ms, which nobody notices; it
  is only past ~1,000 rows on a single video that it becomes felt, and past
  ~2,000 that it becomes bad. The finding's other
  dramatic number — "typing nine characters had still not settled after 300 s
  and the run was abandoned" — did not reproduce in any of my four 5,000-row
  runs; the whole nine-key sequence completes in about 5.5 s of blocking.

---

### C-7 — A 5 MB paste with no timestamps renders 85,000 error rows and freezes for ~20 s
- **Verdict**: DOWNGRADED
- **Severity**: minor (claimed major)
- **Runs**: 2 attempts, 2 reproduced
- **What I did**: cold start, video loaded, Bank tab → Import timestamps; set
  the textarea to 5.6 MB of prose with no timestamp anywhere in it (63,168
  lines), via the native value setter plus an `input` event — which is what a
  paste does; timed to the painted "lines not understood" alert through a double
  `requestAnimationFrame`; counted the `<li>` elements; then timed Cancel.
- **Proof**: `audit/run-1/verify/slice-5/v5-c.cjs` (`c7`), output
  `audit/run-1/verify/slice-5/out/c7.txt`, screenshot
  `out/c7-1/01-c7-5mb-preview.png`:
  ```
  pasted 5610841 bytes / 63168 lines
  preview painted after: 14525 ms (run 1), 14389 ms (run 2)
  error <li> in the DOM: 63168
  alert headline: "63168 lines not understood. They will be skipped."
  import button: "Nothing to import"
  cancel took: 1140 ms (run 1), 1211 ms (run 2)
  pageErrors: []
  ```
  Per line that is 0.23 ms, which is exactly the rate behind the original's
  19,528 ms over 85,000 shorter lines — so the claim's arithmetic is sound and
  the only difference is line length. The uncapped error list is real:
  one `<li>` per line, with the line number, the reason and the full text.
- **Why the original was wrong**: severity only, and one number. Cancel took
  1.1–1.2 s, not 2.4 s. More importantly this is a pathological input that the
  app survives cleanly: no renderer crash, no page error, nothing persisted, the
  message is correct ("Nothing to import"), and the user is back in a working
  app about 15 s later by pressing Cancel. Nothing is lost and no function is
  broken — "wrong but survivable" is minor. The uncapped `preview.errors.map`
  is still worth fixing and is a two-line change.

---

### H-1 — Disabled text is drawn with `opacity-40`, not the disabled token, and lands at 2.01:1
- **Verdict**: DOWNGRADED
- **Severity**: minor (claimed major)
- **Runs**: 4 attempts, 4 reproduced (byte-identical)
- **What I did**: recomputed the contrast myself, from the computed styles of
  the running app, with my own implementation of the WCAG 2.x formula — I did
  not reuse area H's probe or trust its number. For the Reload label I read the
  declared colour, multiplied in every ancestor `opacity`, walked the ancestor
  chain for the first opaque background, composited, and applied the relative
  luminance formula. Then a second, independent reading from the real painted
  pixels: a Playwright screenshot handed back into the page, drawn on a canvas,
  histogram of the label's own box. Then I drove the app into the **Loading**
  state (stub `delayMs: 9000`) and measured that too, and looked for any other
  signal that the app is working.
- **Proof**: `audit/run-1/verify/slice-5/v5-h1-contrast.cjs`, output
  `audit/run-1/verify/slice-5/out/h1.txt`, screenshots
  `out/h1-contrast-1/01-urlbar-disabled.png`, `02-urlbar-loading.png`.

  ```
  reload button disabled: true
  declared colour  rgb(150,150,151) = #969697   12px   weight 400
  opacity chain    {"opacity":0.4,"steps":[{"el":"button[Reload source]","opacity":0.4}]}
  background       div.group.flex  rgb(28,28,31) alpha 1  -> #1C1C1F
  RENDERED         0.4 x #969697 over #1C1C1F = #4D4D4F  [77,77,79]

  WCAG:  L_text = 0.2126*f(77/255) + 0.7152*f(77/255) + 0.0722*f(79/255) = 0.074500
         L_bg   = 0.2126*f(28/255) + 0.7152*f(28/255) + 0.0722*f(31/255) = 0.011763
         ratio  = (0.074500 + 0.05) / (0.011763 + 0.05) = 2.016 : 1

  pixel reading (663 px sampled, 70 distinct colours):
         background #1C1C1F (448 px), glyph core #4C4C4E -> 1.984 : 1
  ```
  **So the quoted 2.01:1 is right.** I get 2.016:1 from CSS and 1.984:1 from the
  pixels. The comparison controls are right too: the four `#909092` nodes on the
  same screen measure 5.335–5.671:1.
- **Why the original was wrong**: not the number — the weight put on it. Two
  things.
  1. **WCAG 1.4.3 does not apply here.** The Incidental exception exempts "text
     that is part of an inactive user interface component". `button.disabled`
     is `true` whenever this text is at 2.016:1 — I checked it in the DOM, not
     in the stylesheet. So this is an inconsistency with the product's own
     `disabled: #909092` token, not an AA failure. Calling it "less than half
     the 4.5:1 required" asserts a requirement that is not required.
  2. **The "Loading" argument does not hold.** The finding's strongest line is
     that "the one word that tells you the app is working is the least readable
     text in it". Measured in the live Loading state, the same text is 2.016:1 —
     but it is not the only signal: `#ui-source-chip` simultaneously swaps its
     search glyph for an `animate-spin` arrow in `rgb(255,99,99)`, and the page
     also carries the text "Loading the video".
     ```
     {"spinnerPresent":true,"spinnerColour":"rgb(255,99,99)","spinnerAnimation":"spin",
      "reloadLabel":"Loading","otherLoadingText":["Loading","Load a video to see its
      transcript.","Loading the video"]}
     ```
  Real, worth fixing, one class to change — but minor.

---

### H-2 — The sign-in modal does not trap focus, does not take focus, leaves the app behind it live, and ignores Escape
- **Verdict**: CONFIRMED (and it is the same defect as A-10 — see below)
- **Severity**: major
- **Runs**: 4 attempts, 4 reproduced (identical), plus 4 runs of a follow-up
  that goes further than the original
- **What I did**: cold start with **no** cookies file and the stub set to refuse
  the auth probe, so the modal genuinely stays up. Recorded
  `document.activeElement` on open; pressed Tab 40 times, recording the element
  and whether the dialog contains it after each press; read `aria-hidden` and
  `inert` on `main` and `#root` and counted them document-wide; pressed Escape.
  Then the part the finding only implies: tried to **operate** the background
  from the keyboard, and hit-tested a real mouse click.
- **Proof**: `v5-h2-modal.cjs` and `v5-h2b-background-live.cjs`; outputs
  `audit/run-1/verify/slice-5/out/h2.txt` and `out/h2b.txt`; screenshots
  `out/h2-modal-1/01-signin-modal.png`,
  `out/h2b-1/01-settings-opened-behind-modal.png`,
  `out/h2b-1/02-video-loaded-behind-modal.png`. Both runs:
  ```
  role dialog, aria-modal "true", focusableInsideDialog 2
  aria-hidden on main: null   inert on main: false
  aria-hidden on #root: null  inert on #root: false   [inert] in document: 0
  initial focus: body
  tab stops: 5 inside the dialog, 35 outside, of 40
  reached outside: New tab, Close New tab, Campaign, the URL input, Copy blocks,
    Symbols, Channel data, the session chip, Check, Settings, Help, Follow,
    editor handoff, Bank, MP4/Best, Clips, Data
  dialog still present after Escape: true
  ```
  And the follow-up, 4/4:
  ```
  Enter on #ui-settings from behind the scrim -> aria-expanded "true",
      popover in DOM, body contains "No app settings yet"
  typed a URL behind the scrim -> titleShown true, clipsColumnAppeared true,
      modalStillUp true
  real mouse click on #ui-settings -> aria-expanded stays false
      (elementFromPoint returns div.fixed — the scrim eats pointer events)
  ```
  So the gate is **visual only**: a pointer user is blocked, a keyboard or
  screen-reader user walks straight through it and can load a video behind a
  90%-opaque scrim. Severity stands at major on its own merits, independent of
  dismissability.
- **H-2 vs A-1 — two defects, not one.** A-1 is *there is no way out of the
  modal at all* (no close/skip control, the product is unreachable for a user
  with no cookies.txt). H-2 is *the modal does not manage focus* (no initial
  focus, no containment, nothing inert). They are fixed in different places: A-1
  needs a dismissal path and a change to the open condition in `App.tsx:467`;
  H-2 needs focus handling in `YouTubeConnectModal.tsx` and would still be
  required for a gate that is deliberately undismissable. They overlap on one
  sub-claim only — "Escape does nothing" is cited by both — and that sub-claim
  belongs to A-1, since for a deliberate gate Escape *should* do nothing.
  **However**: H-2 is a genuine duplicate of **A-10** ("`aria-modal="true"` with
  no focus containment: focus never enters the dialog, 17 covered controls stay
  focusable, Escape does nothing"), which area A already filed, at `minor`. Same
  modal, same mechanism, same fix. One of the two should be dropped, and the
  survivor should be `major`, not `minor`: A-10's own "17 covered controls stay
  focusable" plus my finding that those controls can be driven to completion
  settles it.

---

### H-3 — The mark bar and Cut fall below the fold again — at 1024x768 with Help open, at 900x700, and at 150% zoom on a 1440x900 laptop
- **Verdict**: CONFIRMED
- **Severity**: major
- **Runs**: 2 attempts at every size, 2 reproduced (identical to the pixel)
- **What I did**: cold start per size; measured the empty workspace and then the
  loaded video; read the rects of `#ui-mark-in/out`, `#ui-mark-whole`,
  `#ui-add-segment`, `#ui-cut`, `#ui-stitched-total` and `#ui-col-clips` against
  `window.innerHeight`; opened the Help drawer at 1024x768; applied real
  `webContents.setZoomFactor` from the main process at 150% and 200%.
- **Proof**: `audit/run-1/verify/slice-5/v5-layout.cjs`, outputs
  `out/layout-run1.txt` and `out/layout-run2.txt`, screenshots
  `out/layout-help-1024x768-r2/01-help-1024x768.png`,
  `out/layout-zoom1.5-1440x900-r2/01-zoom1.5-1440x900.png`,
  `out/layout-900x600-r2/01-900x600-0seg.png`.

  My numbers against the finding's, same states:

  | Case (viewport) | Mark bar | Cut | Clip length | H-3 claimed |
  |---|---|---|---|---|
  | 1024x768, Help open | y=872 **below** | y=997 below | y=986 below | 872 / 997 / 986 — exact |
  | 1440x900 @150% (960x600) | y=579, bottom 615 clipped | y=704 below | y=692 below | 579 / 704 / 692 — exact |
  | 1280x800 @150% (853x533) | y=864 below | y=989 below | y=977 below | 864 / 989 / 977 — exact |
  | 1280x800 @200% (640x400) | y=904 below | y=1029 below | y=1018 below | 904 / 1029 / 1018 — exact |
  | 900x700, empty | visible | y=677, bottom 713 clipped | visible | 677 / 713 — exact |

  Every zoom and drawer number matches to the pixel. Two of my own additions:
  **900x600, the app's own minimum**, puts Cut at `665..701` and the Clips column
  at `817..1057` fully below a 600px fold; and **1100x760, the window size the
  app opens at on every first launch**, already clips Cut (`739..775`, 41% of it
  off screen) and puts the whole Clips column at `891..1131`. The finding does
  not mention either, and they are the two sizes that matter most.
- **This is one defect, and H-4 and B-10 are the same one.** The decisive
  experiment (`v5-breakpoint.cjs`, `out/breakpoint.txt`): hold the height at
  620px, near the app's minimum, and sweep the width across the `min-[1160px]`
  breakpoint in `ThreeColumnLayout.tsx:32`:
  ```
  1024x620  wrapped=true   Cut BELOW     Clips column BELOW     Mark bar CLIPPED
  1100x620  wrapped=true   Cut BELOW     Clips column BELOW     Mark bar BELOW
  1159x620  wrapped=true   Cut BELOW     Clips column BELOW     Mark bar BELOW
  1160x620  wrapped=false  Cut visible   Clips column visible   Mark bar visible
  1280x620  wrapped=false  Cut visible   Clips column visible   Mark bar visible
  1440x620  wrapped=false  Cut visible   Clips column visible   Mark bar visible
  ```
  **One pixel of width flips all three findings at once.** And holding the width
  at 1280px and sweeping the height all the way down to the 600px minimum:
  ```
  1280x900 / 800 / 700 / 620 / 600 — wrapped=false, all three visible at every height
  ```
  So it is **not** "the layout does not fit at small heights". At any width at or
  above 1160px, nothing falls off the fold at any height the app permits, even
  with five segments added. Below 1160px the three columns wrap into one tall
  stack inside a single unnamed `div.min-h-0.min-w-0.flex-1` scroller, and the
  height then only decides *how much* is cut off. **One root cause, one fix, in
  `ThreeColumnLayout.tsx`.** The planner should treat H-3 as the defect and H-4
  and B-10 as two more symptoms of it, not budget three changes.
- **Severity**: major stands, but on a different basis than the finding gives.
  Content below the fold is reachable, and there *is* an affordance — the stack
  scroller paints a 15px Chromium scrollbar, so "nothing on screen indicates they
  are there" is not true on this platform (it would be on macOS overlay
  scrollbars). What keeps it at major is that the app's own default window and
  its own minimum window both land in the broken mode, so this is the state every
  user starts in, and at 150%/200% zoom — the state a low-vision user needs — the
  entire mark bar and Cut are gone with no way to get them back except giving up
  the zoom.

---

### H-4 — At 1024px wide and below, the whole Clips (COLLECT) column is below the fold with nothing to say it exists
- **Verdict**: DUPLICATE-OF-H-3
- **Severity**: part of H-3 (major)
- **Runs**: 2 attempts, 2 reproduced
- **What I did**: cold start at 1024x768 and 900x700, empty workspace and video
  loaded, read the rect of `#ui-col-clips` without scrolling.
- **Proof**: `v5-layout.cjs`, `out/layout-run2.txt`:
  ```
  1024x768 empty:  Clips column y=864..1104 in a 768px viewport  FULLY BELOW FOLD
  1024x768 loaded: y=864..1104                                   FULLY BELOW FOLD
   900x700 empty:  y=829..1069 in a 700px viewport                FULLY BELOW FOLD
   900x700 loaded: y=817..1057                                    FULLY BELOW FOLD
  ```
  The container is `div.min-h-0.min-w-0.flex-1` with `aria-label` null, as
  claimed. The 900x700 figure (829) is the finding's exactly; its 1024x768
  figure of **905** is 41px off my 864 in both runs and in both states — a
  harmless discrepancy, since the verdict is "fully below a 768px fold" either way.
- **Why this is not its own defect**: identical trigger, identical fix. The
  breakpoint sweep under H-3 flips the Clips column from BELOW to visible between
  1159px and 1160px of width, in the same step that fixes the mark bar and Cut,
  and it is visible at every height down to 600px once the width clears 1160.
  H-4's own suspected file is `ThreeColumnLayout.tsx:32,50` — the same two lines.

---

### H-5 — The tab close button takes keyboard focus while painted at `opacity: 0`, so the focus ring is never visible
- **Verdict**: DOWNGRADED
- **Severity**: minor (claimed major)
- **Runs**: 2 attempts, 2 reproduced (identical)
- **What I did**: cold start; pressed Tab four times recording each stop;
  focused the close button and read its own and its inherited opacity,
  `:focus-visible`, the computed outline and its tabIndex; then screenshotted its
  own box unfocused and focused and compared the two PNG buffers byte for byte,
  with `#ui-settings` as a control that should change.
- **Proof**: `v5-h5-h6-b9.cjs` (`h5`), output `out/h5.txt`, crops
  `out/h5-1/h5-close-unfocused.png` and `out/h5-1/h5-close-focused.png`:
  ```
  Tab stops 1-4: tab "New tab" | button "Close New tab" | button "New tab" | Campaign chip
  isActiveElement true, matchesFocusVisible true, tabIndex 0
  ownOpacity "0", effectiveOpacity 0, outline "rgb(255,99,99) solid 2px"
  className "... opacity-0 transition-opacity ... group-hover:opacity-100"
  paint changed when focused: false   (control #ui-settings changed: true)
  ```
  Confirmed exactly: it is the **second** Tab stop from a cold start, it takes
  focus, `:focus-visible` matches, the global 2px accent ring is computed — and
  not one pixel of the button's box changes.
- **Why the original was wrong**: severity. This is a real WCAG 2.4.7 failure on
  a destructive control and should be fixed with one
  `focus-visible:opacity-100`. But it is one control, two Tab presses from the
  top, and nothing about the clipping job is broken or unreachable by it; closing
  a tab is also not a data-loss event (the bank and the settings file are
  untouched). Against the stated bar — major means "a core function is wrong or
  badly broken with no workaround" — that is minor.

---

### H-6 — Six places paint a 15px native scrollbar; the design calls for hidden scrollbars and the app has no scrollbar CSS at all
- **Verdict**: DOWNGRADED
- **Severity**: polish (claimed major)
- **Runs**: 2 attempts, 2 reproduced (identical)
- **What I did**: cold start at 1024x768; walked every element in the document,
  kept those that are actually overflowing with `overflow-y: auto|scroll`, and
  measured `offsetWidth − clientWidth − borders` as the gutter; repeated with the
  help drawer open, the symbol palette open, and in a separate cold start with
  the sign-in modal up; checked `document.scrollWidth` against `innerWidth`;
  grepped the whole source tree for scrollbar CSS.
- **Proof**: `v5-h5-h6-b9.cjs` (`h6`), output `out/h6.txt`, screenshots
  `out/h6-1/01-help-drawer.png`, `02-symbol-palette.png`,
  `out/h6-modal-1/01-signin-modal.png`:
  ```
  workspace stack   div.min-h-0.min-w-0.flex-1      gutter 15px  hidden 431px
  help drawer body  div.min-h-0.flex-1.overflow-y-auto gutter 15px hidden  44px
  symbol palette    div.flex.min-h-0.flex-col        gutter 15px  hidden 150px
  sign-in modal     div.max-h-[90vh].w-full.max-w-md gutter 15px  hidden 211px
  all: scrollbar-width auto, scrollbar-gutter auto
  horizontal page scroll: scrollWidth 1024 = innerWidth 1024   (none)
  grep -rn scrollbar src/ index.html tailwind.config.ts  ->  (no hits)
  ```
  I reached four of the finding's six places (I did not open the setup
  checklist or expand the modal's `<details><pre>`); all four measure the
  claimed 15px, and no scrollbar CSS exists anywhere, so the count is sound.
- **Why the original was wrong**: three problems. First, severity: the finding
  itself says "Scrollability itself is fine and must stay that way… this is
  purely the missing hide". Nothing is wrong, unreachable, lost or even hard —
  a platform-standard scrollbar is drawn where a style guide would rather it
  were not. That is the definition of cosmetic, so polish. Second, the premise
  **"the design calls for hidden scrollbars"** cannot be checked here: the
  BUILD-SPEC the source comments cite is not in this repository, so the only
  verifiable half of the finding is "there is no scrollbar CSS and the platform
  draws 15px bars". Mark the design-intent half **not provable here**. Third, a
  consistency problem for the planner: B-9 (same run, same build) is filed as
  major partly *because* the tab strip has "no visible scrollbar", while H-6 is
  filed as major because it has one. They cannot both be right; I measured the
  strip's horizontal bar at 15px, so H-6 has the facts and B-9 does not.

---

## Method notes and limits

- Every case cold starts. `launchApp()` gives each launch its own
  `--user-data-dir`, so no run inherits another's state, and the Electron
  single-instance lock cannot make one script drive another's window.
- Contrast was recomputed from first principles, twice per run and by two
  independent routes (CSS composite and painted pixels), with no reliance on the
  original probe or its JSON.
- Layout was measured only at viewports the app will actually give a user:
  verified by `win.getMinimumSize()` → `[900,600]` and by asking the window for
  400x300 and being handed 900x600. Page zoom at 150%/200% was applied through
  `webContents.setZoomFactor` from the main process — the same path as Ctrl+Plus
  — and the live application menu was read back to confirm the `zoomin` /
  `zoomout` / `resetzoom` roles exist and are enabled in this build.
- **Not provable here**: whether the shipped, packaged build opens at 1100x760
  on each OS and how much of that is window chrome (the measurement above is the
  dev shell under xvfb, where content size equals window size — a real title bar
  makes the fold worse, not better); how a macOS overlay scrollbar renders the
  H-6 and B-9 cases; and what a screen reader actually announces for H-2, as
  opposed to what the DOM and the tab order say.
- Timings were taken with the machine otherwise idle, one Electron instance at a
  time. They are wall-clock from this container and should be read as an order
  of magnitude, not a budget.
