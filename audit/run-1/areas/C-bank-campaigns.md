# Area C — Clip bank, campaigns, categories and tiers

Run 1. Everything below was produced by driving the real Electron app through
`audit/harness/app.cjs` under `xvfb-run`, with the scripted `yt-dlp` stub
(`cwd` = a stub root, video `stub0000001`, duration 1:00:00). Scripts live in
`audit/run-1/area-C/`; their captured output is beside them as
`out-NN-*.txt`, and screenshots under `audit/out/area-C/`.

**Harness note.** No YouTube session can exist in this container, so `App.tsx`
holds the sign-in modal open over the whole window. Area C hides that one
overlay with an injected stylesheet (`lib.cjs`, `boot()`), which touches the
live DOM only. **No product code was changed by this area.**

**17 findings: 1 blocker, 6 major, 8 minor, 2 polish.**

---

### C-1  Two video tabs plus a non-empty clip bank blanks the entire app
- **Severity**: blocker
- **Status**: confirmed
- **Steps**:
  1. Cold start with one campaign and a video loaded.
  2. Put anything in the bank: either seed `clipper.bank` with one row, or
     import one line (`A01 1:00-1:30 hook`) on the Bank tab.
  3. Click **+** (New tab) in the tab strip.
  (Equivalent second route: open the second tab *first*, load a video in it,
  then confirm any import — same result, script `19-two-tabs-import.cjs`.)
- **Expected**: a second video tab opens; the first tab's bank is untouched.
- **Actual**: the window goes blank. `#root` drops to 0 children, the header
  and every control disappear, and the renderer logs
  `Minified React error #185` (maximum update depth exceeded, i.e. an infinite
  render loop). It never recovers — 6 s later `#root` is still empty. The only
  way out is to quit and relaunch the app. Data on disk survives (the bank and
  the imported row are intact after a relaunch), so this is a lost session, not
  lost rows. With an **empty** bank the same click is harmless, which is what
  isolates it to the bank (case A vs cases B/C).
  Mechanism (suspected): both workspace tabs keep a `ClipsColumn` mounted at
  once — proven by two elements with `id="clips-tab-bank"` in the DOM at the
  same time — and each one pushes its own `bankedRanges` into the single module
  store in `useSegments.ts`. One tab has planned ranges, the other has none, so
  the guard `seg.banked.length !== planned.length` in `ClipsColumn`'s effect is
  true for whichever tab ran last, and the two tabs overwrite each other
  forever.
- **Proof**:
  - `audit/run-1/area-C/out-14-newtab.txt` (case A empty bank = fine; case B
    seeded rows = blank; case C rows but the Bank sub-tab never opened = blank)
  - `audit/run-1/area-C/out-19-two-tabs.txt` (two tabs open, crash on confirming
    an import; `how many #clips-tab-bank elements are in the DOM: 2`)
  - `audit/run-1/area-C/out-13-newtab-probe.txt` (`#root` 0 children and the
    React error, still blank 8 s later)
  - screenshots `audit/out/area-C/C14-newtab-B/01-before-new-tab.png` →
    `02-after-new-tab.png` (blank), `audit/out/area-C/C13-newtab/01-after-new-tab.png`
- **Suspected file**: `src/components/ClipsColumn.tsx` (the `setBankedRanges`
  effect, lines ~134–142) with `src/hooks/useSegments.ts` (`setBankedRanges`
  always publishes a new array)

---

### C-2  A deleted campaign's bank survives, and a new campaign with the same name adopts it
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Cold start. Create campaign **Acme Q4** in the header popover.
  2. Load a video, Bank tab, import
     `A01 1:00-1:30 acme hook | hook | T1` and `A02 2:00-2:40 acme payoff | payoff | T2`.
  3. Campaign popover → **Remove** on Acme Q4 → **Confirm**.
  4. Create a new campaign, again named **Acme Q4**. Open the Bank tab on the
     same video.
- **Expected**: removing a campaign disposes of its clip bank; a brand-new
  campaign starts empty.
- **Actual**: after the delete, `clipper.bank` in `settings.json` still holds
  the whole `acme-q4` entry verbatim — the rows are unreachable from the UI but
  kept forever (unbounded growth, and a client's banked list is retained after
  the user believes they deleted it). The campaign id is a slug of the name, so
  the new **Acme Q4** gets id `acme-q4` again and **opens showing the deleted
  campaign's two clips**, with their categories and tiers already in the filter
  chips ("hook", "payoff", Tier 1, Tier 2). Nothing in the UI says these rows
  came from a campaign that was deleted. The Remove button's own tooltip says
  it removes "the campaign and its used-ranges record" and is silent about the
  bank.
- **Proof**: `audit/run-1/area-C/out-09-leak.txt` (`bank after delete:` still
  full; `**FAIL** recreating a campaign with the same name does NOT bring the
  deleted rows back`); screenshots `audit/out/area-C/C09-leak/03-after-delete-acme.png`
  and `04-recreated-acme.png`; script `09-leak-resurrect.cjs`
- **Suspected file**: `src/context/CampaignContext.tsx` (`remove` only calls
  `removeCampaign`), `src/lib/campaigns.ts` (`uniqueId` derives the id from the
  name), `src/lib/bank.ts` (nothing ever drops a campaign's bank)

---

### C-3  Switching campaign with the import box open throws the whole paste away
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Cold start with two campaigns, a video loaded, Bank tab.
  2. **Import timestamps**, paste a block (40 lines in the script; the same
     happens with 5,000).
  3. Without confirming, open the campaign chip and switch to the other
     campaign — for example to check you are in the right one.
  4. Switch back.
- **Expected**: either the paste is kept, or the user is warned before it is
  discarded.
- **Actual**: the importer closes and the pasted text is gone. Coming back to
  the original campaign shows the plain bank view with no textarea and no way
  to recover what was typed. No warning, no draft, no undo. For the user this
  brief describes — several client campaigns a day, constant switching — the
  natural "am I in the right campaign?" check destroys the work in the box.
  (The one upside: an import can never land in the wrong campaign this way,
  because the importer is unmounted on the switch — see Coverage.)
- **Proof**: `audit/run-1/area-C/out-02-order.txt` step E
  (`E. back on Acme: import box still open? no (paste discarded)`);
  `out-15-stories.txt` story 12 (`the paste is GONE`); screenshots
  `audit/out/area-C/C02-order/05-E-mid-import.png` → `07-E-back-on-acme.png`,
  `audit/out/area-C/C15-stories/09-story12-paste-gone.png`
- **Suspected file**: `src/components/ClipsColumn.tsx` (the
  `useEffect(..., [campaignId, vid])` that calls `setImporting(false)`);
  `src/components/ImportTimestamps.tsx` keeps the text in local state only

---

### C-4  A category or tier cannot be set or changed after import
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Import any clip, with or without a category.
  2. On the Bank tab, try to give it a category or change its tier.
- **Expected**: the inventory lists "Categorise / set tier | selection |
  updated rows" as a function of this area.
- **Actual**: there is no control anywhere in the clips column to do it. A
  dump of every interactive element in the column returns exactly:
  `["This video","Bank","All saved","Search the bank","Import timestamps",
  <filter chips>,"Sort by tier","Cut","Remove <id> from the bank", ...]`, and a
  bank row offers only **Cut** and **Remove**. No input, no select, no
  contenteditable. `bankStore.setNote` exists but no component calls it. The
  only route is to re-paste the line with the category written into it — which,
  if the id differs by so much as the `T1-` prefix, adds a second row with the
  same ranges instead of correcting the first (story 9 left both `T1-M01` and
  `M01` on the same 30:00–30:40 range). Keyboard users have no route at all.
- **Proof**: `audit/run-1/area-C/out-11-state.txt`
  (`controls on a bank row: {"buttons":["Cut","Remove OLD1 from the bank"],
  "inputs":[],"editable":0}`), `out-18-a11y.txt`, `out-15-stories.txt` story 9;
  screenshot `audit/out/area-C/C11-state/02-old-shape-bank.png`
- **Suspected file**: `src/components/ClipsColumn.tsx` (`renderRow`)

---

### C-5  Two campaigns can carry the same name, and nothing tells them apart
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Cold start with campaign **Acme Q4**. Create a second campaign,
     **Beta Launch**.
  2. Campaign popover → **Edit Beta Launch** → set the name to `Acme Q4` →
     **Save**.
- **Expected**: a duplicate name is refused, or at least flagged.
- **Actual**: it saves. The popover now lists two rows reading
  `Acme Q4  0:30 to 1:00  Edit  Remove` — identical in every visible respect —
  and the header chip says only "Campaign Acme Q4" whichever is active. The two
  campaigns have separate banks, separate folders and separate used-range
  records, so picking the wrong row silently puts the next import and the next
  cut on the wrong client, with nothing on screen to catch it. `validateCampaign`
  checks for an empty name, identical folders and a missing `{nn}` — never for
  a name already in use. The same applies to **New campaign**.
- **Proof**: `audit/run-1/area-C/out-08-campaigns.txt`
  (`rename to an existing name -> ids/names: [["acme","Acme Q4"],["beta-launch","Acme Q4"]]`);
  screenshot `audit/out/area-C/C08-campaigns/02-duplicate-names.png`
- **Suspected file**: `src/lib/campaigns.ts` (`validateCampaign`),
  `src/components/CampaignMenu.tsx` (the list row shows name + band only)

---

### C-6  A 5,000-row bank makes the list unusable: 1–2 s per search keystroke
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Seed `clipper.bank` with 5,000 rows under the active campaign and video
     (`04-bank-5k.cjs`, `06-search-latency.cjs`), or paste 5,000 lines and
     import them.
  2. Open the Bank tab and type into **Search the bank**.
- **Expected**: typing stays responsive; a list this long is windowed.
- **Actual**: all 5,000 rows are rendered into the DOM at once (measured:
  `rows in DOM: 5000`), with no virtualisation. Every keystroke re-filters and
  re-renders the whole list on the main thread. Measured per keystroke while the
  query still matches everything: **1950 ms, 1014 ms**, then 198/68/50 ms as the
  match set shrinks (the same five keystrokes over a 200-row bank: 144/60/32/34/49 ms).
  Committing the 5,000-row import itself blocks for **5.4–6.1 s**. In the
  import-then-search run, typing the nine characters of `line 4999` — every
  prefix of which matches all 5,000 rows — had still not settled after
  **300 s** and the run was abandoned. The window stays alive; it is simply
  unusable at this size. The filter-chip row is also uncapped (10 chips for 7
  categories + 3 tiers in the test; a real paste with many categories would wall
  the panel).
- **Proof**: `audit/run-1/area-C/out-06-latency.txt` (both bank sizes),
  `out-04-bank5k.txt`, `out-05-huge.txt` (`SEARCH FAILED after 307352 ms`);
  screenshots `audit/out/area-C/C04-bank-5000/01-seeded-bank.png`,
  `audit/out/area-C/C06-latency-5000/01-after-typing.png`
- **Suspected file**: `src/components/ClipsColumn.tsx` (unwindowed `<ul>` of
  `renderRow`, filtering on every change)

---

### C-7  A 5 MB paste with no timestamps renders 85,000 error rows and freezes for ~20 s
- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. Bank tab → **Import timestamps**.
  2. Paste 5 MB of prose with no timestamps in it (85,000 lines — e.g. a
     transcript or a document pasted into the wrong box).
- **Expected**: the app says it understood nothing, quickly, with the error
  list capped.
- **Actual**: the preview takes **19.5 s** to appear, during which the window
  is frozen, and the "lines not understood" panel renders **85,000 `<li>`
  elements** — one per line, each with the line number, the reason and the full
  line text. Nothing is capped or summarised. Cancel then needs another 2.4 s.
  It does survive (no renderer crash, no page error), but a longer paste or a
  slower machine scales linearly from here.
- **Proof**: `audit/run-1/area-C/out-07-5mb-prose.txt`
  (`preview painted: true after 19528 ms`, `error <li> count in DOM: 85000`);
  screenshot `audit/out/area-C/C07-5mb-prose/01-5mb.png`
- **Suspected file**: `src/components/ImportTimestamps.tsx` (`preview.errors.map`
  with no limit), `src/lib/bankImport.ts` (every line produces an error object)

---

### C-8  Identical time ranges are handled in two opposite ways, both silent
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  A. Paste `9:00-9:30 take one` and `9:00-9:30 take two` (no ids) and confirm.
  B. Import `T1-M01 30:00-30:40 the apology`, then later import
     `M01 30:00-30:40 the apology | repentance | T1` (the same range, a
     different id — what a user writes when fixing a category, since C-4 leaves
     no other way).
- **Expected**: one consistent rule, stated on screen.
- **Actual**:
  A. The button promises **"Import 2 clips"** and the preview lists two; the
  bank gets **one** row, labelled "take two" — the second line silently
  overwrote the first. The summary reads "1 added, 1 updated", which never says
  that a *different* clip was replaced.
  B. The opposite: two rows now sit on the same 30:00–30:40 range
  (`T1-M01` and `M01`), with no warning that the range is already banked.
  So a paste that repeats a range loses a row, and a paste that re-states a
  range under another id doubles it.
- **Proof**: `audit/run-1/area-C/out-02-order.txt` step C
  (`button promised: "Import 2 clips" -> stored rows with that range: 1 labels:
  ["take two"]`); `out-15-stories.txt` story 9 and
  `10. rows now: ["S01","S02","T1-M01","M01"]`; screenshot
  `audit/out/area-C/C02-order/03-C-duplicate-ranges.png`
- **Suspected file**: `src/lib/bank.ts` (`importClips` matches by id first,
  else by identical segments)

---

### C-9  Any line ending in a colon becomes a category for every clip below it
- **Severity**: minor
- **Status**: confirmed
- **Steps**: paste a real working doc, e.g.
  ```
  Notes for the editor:
  - use the wide shot
  T1-M01 30:00-30:40 the apology
  TBC 31:00 ish
  T2-M02 33:00-33:50 the laugh
  ```
- **Expected**: a heading is a deliberate thing; prose is not.
- **Actual**: "Notes for the editor:" is read as a heading and becomes the
  **category** of both imported clips. It then appears as a filter chip
  alongside real categories, and because of C-4 there is no way to correct it
  except re-pasting both lines. The two junk lines are correctly reported as
  errors, so the user's eye is on those, not on the category that was invented
  for them.
- **Proof**: `audit/run-1/area-C/out-15-stories.txt` story 5 and story 8
  (`chips: ["Notes for the editor","Tier 1","Tier 2"]`); screenshots
  `audit/out/area-C/C15-stories/05-story5-messy.png`, `07-story8-filter.png`
- **Suspected file**: `src/lib/bankImport.ts` (`headingText`)

---

### C-10  Filter chips are campaign-wide but the list is per video, so dead chips are offered
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. Seed a campaign whose bank holds a clip for video 1 categorised `hook` and
     a clip for video 2 categorised `promo-for-the-other-video`.
  2. Load video 1, open the Bank tab, click the `promo-for-the-other-video` chip.
- **Expected**: the chips offered are the ones that can filter what is on screen.
- **Actual**: chips are collected across every video in the campaign
  (`facets(data, campaignId)`), while the rows are `clipsFor(campaign, video)`.
  The chip is offered and clicking it gives `0 of 1 clips` /
  "No clips match those filters." — a control that can only ever empty the list.
  The same goes for tier chips (`Tier 9` here).
- **Proof**: `audit/run-1/area-C/out-17-facets.txt`; screenshot
  `audit/out/area-C/C17-facets/01-dead-filter-chip.png`
- **Suspected file**: `src/lib/bank.ts` (`facets`), used by
  `src/components/ClipsColumn.tsx`

---

### C-11  A long campaign name is printed in full in the footer and inflates it
- **Severity**: minor
- **Status**: confirmed
- **Steps**: rename a campaign to a 500-character name and look at the window.
- **Expected**: the name is truncated wherever it is shown.
- **Actual**: the header chip truncates correctly ("Q4 brand refresh for a cli…")
  and the campaign popover row truncates ("Q4 brand r…"), but the footer prints
  the whole 500 characters, wrapping to **three lines** and pushing the format
  and folder controls down; the help button is displaced in the header row as
  the chip widens. Nothing is lost, but the window layout visibly breaks.
  (Rename to an empty string is correctly refused with "Give the campaign a
  name."; an emoji-only name is accepted and shown fine.)
- **Proof**: `audit/run-1/area-C/out-08-campaigns.txt`; screenshots
  `audit/out/area-C/C08-campaigns/04-long-name-header.png` (the footer),
  `05-long-name-menu.png`, `03-rename-empty.png`, `06-emoji-name.png`
- **Suspected file**: `src/components/shell/AppFooter.tsx` (the
  "<name> uses" label)

---

### C-12  A bulk import cannot be undone — only one row at a time
- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. With campaign A active, import a block that belongs to campaign B (the
     most common mistake this brief describes).
  2. Notice, and try to take it back out.
- **Expected**: undo the import, or select the rows and remove them together.
- **Actual**: the clips column holds no undo, no "clear", no multi-select and
  no "remove all" — a scan of its buttons for `undo|clear|remove all` returns
  `[]`. Each row must be removed with its own **Remove** button, one click each
  (2 clicks in the story, 300 for a 300-line paste), and every click rewrites
  the whole settings file.
- **Proof**: `audit/run-1/area-C/out-15-stories.txt` story 2
  (`ways to undo the whole import: [] | per-row Remove buttons to click: 2`);
  screenshots `audit/out/area-C/C15-stories/02-story2-wrong-campaign.png`,
  `03-story2-fixed.png`
- **Suspected file**: `src/components/ClipsColumn.tsx`, `src/lib/bank.ts`

---

### C-13  A new campaign silently inherits the previous campaign's clips and data folders
- **Severity**: minor
- **Status**: confirmed
- **Steps**: with **Acme Q4** active (clips `/tmp/clips-acme`), open the
  campaign popover → **New campaign** → name it `Beta Launch` → **Create**.
- **Expected**: a new client's deliverables do not default into the previous
  client's folder.
- **Actual**: the new campaign is created with `clipsDir` and `dataDir` copied
  from the active one — `[{"id":"beta-launch","name":"Beta Launch",
  "clipsDir":"/tmp/clips-acme","dataDir":"/tmp/data-acme"}]` — and the footer
  then reads "Beta Launch uses … Clips clips-acme". The form does show the
  inherited folder basenames before you press Create, so it is visible, but
  nothing marks them as inherited and both clients' clips land in one folder
  until someone notices.
- **Proof**: `audit/run-1/area-C/out-08-campaigns.txt` (`create form folders`,
  `after create, campaigns in state`, `after create, footer`); screenshot
  `audit/out/area-C/C08-campaigns/01-created-beta.png`
- **Suspected file**: `src/context/CampaignContext.tsx` (`create` falls back to
  `defaultsRef.current`), `src/components/CampaignMenu.tsx` (`toDraft`)

---

### C-14  Plain timestamp lists, "83s"/"1m23s" and spreadsheet columns all import nothing
- **Severity**: minor
- **Status**: confirmed
- **Steps**: paste, one at a time, into the import box:
  `0:00 intro / 1:23 the hook / 4:05 the payoff` (a YouTube chapter list),
  `83s`, `1m23s`, `83s-90s`, `1m23s-1m30s`, and `1:00<TAB>1:30<TAB>the hook`
  (two columns out of a spreadsheet).
- **Expected**: the most common shape of "a block of timestamps" imports, or
  the message names the fix for each shape.
- **Actual**: every one of them yields `0 clips` and a disabled
  **Nothing to import**. A range is mandatory, so a chapter list — the thing
  most people already have — must be hand-edited line by line into
  `start - end` before any of it can be banked. The message for a bare time is
  good ("Found a time but no range. Write a start and an end, like 38:43 -
  39:26"); the message for `83s`, `1m23s` and their ranges is the generic "No
  time range found, and it is not a heading (a heading ends with a colon)",
  which does not mention that unit suffixes are not read. A tab-separated
  start/end is reported as "Found a time but no range" even though both times
  are on the line. Accepted and correct: `1:23`, `01:23`, `1:23:45`,
  `00:01:23.456`, bare seconds, CRLF, leading/trailing blank lines, tabs
  between fields, descriptions containing commas, quotes, emoji, RTL text and a
  literal `\n`, `;`-joined segments, out-of-order lines, `0:00-0:10`.
  Correctly refused with a plain reason: `0:00-0:00` (same start and end),
  `2:00-1:00` (end before start), negatives, duplicate ids, and a range past
  the video length.
- **Proof**: `audit/run-1/area-C/out-01-shapes.txt` (39 shapes, each with what
  the app said), `out-15-stories.txt` story 4; screenshot
  `audit/out/area-C/C15-stories/04-story4-chapter-list.png`
- **Suspected file**: `src/lib/bankImport.ts` (`TIME`, `RANGE_FIRST`),
  `src/components/ImportTimestamps.tsx` (the "Accepted shapes" list)

---

### C-15  Focus is dropped to `<body>` when the importer opens and when it is cancelled
- **Severity**: minor
- **Status**: confirmed
- **Steps**: tab to **Import timestamps**, press Enter; then press Cancel.
- **Expected**: focus moves into the importer (the textarea or its heading),
  and returns to the Import button on cancel.
- **Actual**: `document.activeElement` is `BODY` in both cases, so a
  keyboard-only user has to tab in from the top of the document each time. The
  rest of the keyboard path is sound: the Import button is two tabs from the
  top of the clips column, the textarea carries a real label ("Timestamps, one
  clip per line"), and a full import can be completed on the keyboard alone
  (proven — `K01` was typed and confirmed with Tab/Enter only).
- **Proof**: `audit/run-1/area-C/out-18-a11y.txt`
  (`focus right after opening the importer: BODY:`, `focus after Cancel: BODY`),
  `out-11-state.txt` (`keyboard: imported -> [...,"K01"]`); screenshot
  `audit/out/area-C/C11-state/04-keyboard-import.png`
- **Suspected file**: `src/components/ImportTimestamps.tsx`,
  `src/components/ClipsColumn.tsx`

---

### C-16  "1 clips"
- **Severity**: polish
- **Status**: confirmed
- **Steps**: have exactly one clip in the bank and read the count line above
  the list.
- **Expected**: "1 clip" — the importer's own preview gets this right ("1 clip,
  1 segment").
- **Actual**: "1 clips". The filtered form is built the same way ("1 of 4
  clips" in story 7).
- **Proof**: `audit/run-1/area-C/out-18-a11y.txt`
  (`count line with exactly one clip: "1 clips"`); screenshot
  `audit/out/area-C/C18-a11y/01-one-clip-count.png`
- **Suspected file**: `src/components/ClipsColumn.tsx` (the `aria-live` count
  span)

---

### C-17  A bank row is a button containing two more buttons, with no name of its own
- **Severity**: polish
- **Status**: confirmed
- **Steps**: inspect a bank row; tab through the list.
- **Expected**: one control per thing to do, each with its own accessible name.
- **Actual**: the row is `<div role="button" tabindex="0">` with no
  `aria-label`, so its accessible name is the whole row read out —
  "00:01:00 - 00:01:30 | 0:30 | A01 A01 label | hook | T1 | In band | banked |
  Cut | Remove" — and it contains the **Cut** and **Remove** buttons inside it.
  Nested interactive controls inside a control is invalid and makes the row's
  announcement include its own child buttons. (Separately, with two workspace
  tabs open the ids `clips-tab-bank`, `clips-panel` and friends exist twice in
  the document — see C-1's proof.)
- **Proof**: `audit/run-1/area-C/out-18-a11y.txt` (`bank row: {... "role":
  "button","ariaLabel":null,"nestedInteractive":["Cut","Remove A01 from the
  bank"] ...}`, tab order), `out-19-two-tabs.txt` (duplicate ids)
- **Suspected file**: `src/components/ClipsColumn.tsx` (`renderRow`)

---

## User stories run (step 4)

All twelve were driven end to end in the real app;
`15-stories.cjs` / `out-15-stories.txt`, screenshots in
`audit/out/area-C/C15-stories/`. "→" is what actually happened.

1. **Monday, new client.** Creates *Northwind Q1*, pastes the week's list with
   headings and `T1-`/`T2-` ids → 4 clips, categories *Hook moments* /
   *Payoff* / *objection*, tiers 1–3, chips correct. Works.
2. **Imports the next client's list into the wrong campaign, notices, switches,
   re-imports.** → the rows land in Northwind (6 clips), and the only way back
   out is one **Remove** click per row (C-12); re-importing into *Southbay
   Launch* then works cleanly.
3. **Pastes the same list again, unsure it saved.** → "0 added, 2 updated",
   still 2 clips. No duplicates. Works.
4. **Pastes the chapter list from the video description.** → 0 clips, three
   "Found a time but no range" errors (C-14).
5. **Pastes straight out of their working doc**, notes and all. → the two real
   lines import; the two notes are reported as errors; "Notes for the editor:"
   silently becomes the category of both clips (C-9).
6. **Sorts by tier to cut the T1s first.** → T1-M01, T2-M02, then the untiered
   S01/S02 last. Correct.
7. **Searches the bank for the clip promised to the client** ("laugh") →
   "1 of 4 clips", one row. Correct.
8. **Filters by a category chip** → "2 of 4 clips" and exactly 2 rows on
   screen; the count and the list agree.
9. **Realises a clip is mis-categorised and tries to fix it.** → no control
   exists (C-4); re-pasting the line with a corrected id left two rows on the
   same range (C-8).
10. **Deletes a row today, re-imports the same block tomorrow.** → the row
    comes back ("1 added, 1 updated"). Correct.
11. **The client renames the project mid-week.** → *Southbay Launch* →
    *Southbay Spring*; the id stays `southbay-launch`, the bank follows the
    rename, the chip and footer update. Correct.
12. **Switches campaign with a half-typed paste on screen.** → the paste is
    gone (C-3).
13. **Opens the next video in a second tab** (the daily loop) → the app blanks
    (C-1). Run separately in `14-newtab-crash.cjs` / `19-two-tabs-import.cjs`.
14. **End of quarter: deletes the finished campaign, starts it again next
    quarter under the same name** → last quarter's bank is still there (C-2).
    Run in `09-leak-resurrect.cjs`.

## Coverage

Driven in the real app, with evidence, and **passing**:

- **No leakage between campaigns on switching.** Two campaigns created through
  the UI, each with its own imported rows, switched back and forth four times:
  24 assertions on rows, count lines and filter chips, all green — each view
  showed only its own campaign's clips, and the chips carried no other
  campaign's categories or tiers (`out-09-leak.txt`).
- **Import twice is idempotent.** The same block imported twice gives
  "0 added, 3 updated" and three rows, by id or by identical ranges
  (`out-02-order.txt` B).
- **Double-clicking Import does not double-import** (`out-02-order.txt` D).
- **An import cannot land in the wrong campaign by switching mid-flight** — the
  importer is unmounted by the switch (the cost of that is C-3).
- **Import is gated before a video is loaded**: "Paste a link to see this
  video's clips."; with no campaign: "Create a campaign to keep a bank. Banks
  are kept per campaign and per video." (`out-02-order.txt` A).
- **Kill the app mid-import and relaunch.** SIGKILL 0.9 s after confirming a
  5,000-row import → `settings.json` parses, no stray `.tmp`, 0 rows (the
  import had not been committed); SIGKILL at 3 s → 5,000 rows, all present on
  relaunch. All-or-nothing, no half-written bank, no corruption
  (`out-10-interrupt.txt`).
- **Older bank rows upgrade rather than crash.** Rows with no `category`, no
  `tier` and no `status` load and render as "banked"; rows with a non-array
  `segments`, no id, or an end before the start are dropped silently; no page
  errors (`out-11-state.txt`).
- **A malformed `clipper.campaigns`** containing `null`, a bare string, an
  entry with no name, an entry with no id and a duplicate id loads without
  crashing and shows only the two valid campaigns (`out-11-state.txt`,
  `audit/out/area-C/C11-state/01-malformed-campaigns.png`).
- **Rename to an empty string is refused** with "Give the campaign a name.";
  an emoji name and a 500-character name are both accepted and persisted
  (layout aside, C-11).
- **Filter, sort and search are correct**: text search matches id, label,
  category, tier and note; tier sort is numeric with untiered last; the
  filtered count always matched the rows on screen in every case measured.
- **Delete a row, then re-import the same block** → the row returns
  (`out-11-state.txt`, story 10).
- **Counts across screens.** The bank tab's count line is the only numeric
  surface; the setup checklist's "Import a clip bank" item carries no number, so
  there is nothing to disagree. No double counting was seen
  (`out-16-checklist.txt`).
- Input shapes: 39 distinct pastes exercised against the live preview
  (`out-01-shapes.txt`), plus 5,000 lines, 85,000 lines and 5 MB.

## Not provable here

- **Two app windows importing at once.** Electron's single-instance lock is per
  `--user-data-dir` and the harness gives every launch its own, so two windows
  over one settings file cannot be driven here. The in-app equivalent (two
  workspace tabs) was tested and is C-1. The browser-fallback path in
  `persist.ts`/`CampaignContext` (localStorage plus the `focus` re-read for a
  second browser tab) is never taken in the desktop app and was not exercised.
- **Real video durations.** "Past the end of the video" was tested against the
  stub's 1:00:00; real `yt-dlp` metadata is blocked by the network policy.
- **Cutting a banked clip end to end** (Cut → file on disk → status flips to
  cut → ranges recorded) belongs to areas B and D; area C only confirmed that
  the Cut and Mark published controls exist on a row and that `importClips`
  leaves non-banked rows alone.
- **macOS/Windows rendering** of the long-name footer and the campaign chip.
- Anything behind the YouTube sign-in modal in its own right (area A); area C
  hid that overlay to reach the workspace.
