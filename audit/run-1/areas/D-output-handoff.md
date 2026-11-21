# Area D — Output, folders and editor handoff

Everything below was produced by driving the real Electron app through the
harness (`audit/harness/app.cjs`) under `xvfb-run`, with a scriptable `yt-dlp`
stub as `cwd` and real `ffmpeg`/`ffprobe`. Scripts live in
`audit/run-1/area-D/`, screenshots and captured output in
`audit/run-1/area-D/out/`. **No product file was changed.**

## How the area was driven

- **Real clips.** Every clip in these runs was cut by real ffmpeg from
  `audit/fixtures/fixture.mp4` and moved by the product's own `clip:save`
  into a real folder. Example: `audit/run-1/area-D/out/handoff/clips-dir-listing.txt`.
- **Real FCPXML validation.** Every document the app wrote, and every document
  the generator produced for the hostile-input matrix, was checked with
  `xmllint --noout` (well-formedness) and `xmllint --noout --dtdvalid
  FCPXMLv1_10.dtd` (Apple's real FCPXML 1.10 DTD, which also enforces element
  **order** through its content models). 24 documents in
  `audit/run-1/area-D/out/fcpxml/`, 5 more in `.../out/handoff/`.
- **Real clipboard.** Symbol and copy-block assertions read the system
  clipboard back through `navigator.clipboard.readText()` and compare code
  point by code point against the product's own data. Nothing was eyeballed.
- **Pure product modules, unchanged.** Where a matrix was too large to click
  (the FCPXML input matrix, `sameFolder`), `src/lib/fcpxml.ts`,
  `src/lib/symbols.ts` and `src/lib/campaigns.ts` were compiled **unchanged**
  with the repo's own esbuild and executed. No logic was reimplemented.

**Harness substitutions, disclosed.** Two things in the container are not the
product:

1. `dialog.showOpenDialog` is a native modal the driver cannot click (no
   `xdotool` in this container), so it is replaced **inside Electron** with one
   that resolves to a chosen path (`audit/run-1/area-D/31-folders-real.cjs:
   picker`). Everything downstream — `dialog:pickDirectory`,
   `CampaignContext.setClipsDir/setDataDir`, the separation rule, persistence,
   the footer chips and the handoff panel — is the product's own code, driven
   by clicking the product's own buttons.
2. The YouTube gate (area A's modal) has no dismiss, so each run gets past it
   by dropping a synthetic Netscape `cookies.txt` on the window through the
   product's own drop handler (`lib-D.cjs: boot`), and the throwaway stub
   `yt-dlp` prints the `Found YouTube account cookies` marker
   `server/youtubeAuth.ts` keys on. The stub lives only in the scratchpad.

All captured output quoted below is kept in
`audit/run-1/area-D/out/logs/` so the quotes can be checked without re-running
anything.

Findings: **3 blocker, 7 major, 13 minor, 2 polish** (25 in all).

---

### D-1  Dragging a clip out of the window freezes the whole app until it is killed

- **Severity**: blocker
- **Status**: confirmed (Linux; see "Not provable here" for macOS/Windows)
- **Steps**:
  1. `xvfb-run -a node audit/run-1/area-D/70-state-order-drag.cjs` (part 3).
     It boots the app with a campaign and a clips folder, cuts one real clip,
     and waits for the sticky "Clip saved" toast, which carries the
     `DragOutHandle` grip.
  2. Grab the grip with the mouse and drag it out of the toast
     (`mouse.down`, `mouse.move` in 12 steps, `mouse.up`) — the gesture the
     feature exists for.
  3. Immediately call any other bridge method, e.g.
     `window.electronAPI.fileExists("/etc/hostname")`.
  4. Independently: `xvfb-run -a node audit/run-1/area-D/11-startdrag-freeze.cjs`
     sends `file:startDrag` with a path that exists, and
     `... 11-startdrag-freeze.cjs --control` sends one that does not. The two
     runs differ only in that.
- **Expected**: the drag either starts and the app keeps running, or it fails
  and the app keeps running. A grab-and-release that the OS does not turn into
  a drop must leave the app usable.
- **Actual**: the main process stops servicing IPC permanently. In step 3 the
  call never answers (`*** NO ANSWER after 10s ***`). The window stops
  repainting, Playwright can no longer click it, `app.close()` has to be
  abandoned and the process killed. The control run (`--control`, path absent,
  so `electron/main.cjs:600` rejects it before `startDrag`) answers normally
  (`ANSWERED true`), which isolates the cause to the
  `event.sender.startDrag(...)` call itself. The same wedge is reachable from
  the renderer by sending `file:startDrag` with any existing absolute path; it
  is what forced the hostile-IPC script to be split in two
  (`10-ipc-hostile.cjs:207`).
- **Proof**:
  - `audit/run-1/area-D/out/state/silent-failure/02-drag-handle.png` and the
    captured run (final two lines: `real mouse drag: drag gesture completed` /
    `IPC still answers after the drag: *** NO ANSWER after 10s ***`),
    reproduced by `audit/run-1/area-D/70-state-order-drag.cjs`
  - `audit/run-1/area-D/11-startdrag-freeze.cjs` (real vs `--control`),
    screenshots in `out/startdrag/` and `out/startdrag-control/`
- **Suspected file**: `electron/main.cjs:597-613` (`ipcMain.on("file:startDrag")`),
  called from `src/components/DragOutHandle.tsx:43`

---

### D-2  Saving a clip silently overwrites a file of the same name, and still says "Clip saved"

- **Severity**: blocker
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node audit/run-1/area-D/50-save-interruptions.cjs` (part 1).
     Before launch it puts a 48-byte file called `AUD-stub0000001-01.mp4` in
     the clips folder — the name the next clip of this campaign will be given.
  2. Paste the stub video, mark 00:00:02 to 00:00:08, Add segment, Cut as one
     file.
- **Expected**: the earlier file is kept. Area D's own CapCut copy does
  exactly that — `copyFiles` in `electron/editorOpen.cjs:274` runs every
  destination through `uniquePath` and is documented "Never overwrites",
  producing `... 2.mp4`, `... 3.mp4` (proved in
  `audit/run-1/area-D/80-order-unwritable.cjs` part 6). Saving the clip the
  user just paid for should be at least as careful.
- **Actual**: the file is destroyed. The 48-byte file becomes the 981457-byte
  new clip (`still the user's text? false`), and the toast says "Clip saved /
  AUD-stub0000001-01.mp4 / Downloaded at 360p." with no hint that anything was
  replaced. `clip:save` calls `fsp.rename(source, target)` straight onto the
  computed path. The same is true of `file:save` (`fsp.writeFile`) and
  `editor:writeFcpxml` (`fsp.writeFile`).
  This is reachable without any trickery: clip ids are derived from the
  download history (`src/App.tsx: nextClipId` over `downloads`), so removing a
  row from the Downloads list, switching machines, or restoring a settings
  backup re-issues an id whose file is still on disk.
- **Proof**: `audit/run-1/area-D/out/save/01-collision.png`; captured output of
  `audit/run-1/area-D/50-save-interruptions.cjs` part 1 — `the pre-existing
  file is now 981457 bytes`, `probe of what is at that name now:
  {"dur":"30.000000",...}`
- **Suspected file**: `electron/main.cjs:462-500` (`clip:save`)

---

### D-3  The Copy blocks panel never works: all seven blocks are permanently disabled

- **Severity**: blocker
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node audit/run-1/area-D/60-symbols-copyblocks.cjs`
     (COPY BLOCKS section). It boots with an active campaign whose
     `clipIdPattern` is `{prefix}-{videoId}-{nn}`.
  2. Paste the stub video and wait for it to load, mark 00:00:03 to 00:00:09,
     Add segment.
  3. Click the Copy blocks button in the header (`#ui-copy-blocks`).
  4. Try to click each of the seven Copy buttons.
- **Expected**: at least "Source link", "Download ranges" and "Clip id and
  filename" are available — a video is loaded, a segment exists and the
  campaign has a pattern.
- **Actual**: every block is disabled, in every state, and each gives a reason
  that contradicts what is on screen: "1. Source link — No video id found in
  the link.", "5. Download ranges — Add a segment first.", "7. Clip id and
  filename — This campaign has no clip id pattern." The panel is identical
  with nothing loaded. `src/App.tsx:422` renders
  `<CopyBlocks open={copyOpen} onClose={closeCopy} />` with no `input` prop,
  so `CopyBlocks.tsx:37` falls back to `EMPTY = { lines: [], segments: [] }`
  for the life of the app. The component's own header comment says "Phase C
  passes it from App"; it never does. Keyboard users get nothing either: the
  focus call on open (`CopyBlocks.tsx:51`) looks for
  `button[data-copy]:not(:disabled)` and finds none, so focus stays on
  `document.body` (`focus on open was: null`).
  One of the eight functions this area owns does not work at all.
- **Proof**: `audit/run-1/area-D/out/symbols/04-copyblocks-empty.png` and
  `audit/run-1/area-D/out/symbols/05-copyblocks-live.png` (identical content,
  the second with a loaded video, a campaign and a segment); captured block
  list in the run output
- **Suspected file**: `src/App.tsx:422`; `src/components/CopyBlocks.tsx:23,37`

---

### D-4  "After cutting: Send to Final Cut Pro" fails in complete silence

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node audit/run-1/area-D/70-state-order-drag.cjs` (part 3).
     It seeds the campaign's handoff settings with
     `afterCutting: "finalcut"` and
     `fcpLibrary: "/tmp/this-library-does-not-exist.fcpbundle"` — exactly the
     state a user is left in after a library is renamed or an external drive
     is unplugged.
  2. Paste the stub video, mark 00:00:02 to 00:00:08, Add segment, Cut.
- **Expected**: the user is told the send did not happen and why — the same
  plain sentence the panel's own Send button produces: "There is no library at
  … Final Cut would create a new one there, so nothing was sent."
- **Actual**: nothing. The only messages anywhere on screen are "Clip length
  capped at 10 minutes" and "Clip saved". No `.fcpxml` is written, no alert,
  no toast, no entry in the handoff panel (its `status` state belongs to the
  panel component and is only set by the panel's own buttons). The user
  believes the clip went to Final Cut. `src/App.tsx:288` calls
  `void runAfterCutting(editorRef.current, {...}).catch(() => {})` and throws
  the `HandoffOutcome` away, so every failure of the automatic send — missing
  library, unwritable folder, unprobeable file, Final Cut not installed — is
  invisible.
  (The fail-closed part is correct: no stray library was created, see D-PASS-2.)
- **Proof**:
  `audit/run-1/area-D/out/state/silent-failure/01-silent-after-cutting-failure.png`;
  captured output — `EVERY status / alert anywhere on screen: ["Clip length
  capped at 10 minutes", "Clip saved\n…"]`, `files in the clips folder:
  [ 'AUD-stub0000001-01.mp4' ]` (no `.fcpxml`)
- **Suspected file**: `src/App.tsx:286-292`; `src/components/EditorHandoff.tsx:211`

---

### D-5  Cutting another clip replaces the session's editor file with a one-clip version

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node audit/run-1/area-D/40-handoff-e2e.cjs`.
  2. Cut two clips. Open "Hand off to an editor", set Library, set "Event for
     the raw clip" to `Raw clips تجربة`, tick "Also create a project…", set
     "Event for the projects", click **Send all to Final Cut Pro**. The
     document now holds 2 assets, 2 asset-clips and 2 projects.
  3. Set "After cutting" to "Send to Final Cut Pro".
  4. Cut a third clip.
  5. Look at the same file path again.
- **Expected**: the document that was built for the session is not silently
  reduced. Either the new clip is added, or a new file is written beside it.
- **Actual**: the file at `<clips>/Raw clips تجربة.fcpxml` is replaced by a
  document holding **one** asset and **one** project — the clip just cut. The
  filename is derived only from the event name
  (`fcpxml.ts: fcpxmlFilename`), and `writeFcpxml` uses `fsp.writeFile`, which
  truncates. The after-cutting path passes `clips: [clip]` (`src/App.tsx:288`),
  not the session batch, so "Send all" work is overwritten by a single-clip
  send the user never asked to replace it.
  `audit/run-1/area-D/95-user-stories.cjs` keeps the before/after copies side
  by side for the same scenario.
- **Proof**: `audit/run-1/area-D/out/handoff/E-Raw clips تجربة.fcpxml`
  (2 assets, 2 projects) vs `audit/run-1/area-D/out/handoff/J-Raw clips تجربة.fcpxml`
  (1 asset, 1 project) — both copied from the one path the app wrote;
  `audit/run-1/area-D/out/handoff/09-after-cutting-finalcut.png`
- **Suspected file**: `src/App.tsx:286-292`; `electron/editorOpen.cjs:224-239`
  (`writeFcpxml`, no collision policy); `src/lib/fcpxml.ts:765` (filename
  depends only on the event name)

---

### D-6  `file:save` writes to any absolute path: it overwrote a file outside the chosen folder

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node audit/run-1/area-D/10-ipc-hostile.cjs`. It builds a
     sandbox with `chosen/` (the folder the app is configured with),
     `outside/` and `home-canary/.bashrc` containing `original`, snapshots
     every path, then makes 100 hostile bridge calls from the renderer and
     diffs the tree.
  2. The call that matters:
     `window.electronAPI.saveFile({ dirPath: "<sandbox>/home-canary",
     filename: ".bashrc", data: "PWNED" })`.
- **Expected**: a write that is not inside the folder the user chose is
  refused, the way `export:save` refuses one ("Unexpected export location",
  `electron/exportSave.cjs:62-68`).
- **Actual**: `{"ok":true,"path":"<sandbox>/home-canary/.bashrc"}` and the
  canary file now reads `PWNED`. `file:save` type-checks `dirPath` and
  `filename` and then does `path.join(dirPath, filename)` with no containment
  at all, so renderer code can write anywhere the user can write, under any
  name, including dotfiles. `file:saveFiles` and `editor:writeFcpxml` are the
  same (D-7, D-12). Filename traversal *is* handled —
  `filename: "../../outside/pwned-save.txt"` landed as
  `chosen/.._.._outside_pwned-save.txt` — so the gap is `dirPath`, which is
  never checked against anything.
- **Proof**: `audit/run-1/area-D/out/ipc/fs-diff.json`
  (`"homeCanaryBashrc": "PWNED"`, `createdOutsideChosen` lists
  `outside/pwned-abs.txt`, `outside/pwned-fcp.fcpxml`, `outside/sf/pwned-sf.csv`,
  `esc.csv`, `made/up/deep/made.fcpxml`, `copy/made/up/hostname`);
  `audit/run-1/area-D/out/ipc/ipc-results.json`
- **Suspected file**: `electron/main.cjs:502-522` (`file:save`)

---

### D-7  `file:saveFiles` with `folder: ".."` writes outside the chosen folder and reports success

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node audit/run-1/area-D/10-ipc-hostile.cjs`.
  2. `window.electronAPI.saveFiles({ dirPath: "<sandbox>/chosen",
     folder: "..", files: [{ name: "esc.csv", contents: "x" }] })`.
- **Expected**: refused, or the `..` neutralised the way the slashes are.
- **Actual**: `{"ok":true,"path":"<sandbox>"}` and `esc.csv` appears in the
  **parent** of the chosen folder. `payload.folder.replace(/[\\/]/g, "_")`
  strips separators but leaves `..` intact, and `path.join` then resolves it
  upward. `folder: "../outside"` is contained (it becomes `.._outside`), so it
  is specifically the bare `..` (and `../..`, `..` repeated) that escapes.
  `electron/exportSave.cjs:41` has the identical line, so `export:save` has
  the same hole behind its temp-dir check.
- **Proof**: `audit/run-1/area-D/out/ipc/fs-diff.json` (`createdOutsideChosen`
  contains `<sandbox>/esc.csv`); `ipc-results.json`
  (`file:saveFiles folder=dotdot -> {"ok":true,"path":"<sandbox>"}`)
- **Suspected file**: `electron/main.cjs:525-554`; `electron/exportSave.cjs:41`

---

### D-8  With no campaign selected, the whole handoff panel is inert and says nothing

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node audit/run-1/area-D/70-state-order-drag.cjs` (part 2).
     It boots with a clips folder and **no** campaign, which is the state of
     every fresh install until a campaign is created.
  2. Expand "Hand off to an editor".
  3. Type `/tmp/Some Library.fcpbundle` into **Library**.
  4. Choose "Send to Final Cut Pro" in **After cutting**.
  5. Tick "Also create a project with the clip on its timeline".
- **Expected**: either the settings are kept, or the panel says they belong to
  a campaign and offers to make one.
- **Actual**: every control silently refuses to change. The Library field reads
  back `""`, the select snaps back to `nothing`, the checkbox stays unchecked,
  "Event for the projects" never appears, the summary row still says "After
  cutting: Nothing", and nothing is persisted (`clipper.editorHandoff` is
  `undefined`). No message, no disabled state, no explanation — the panel looks
  live and does nothing. `src/App.tsx:70-79`: `setSettings` returns
  immediately when `campaignId` is null.
- **Proof**: `audit/run-1/area-D/out/state/no-campaign/01-no-campaign-fields.png`;
  captured output — `Library field value after typing: ""`,
  `After cutting select value after choosing finalcut: nothing`,
  `persisted editorHandoff: undefined`, `checked now: false`
- **Suspected file**: `src/App.tsx:61-80`; `src/components/EditorHandoff.tsx:284`

---

### D-9  One clip shorter than a timeline frame throws away the whole batch

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-D/25-batch-abort.cjs` — it runs the product's own
     `src/lib/fcpxml.ts`, compiled unchanged, against real `ffprobe` output
     from real files.
  2. Case A: three good clips plus one whose file cannot be probed
     (a 0-byte `.mp4`), with "create a project" on.
  3. Case B: the same three good clips plus one real file whose duration
     (0.001s at 1000 fps) is shorter than one frame of the 30 fps project
     timeline, with "create a project" on.
  4. Case C: case B with "create a project" off.
- **Expected**: case B behaves like case A — the bad clip is listed as left
  out, with a reason, and the good clips are exported.
  `buildSessionFcpxml`'s own contract says "A clip whose file cannot be probed
  is reported and left out; it never aborts the rest."
- **Actual**:
  - A: `included: 3   projects: 3   skipped: M-BROKEN` — correct.
  - B: throws `M-SUBFRAME: the file is shorter than one timeline frame`. No
    document is written at all; three ready clips are lost; the message names
    only the bad clip and never says the others were fine.
    `buildFcpxml` throws from inside `clips.forEach` (`fcpxml.ts:671,702`) and
    `buildSessionFcpxml`'s `try` only wraps the probe loop (`fcpxml.ts:834-844`).
  - C: the same clip is **accepted** and the document is DTD-valid, so the two
    code paths disagree about whether it is usable.
  In the app this surfaces as the Send button producing a one-line error and no
  file (see `audit/run-1/area-D/out/handoff/04-library-missing.png` for the
  same shape of refusal).
- **Proof**: captured output of `audit/run-1/area-D/25-batch-abort.cjs`;
  `audit/run-1/area-D/out/batch/C-subframe-media-only.fcpxml` (the same clip,
  accepted, `DTD: OK`)
- **Suspected file**: `src/lib/fcpxml.ts:671, 702, 832-848`

---

### D-10  Losing the target folder mid-download surfaces a raw Node stack trace

- **Severity**: major
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node audit/run-1/area-D/50-save-interruptions.cjs` (part 3).
     The stub is set to stall 4s so the download is genuinely in flight.
  2. Mark 00:00:20 to 00:00:26, Add segment, Cut.
  3. While it runs, delete the clips folder (an unplugged drive, a sync client
     moving a folder, a user tidying up).
- **Expected**: a plain sentence naming the folder and one next step, e.g.
  "The clips folder is no longer there. Choose a folder and cut again." The
  cut media is still in the temp directory, so the message could also say the
  work is not lost.
- **Actual** (verbatim, in a `role="alert"` next to a "Copy diagnostics"
  button):
  ```
  Error: ENOENT: no such file or directory, rename '/tmp/ytclip-5a5a59a06aea98f3/clip.mp4' -> '/tmp/D-save-t3cSOG/Clips/AUD-stub0000001-02.mp4' | at async Object.rename (node:internal/fs/promises:782:10) | at async /home/user/stream-trimmer/electron/main.cjs:486:9 | at async WebContents.<anonymous> (node:electron/js2c/browser_init:2:87023)
  ```
  No folder is recreated, no next step is offered, and the temp folder is left
  behind (`fsp.rm` of the temp dir is after the failing `rename`, so it never
  runs) with no way in the UI to recover the file.
- **Proof**: `audit/run-1/area-D/out/save/02-folder-deleted.png`; captured
  output of part 3
- **Suspected file**: `electron/main.cjs:462-499` (`clip:save` returns
  `logger.describe(err)` to the UI)

---

### D-11  The removed Premiere path is still live in the main process

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node audit/run-1/area-D/10-ipc-hostile.cjs`.
  2. `window.electronAPI.editor.openWith({ app: "premiere" })`.
  3. `window.electronAPI.editor.installed()`.
- **Expected**: `premiere` is not a key this module knows, because Premiere
  cannot import `.fcpxml` without a paid converter — which is why the feature
  was removed. `src/lib/fcpxml.ts:31` dropped it from `AfterCutting`, the
  renderer's `EditorBridge.openWith` type only allows `"finalcut" | "capcut"`,
  and `normalizeEditorSettings` maps a stored `"premiere"` back to `"nothing"`
  (verified: `audit/run-1/area-D/70-state-order-drag.cjs` part 1 seeds
  `afterCutting: "premiere"` and the panel reads back `nothing`).
- **Actual**: the main process still carries the whole Premiere launcher.
  `APPS.premiere` in `electron/editorOpen.cjs:29-34` keeps the label, the
  `.app` matcher and the versioned-folder search; `openWith({app:"premiere"})`
  is accepted and answers `"Opening Adobe Premiere Pro from here is macOS
  only."` — on macOS it would run `open -a "<...>/Adobe Premiere Pro
  2025.app" <file>.fcpxml`, which is the failure the removal was meant to
  prevent; and `installed()` still reports a `premiere` flag
  (`{"finalcut":false,"premiere":false,"capcut":false}`) which
  `EditorHandoff.tsx:283` still types and stores. Dead code that is still
  reachable from the renderer.
- **Proof**: `audit/run-1/area-D/out/ipc/ipc-results.json` —
  `editor:openWith app=premiere -> {"ok":false,"error":"Opening Adobe Premiere
  Pro from here is macOS only."}`, `editor:installed -> {"ok":true,"apps":
  {"finalcut":false,"premiere":false,"capcut":false}}`
- **Suspected file**: `electron/editorOpen.cjs:24-39, 79-85`;
  `src/components/EditorHandoff.tsx:39, 283`

---

### D-12  `editor:writeFcpxml` and `editor:copyFiles` create directory trees anywhere and copy any readable file

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node audit/run-1/area-D/10-ipc-hostile.cjs`.
  2. `editor.writeFcpxml({ dirPath: "<sandbox>/made/up/deep", filename:
     "made", contents: "<?xml …" })`.
  3. `editor.copyFiles({ dirPath: "<sandbox>/copy/made/up",
     files: ["/etc/hostname"] })`.
- **Expected**: both are told which folder the user chose, so an absolute path
  outside it should be refused rather than created.
- **Actual**: both succeed and both `mkdir -p` their way into existence
  (`editorOpen.cjs:233`, `:262`). `copyFiles` will copy any absolute file the
  process can read, including files that are not media (`/etc/hostname` was
  copied into three different folders in the run). Both check only
  `path.isAbsolute`.
- **Proof**: `audit/run-1/area-D/out/ipc/fs-diff.json` — `createdOutsideChosen`
  includes `made/up/deep/made.fcpxml` and `copy/made/up/hostname`;
  `ipc-results.json`
- **Suspected file**: `electron/editorOpen.cjs:224-239, 254-283`

---

### D-13  `APPS[app]` is an unguarded property lookup, and an array is accepted where a string is expected

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node audit/run-1/area-D/10-ipc-hostile.cjs`.
  2. `editor.openWith({ app: "__proto__" })`, `{ app: "constructor" }`,
     `{ app: "toString" }`, `{ app: ["finalcut"] }`.
- **Expected**: all four are "That editor is not one this app can open." —
  the answer `{app: 1}` and `{app: null}` correctly get.
- **Actual**: `__proto__`, `constructor` and `toString` all resolve to
  something truthy on `Object.prototype`, so the guard at
  `editorOpen.cjs:100` passes and the error reads "Opening **undefined** from
  here is macOS only." On macOS execution continues into `findApp`, where
  `app.match(name)` is not a function; the `guard` wrapper catches it, so the
  user gets a raw `TypeError` string instead of a sentence. `{app:
  ["finalcut"]}` is accepted outright, because `APPS[["finalcut"]]` coerces the
  array to the string `"finalcut"` — the reply is "Opening Final Cut Pro …", so
  an array drives a real launch.
- **Proof**: `audit/run-1/area-D/out/ipc/ipc-results.json` — the four
  `editor:openWith app=…` rows
- **Suspected file**: `electron/editorOpen.cjs:99-101, 59-61`

---

### D-14  Two pairs of symbols share one accessible name and one tooltip

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node audit/run-1/area-D/61-symbols-exact.cjs`.
  2. Open the symbol palette and list every chip's `aria-label`.
- **Expected**: each chip is distinguishable. One copies the ligature ﷺ
  (U+FDFA), the other copies the transliteration `sallallahu alayhi wa
  sallam`; a screen-reader user and a tooltip reader must be able to tell
  which is which.
- **Actual**: two names are used twice —
  `[["Copy Sallallahu alayhi wa sallam", 2], ["Copy Jalla jalaluhu", 2]]`.
  `SYMBOL_GROUPS` gives `glyph(0xFDFA, "Sallallahu alayhi wa sallam", …)` and
  `txt("sallallahu alayhi wa sallam", "Sallallahu alayhi wa sallam", …)` the
  same `name`, and `SymbolPalette.tsx:245,244` uses `name` for both
  `aria-label` and `title`. In the Recent row the two are side by side with
  identical labels. This is what made the first byte-exact pass
  (`60-symbols-copyblocks.cjs`) report two false mismatches: selecting by
  accessible name cannot address the right chip.
- **Proof**: `audit/run-1/area-D/out/symbols-exact/exact-diff.json`
  (`duplicateNames`); `audit/run-1/area-D/out/symbols/symbol-clipboard-diff.json`
  (the two false mismatches the ambiguity produced);
  `audit/run-1/area-D/out/symbols-exact/01-recent-row.png`
- **Suspected file**: `src/lib/symbols.ts:57, 58, 72, 75`;
  `src/components/SymbolPalette.tsx:244-245`

---

### D-15  The clips/data separation check is a string compare, so the same folder can be set as both

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-D/25-batch-abort.cjs` (part D) runs the product's
     own `sameFolder` from `src/lib/campaigns.ts`, compiled unchanged.
  2. `xvfb-run -a node audit/run-1/area-D/31-folders-real.cjs` (parts 3-5)
     then does it through the real footer chips: choose the clips folder, then
     point the data folder at the same directory written three other ways — a
     symlink to it, `<clips>/.`, and `<clips>/../<clips>`.
- **Expected**: all four are refused with "Clips and Data need different
  folders.", because keeping the two apart is the whole point of having two
  settings.
- **Actual**: only the byte-identical path is caught.
  `sameFolder("/a/b", "/a/b/.")`, `sameFolder("/a/b", "/a/c/../b")`,
  `sameFolder("/a/b", "//a//b")` and `sameFolder("/tmp/x", "/tmp/x/../x")` all
  return `false`, and a symlink is not resolved either, so the app accepts them
  and both settings end up pointing at one directory on disk. `sameFolder`
  lower-cases and trims a trailing slash and compares strings; it never
  normalises or calls `realpath`.
  Confirmed in the running app, not just at module level: picking
  `<root>/LinkToClips` (a symlink to the clips folder) as the data folder gave
  `alerts: []` and left both settings resolving to one directory
  (`clips and data now resolve to the same directory: true`); picking
  `<clips>/.` did the same. The byte-identical path, picked immediately before
  and after, was correctly refused, which isolates the cause.
- **Proof**: `audit/run-1/area-D/out/logs/batch-abort.log` part D;
  `audit/run-1/area-D/out/logs/foldersreal.log` parts 3-5;
  `audit/run-1/area-D/out/folders/05-data-symlink.png`,
  `audit/run-1/area-D/out/folders/06-data-dot-paths.png`
- **Suspected file**: `src/lib/campaigns.ts:92`; used by
  `src/context/CampaignContext.tsx:209, 223`

---

### D-16  An empty token leaves a dangling separator in the middle of a project name

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node audit/run-1/area-D/40-handoff-e2e.cjs` (step E).
  2. Set the project name pattern to `{clipId} - {label} - {campaign}` and
     send. The clips have no label, which is the default (`afterSaved` in
     `src/App.tsx` passes `label: undefined`).
- **Expected**: `AUD-stub0000001-01 - Audit D`. `projectNameFor` already
  strips dangling separators and its comment says so ("An empty token leaves
  its separator dangling ('M-01 -'); trim those ends").
- **Actual**: the project Final Cut will show is
  `AUD-stub0000001-01 - - Audit D`. The cleanup regex is anchored
  (`/^[\s\-:|,]+|[\s\-:|,]+$/g`), so it only fixes the ends, never an empty
  token in the middle. The panel's own live preview shows the same thing
  ("Now: AUD-stub0000001-01 - - Audit D, …"), so it is visible before sending
  but never corrected.
- **Proof**: `audit/run-1/area-D/out/handoff/E-Raw clips تجربة.fcpxml`
  (`<project name="AUD-stub0000001-01 - - Audit D">`);
  `audit/run-1/area-D/out/handoff/05-full-settings.png`
- **Suspected file**: `src/lib/fcpxml.ts:558-563`

---

### D-17  Changing the event name leaves the previous editor file orphaned in the clips folder

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node audit/run-1/area-D/40-handoff-e2e.cjs`.
  2. Export FCPXML with the event name coming from the campaign — the file is
     `Audit D.fcpxml`.
  3. Type `Raw clips تجربة` into "Event for the raw clip" and send again.
- **Expected**: one current document, or some signal about which is which.
- **Actual**: two files sit side by side in the clips folder, `Audit
  D.fcpxml` (2 clips, no library, no projects) and `Raw clips تجربة.fcpxml`
  (2 clips, library, 2 projects). Nothing marks the first as stale, the status
  line never mentions it, and both are valid FCPXML, so importing the wrong
  one puts clips in the wrong library with no projects. The clips folder is
  also the delivery folder, so the stale file sits among the clips.
- **Proof**: `audit/run-1/area-D/out/handoff/clips-dir-listing.txt`;
  `audit/run-1/area-D/out/handoff/B-Audit D.fcpxml` vs
  `E-Raw clips تجربة.fcpxml`; captured output `total .fcpxml files now: [
  'Audit D.fcpxml', 'Raw clips تجربة.fcpxml' ]`
- **Suspected file**: `src/lib/fcpxml.ts:765` (`fcpxmlFilename`);
  `src/components/EditorHandoff.tsx:179-183`

---

### D-18  The drag-out handle cannot be reached from the keyboard

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node audit/run-1/area-D/70-state-order-drag.cjs` (part 3).
  2. Cut a clip so the saved toast appears, then inspect the grip.
- **Expected**: either the grip is focusable with a keyboard route to the same
  outcome, or it is marked `aria-hidden` and not announced at all, since it
  advertises itself as a button.
- **Actual**: it has `role="button"` and
  `aria-label="Drag AUD-stub0000001-01.mp4 to another app"` but
  `tabIndex={-1}`, so it is announced as an actionable button that keyboard
  users can never reach or operate. There is a workaround (the toast's "Open
  folder", and "Copy file path" in the handoff panel), which is why this is
  minor rather than major.
- **Proof**: `audit/run-1/area-D/out/state/silent-failure/02-drag-handle.png`;
  captured output — `tabindex: -1`, `reachable by keyboard (tabindex -1 means
  no): false`
- **Suspected file**: `src/components/DragOutHandle.tsx:52-56`

---

### D-19  Raw errno text is shown to the user by the editor handlers

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node audit/run-1/area-D/80-order-unwritable.cjs` (parts 1
     and 5). A folder setting that points at a plain file is the realistic
     case — a user picks a file, or a folder is replaced by a file of the same
     name by a sync client.
  2. `editor.writeFcpxml({ dirPath: "<a plain file>", … })` and
     `editor.copyFiles({ dirPath: "<a plain file>", … })`.
- **Expected**: "That is a file, not a folder. Choose a folder." The module's
  own header promises "Every failure returns { ok:false, error } in plain
  words".
- **Actual**:
  `Could not save the editor file in /tmp/…/this-is-a-file: EEXIST: file
  already exists, mkdir '/tmp/…/this-is-a-file'` and
  `The drop folder cannot be used (/tmp/…/this-is-a-file): EEXIST: file
  already exists, mkdir '/tmp/…/this-is-a-file'`. The errno and the syscall
  are passed through to the panel's alert. `editor:pathExists` already answers
  `{"ok":true,"exists":true,"isDirectory":false}` for this path, so the
  information needed for a plain message is available.
- **Proof**: captured output of `audit/run-1/area-D/80-order-unwritable.cjs`
  parts 1 and 5
- **Suspected file**: `electron/editorOpen.cjs:236-238, 263-265`

---

### D-20  `file:showInFolder` reports success even when nothing was revealed

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node audit/run-1/area-D/10-ipc-hostile.cjs`.
  2. `window.electronAPI.showInFolder("/etc/shadow")` and
     `showInFolder("A".repeat(2*1024*1024))`.
- **Expected**: `{ok:false, error}` when the reveal did not happen — which is
  what the sibling `editor:reveal` does correctly ("Nothing is at …. It may
  have been moved, renamed or on an unmounted drive.", confirmed in
  `70-state-order-drag.cjs`).
- **Actual**: both return `{"ok":true}`. The main process logged the failure at
  the same moment (`ERROR:platform_util_linux.cc(187)] Failed to open
  AAAAAAAA…`, plus `Error calling OpenDirectory` for the earlier call), so the
  handler is returning `ok` for a call it knows nothing about:
  `shell.showItemInFolder` returns `void` and the handler reports success as
  long as it did not throw. The user is told the folder opened when it did not.
- **Proof**: `audit/run-1/area-D/out/ipc/ipc-results.json` (the two
  `file:showInFolder` rows); `audit/run-1/area-D/out/ipc/logs.json` (the
  matching `platform_util_linux` errors)
- **Suspected file**: `electron/main.cjs:615-630`

---

### D-21  The data folder is set for the user and marked confirmed without ever asking

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node audit/run-1/area-D/31-folders-real.cjs` (parts 1-2).
     It boots a campaign with both folders empty — a fresh install.
  2. Click the footer's **Clips** chip and choose a folder.
  3. Click the footer's **Data** chip.
- **Expected**: the Data chip shows the "Confirm" state the code is built for
  — `DataChip` in `AppFooter.tsx:133-184` has a whole popover ("Exported
  channel data will save to this folder, kept apart from your clips." /
  "Choose another" / "Use folder"), and `DestinationSelector.tsx:45-54` has
  the matching "Suggested. Kept apart from your clips." / "Use folder" row.
  The brief for this area is that the two folders are kept deliberately
  separate, so the suggested one should be shown and accepted.
- **Actual**: choosing the clips folder silently also sets
  `clipper.dataDir` to a sibling `channel-data` directory **that does not
  exist on disk**, and `clipper.dataDirConfirmed` is already `true`, so the
  confirm step never renders: the chip reads "Data channel-data" with no
  "Confirm", and clicking it opens the directory picker instead of the
  popover. `CampaignContext.tsx:106` defaults the flag to `true`
  (`readSetting(KEY_DATA_OK, true) !== false`) and `setClipsDir` then persists
  `dataDirConfirmed: true` unchanged. Both confirm UIs are unreachable on a
  fresh install, and the user is never told where their channel exports will
  go.
- **Proof**: `audit/run-1/area-D/out/folders/02-clips-chosen.png` and
  `03-data-suggested.png`; `audit/run-1/area-D/out/logs/foldersreal.log` —
  `"dataDir": "<root>/channel-data", "confirmed": true`,
  `does the suggested data folder exist on disk? false`,
  `confirm popover: <none>`
- **Suspected file**: `src/context/CampaignContext.tsx:106, 204-215`;
  `src/components/shell/AppFooter.tsx:122-131`

---

### D-24  A folder that is a file, or that does not exist, is accepted as the clips folder with no warning

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node audit/run-1/area-D/31-folders-real.cjs` (part 6).
  2. Click the footer's **Clips** chip and return `<root>/a-plain-file.txt`
     (a regular file).
  3. Do it again with `<root>/no-such-folder/deep`, which does not exist.
- **Expected**: refused at the point of choosing, with a sentence, the way
  "Clips and Data need different folders." is produced for the other invalid
  pick. The information is available: `editor:pathExists` already answers
  `{"ok":true,"exists":true,"isDirectory":false}` for a file and
  `{"exists":false}` for a missing path.
- **Actual**: both are accepted silently. The footer shows "Clips
  a-plain-file.txt" and "Clips deep", `clipper.clipsDir` is persisted, no alert
  appears, and the campaign record is updated. The failure surfaces only much
  later, when the next cut dies with a raw errno message (D-10, D-19) or when
  the editor file cannot be written. `setClipsDir` checks only that the path
  differs from the data folder; it never stats it.
- **Proof**: `audit/run-1/area-D/out/folders/07-odd-paths.png`;
  `audit/run-1/area-D/out/logs/foldersreal.log` part 6 — `alerts: []`,
  `clipsDir now "/tmp/…/a-plain-file.txt"`
- **Suspected file**: `src/context/CampaignContext.tsx:204-215, 231-234`

---

### D-25  `clipper.saveDirs` collects every bad path ever picked, and the same folder twice

- **Severity**: minor
- **Status**: confirmed
- **Steps**:
  1. `xvfb-run -a node audit/run-1/area-D/31-folders-real.cjs` — it picks, in
     order, a good folder, a plain file, a path that does not exist, the same
     second folder with a trailing slash, and then without one.
  2. Read `clipper.saveDirs` from the settings store.
- **Expected**: a list of folders the user can sensibly return to. The key
  exists so the saved-locations list and its nicknames
  (`clipper.saveDirNames`) mean something.
- **Actual**:
  ```
  "saveDirs": [ "<root>/Clips", "<root>/a-plain-file.txt",
                "<root>/no-such-folder/deep", "<root>/Other Clips/",
                "<root>/Other Clips" ]
  ```
  Five entries for two usable folders: a file, a path that does not exist, and
  `Other Clips` twice because the trailing slash is kept verbatim and compared
  as a string. The inventory lists this key as unbounded and growing with use;
  it grows with junk. Nothing in the UI prunes it.
- **Proof**: `audit/run-1/area-D/out/logs/foldersreal.log`, the final
  `state at the end` block
- **Suspected file**: `src/context/CampaignContext.tsx` (`saveDefaults`);
  `src/lib/downloads.ts:64-71`

---

### D-22  Every folder picker is titled "Choose download folder"

- **Severity**: polish
- **Status**: likely
- **Steps**:
  1. Expand "Hand off to an editor" and click **Choose** next to **Library**.
  2. Click **Choose** next to the CapCut drop folder.
  3. Click the footer's **Data** chip.
- **Expected**: titles that say what is being chosen — a Final Cut library, a
  CapCut drop folder, the channel-data folder.
- **Actual**: there is one handler, `dialog:pickDirectory`, with
  `title: "Choose download folder"` hard-coded, and all five call sites use it
  (`EditorHandoff.tsx:350, 423`, `CampaignContext.tsx:231, 236`). Choosing a
  Final Cut **library** through a dialog labelled "download folder" is the
  worst of them, and the library field also wants a `.fcpbundle` package
  rather than a plain folder.
- **Proof**: not proven by evidence — the native dialog cannot be opened or
  photographed in this container (no window manager, no `xdotool`), so this is
  read off the single handler and its call sites and labelled **likely**.
  `audit/run-1/area-D/31-folders-real.cjs` replaces the dialog rather than
  showing it.
- **Suspected file**: `electron/main.cjs:449-456`

---

### D-23  Every generated document is mis-indented around `<note>`

- **Severity**: polish
- **Status**: confirmed
- **Steps**:
  1. `node audit/run-1/area-D/20-fcpxml-matrix.cjs`, or any send in
     `40-handoff-e2e.cjs`.
  2. Open the written `.fcpxml`.
- **Expected**: consistent indentation; the file is something a user opens in
  a text editor when an import misbehaves.
- **Actual**: `<asset-clip>` sits at 2 spaces while its `<note>` child is at 8
  and the closing `</asset-clip>` at 6; inside a project the whole
  `<sequence>`/`<spine>` block is two spaces too deep. `buildFcpxml` builds
  the event lines at one indent and then does `events.map((l) => l.slice(2))`
  (`fcpxml.ts:758`), which only strips two characters from the **first** line
  of each multi-line string. Harmless to Final Cut (every document is
  DTD-valid) but it looks broken.
- **Proof**: `audit/run-1/area-D/out/handoff/E-Raw clips تجربة.fcpxml`;
  `audit/run-1/area-D/out/fcpxml/07-library-event-project-second-event.fcpxml`
- **Suspected file**: `src/lib/fcpxml.ts:726-761`

---

## What works, with evidence

Recorded because the area's highest-risk mechanisms were specifically
suspected and they hold up.

- **D-PASS-1 — the `<library location>` bug is really fixed.** Every document
  the app wrote aims the import with
  `<import-options><option key="library location" value="file://…"/></import-options>`
  as the first child of `<fcpxml>`, and `count(//library)` is `0` in all of
  them — the export-only attribute is gone. Path encoding survives spaces,
  Arabic and emoji:
  `file:///tmp/…/Client%20Library%20%D8%AA%D8%AC%D8%B1%D8%A8%D8%A9.fcpbundle`.
  Proof: `out/handoff/E-Raw clips تجربة.fcpxml`, `out/fcpxml/05a-spaces-unicode.fcpxml`.
- **D-PASS-2 — a library that is not there fails closed.** A non-existent
  `.fcpbundle`, a path that is a file, a 300-character path and a path
  containing `..` are all refused with "There is no library at …. Final Cut
  would create a new one there, so nothing was sent."; a relative path is
  refused earlier with "Use the full path of the library, starting with /.";
  with no `pathExists` bridge at all the send is refused rather than guessed.
  **No stray library was created in any run**, including the silent
  after-cutting case (D-4). Proof: `out/handoff/04-library-missing.png`, the
  LIBRARY PATHS section of `20-fcpxml-matrix.cjs`, and
  `70-state-order-drag.cjs` part 3 (`was a library created at the bad path?
  false`).
- **D-PASS-3 — the FCPXML is valid, including element order.** 29 documents
  validated against Apple's FCPXML 1.10 DTD with
  `xmllint --dtdvalid`: one segment, several segments, several clips at mixed
  frame rates (25 and 30000/1001 in one document), a sub-frame clip, a clip
  name containing `& < > " '`, an emoji and a newline, library paths with
  spaces/unicode/newlines/symlinks, and event names that are empty,
  whitespace, 500 characters, `a/b\c:d*e?f"g<h>i|j`, `& < > " '`, RTL
  override characters, `...`, `../../escape` and NUL/BEL control characters.
  **Zero invalid documents.** Order is right where it matters:
  `import-options` before `resources`, formats before the assets that
  reference them, `<note>` first inside `asset-clip`, `<spine>` inside
  `<sequence>`. Names round-trip exactly (newlines in attributes collapse to a
  space on purpose, control characters are stripped by `stripInvalidXml`).
  Proof: `out/fcpxml/matrix-results.json`, `out/fcpxml/*.fcpxml`.
- **D-PASS-4 — library + named event + project in a second event is built
  correctly.** Two events, the raw clips as `asset-clip` in the first, one
  `project` per clip in the second, each project's `spine/asset-clip/@ref`
  pointing at the **same** asset rather than a copy, the timeline format
  (1080x1920 at 1/30s) separate from the source format. Duplicate project
  names are disambiguated with " 2", " 3". If both event names match, they
  merge into one event. Proof:
  `out/fcpxml/07-library-event-project-second-event.fcpxml`,
  `out/fcpxml/07b-same-event-name-merged.fcpxml`,
  `out/fcpxml/07c-duplicate-project-names.fcpxml`,
  `out/handoff/E-Raw clips تجربة.fcpxml`.
- **D-PASS-5 — all 58 symbols copy byte-exactly.** Each chip was clicked and
  the system clipboard read back and compared code point by code point against
  `src/lib/symbols.ts`: **58 checked, 0 wrong**, including the Arabic
  ligatures ﷺ ﷻ ﷽ ﴾ ﴿ ۞ and the four combining honorific signs U+0610-0613.
  The dotted circle the palette adds for display never reaches the clipboard
  (`displayed: U+25CC U+0610`, `clipboard: U+0610`). The Recent row copies the
  same bytes as the group chips. Search works by glyph, by alias ("pbuh" finds
  both) and by code point ("U+0610"), with a plain "Nothing matches" message.
  Proof: `out/symbols-exact/exact-diff.json`,
  `out/symbols/symbol-clipboard-diff.json`.
- **D-PASS-6 — the palette is usable by keyboard and at 360px.** Typing a
  query and pressing Enter copies the first match; ArrowDown enters the grid,
  Arrow keys move by geometry, Enter copies the focused chip, ArrowDown off
  the last row returns to the search box, Escape closes. At a 360px viewport
  the panel is 328px wide, no chip is off-screen on either side, no chip is
  under 24px, and the page does not scroll sideways. Proof:
  `out/symbols/02-keyboard-focus.png`, `out/symbols/03-palette-narrow.png`.
- **D-PASS-7 — a clip that cannot be probed is reported, not swallowed, and
  does not take the others down.** "Saved Audit D.fcpxml with 1 clip. / Left
  out AUD-stub0000001-01: The clip file is not where it was saved: …". Proof:
  `out/save/04-fcpxml-readonly.png`.
- **D-PASS-8 — the CapCut copy never overwrites.** Three copies of one clip
  into the drop folder give `X.mp4`, `X 2.mp4`, `X 3.mp4`; a drop folder that
  is a file, and a source that is gone, both fail with a message and no
  partial write. Proof: `80-order-unwritable.cjs` part 6.
- **D-PASS-9 — the send buttons are correctly dead with nothing to send, and
  repeated clicks are harmless.** With no clips in the session, Export FCPXML,
  Send all and Copy file path are all disabled with
  `title="No clips yet"` and no file is written. Clicking Send all three times
  in a row produced one file and one status, no duplicates and no corruption.
  Proof: `70-state-order-drag.cjs` part 1, `out/handoff/07-double-send.png`.
- **D-PASS-10 — an older or corrupt `clipper.editorHandoff` is absorbed
  cleanly.** Seeded with `afterCutting: "premiere"`, `capcutDropDir: 12345`,
  `openCapCut: "yes"`, `fcpLibrary: {path:"/nope"}`, `projectEvent: 7`,
  `projectNamePattern: 99`, `timelineFormat: "1080x1920@30"` and an entry for
  a campaign that no longer exists, the panel renders defaults
  (`nothing`/`campaign`, empty strings, unchecked) with no page errors and no
  console errors. Proof: `out/state/old-shape/01-old-shape-panel.png`.
- **D-PASS-11 — 100 hostile IPC calls, no crash.** Every `file:*`, `clip:*`,
  `export:save` and `editor:*` channel was called from the renderer with
  `null`, `undefined`, numbers, objects, arrays where strings are expected,
  2MB strings, 300-character paths, `..`, paths with newlines and NUL bytes,
  `/dev/zero` and `/etc/shadow`. The main process survived every one (the two
  liveness probes at the end answered in 0-1ms), the renderer saw **zero**
  unhandled rejections, every call returned a value rather than throwing
  across the bridge, and the renderer was still rendering afterwards. `clip:save`
  correctly refused every source outside its `ytclip-` temp directory
  ("Unexpected clip location") and `export:save` refused every source outside
  a `ytchan-` temp folder ("Unexpected export location"). The one exception is
  `file:startDrag` with a real path (D-1), which is why it is tested
  separately. Proof: `out/ipc/ipc-results.json`, `out/ipc/fs-diff.json`,
  `out/ipc/01-after-fuzz.png`.
- **D-PASS-12 — `editor:reveal` on a path that is gone says something
  useful.** "Nothing is at /tmp/a-folder-that-was-deleted-long-ago. It may
  have been moved, renamed or on an unmounted drive." Proof:
  `70-state-order-drag.cjs` part 1.

---

## User stories run

Twelve stories, each driven in the real app. "Result" names the finding it
produced or the pass it confirms.

| # | Story | Script | Result |
|---|---|---|---|
| 1 | A clipper sets up a Final Cut handoff for the first time: picks a clips folder, cuts a clip, names a library and an event, sends. | `40-handoff-e2e.cjs` B, E; `31-folders-real.cjs` | Works. D-PASS-1, D-PASS-3, D-PASS-4; D-21 on the way through. |
| 2 | They mistype the library path, or the drive holding it is unplugged. | `40-handoff-e2e.cjs` C, D | Works, fails closed. D-PASS-2. |
| 3 | They cut several clips in one sitting and send them all in one go. | `40-handoff-e2e.cjs` E (two clips); `96-three-clips.cjs` and `95-user-stories.cjs` story 3 (attempted three) | Works for two: one document, two assets, two asset-clips in the media event, two projects in the second event, each project's spine referencing the shared asset. A **third** clip could not be cut in these runs — blocked by an out-of-area defect in the used-ranges record (see "Cross-area observation"). D-PASS-4. |
| 4 | Having sent the batch, they cut one more clip with the automatic send on. | `95-user-stories.cjs` story 4; `40-handoff-e2e.cjs` J | **D-5** — the batch document is replaced by a one-clip document at the same path. |
| 5 | Set-and-forget: they turn on "After cutting: Send to Final Cut Pro" and keep cutting. | `70-state-order-drag.cjs` part 3 | **D-4** — the send fails and they are never told. |
| 6 | They work in CapCut instead: choose a drop folder, cut, and cut the same thing again. | `80-order-unwritable.cjs` parts 5-6; `40-handoff-e2e.cjs` I | Works, never overwrites. D-PASS-8. |
| 7 | They paste the used-material line into their tracker spreadsheet. | `60-symbols-copyblocks.cjs` | **D-3** — the panel is permanently empty. |
| 8 | They need ﷺ and "radiyallahu anhu" for a title card. | `61-symbols-exact.cjs` | Works, byte-exact. D-PASS-5, D-PASS-6; **D-14** on naming. |
| 9 | They drag the finished clip straight from the toast into their editor. | `70-state-order-drag.cjs` part 3 | **D-1** — the app freezes. |
| 10 | They reorganise: two campaigns with different folders, switched between. | `90-campaign-switch.cjs`; `31-folders-real.cjs` | Switching re-points the folders and the footer follows. **D-15** on the separation rule. |
| 11 | They come back the next day and try to send yesterday's clips. | `95-user-stories.cjs` story 11 | The clips are on disk and in the Downloads list, the library and event names are remembered, but the handoff panel is session-scoped so the buttons are disabled with "No clips yet". Working as documented ("every clip from this session"), but there is no way to re-send a clip after a restart. |
| 12 | The external drive holding the clips folder is unplugged mid-session. | `95-user-stories.cjs` story 12; `50-save-interruptions.cjs` part 3 | **D-10** — a raw stack trace when it happens during a save; afterwards Reveal and Export both report plainly (D-PASS-7, D-PASS-12). |
| 13 | A hostile or buggy bit of renderer code calls the bridge directly. | `10-ipc-hostile.cjs` | **D-6, D-7, D-12, D-13, D-20**; otherwise solid (D-PASS-11). |
| 14 | A fresh install with no campaign yet tries to set up the handoff. | `70-state-order-drag.cjs` part 2 | **D-8** — the panel is inert and silent. |
| 15 | Yesterday's settings come from an older version of the app. | `70-state-order-drag.cjs` part 1 | Works. D-PASS-10. |

---

## Coverage

Every function the brief names, and how it was exercised.

| Function | How | Verdict |
|---|---|---|
| Choose clips folder and data folder separately | Real clicks on `#ui-footer-clips` / `#ui-footer-data` with Electron's own dialog replaced (`31-folders-real.cjs`): choose, suggest, confirm, same folder, symlink, `/.`, `/..`, a file, a missing path, a trailing slash, cancel. Plus the product's `sameFolder` run directly. | D-15, D-21 |
| Save a finished clip | Real ffmpeg cuts moved by `clip:save` into a real folder, probed with ffprobe; filename collision; folder deleted mid-download; folder is a file; parent missing. | D-2, D-10 |
| Drag a clip out of the window | Real mouse drag on the product's grip; `file:startDrag` with hostile arguments; a control run with a path that does not exist. | D-1, D-18 |
| Build FCPXML | 29 documents validated against Apple's real 1.10 DTD, including the full hostile matrix the brief lists. Generated both through the UI and by running `src/lib/fcpxml.ts` unchanged. | D-PASS-3, D-9, D-23 |
| Send to Final Cut (library + event + project in a second event) | Real clicks through the whole panel; XPath assertions on events, assets, projects, refs and the import option; `open -a` arguments checked as far as the platform guard. | D-PASS-1/2/4, D-4, D-5, D-16, D-17 |
| Send to CapCut | Drop folder chosen and copied into, three times over; drop folder that is a file; source that is gone; Open CapCut. | D-PASS-8 |
| Copy blocks | All seven, with and without a video, a campaign and a segment; clipboard read back; keyboard focus on open. | D-3 |
| Symbol palette | All 58 entries clicked, clipboard compared code point by code point; combining marks and ligatures specifically; Recent row; search by glyph/alias/code point; keyboard-only; 360px width; Escape. | D-PASS-5/6, D-14 |
| `file:*` / `clip:*` / `export:save` / `editor:*` IPC | 100 hostile calls from the renderer, with a filesystem diff of a sandbox and a liveness probe. | D-6, D-7, D-11, D-12, D-13, D-20, D-PASS-11 |
| Order of actions | Send with no clip; change the clips folder after a download has started (by switching campaign, the only route without the native dialog); export twice; folder lost between choosing and saving. | D-PASS-9, D-10 |
| Repetition and races | Triple-click Send; the same clip sent twice; the same filename saved twice; the same clip copied to CapCut three times. | D-2, D-PASS-8, D-PASS-9 |
| Interruptions | Target folder deleted between choosing and saving; target that is a file; target whose parent is missing; source file gone at send time. | D-10, D-19, D-PASS-7 |
| State over time | `clipper.editorHandoff` seeded from an older shape with wrong types and a dead campaign key; `clipper.saveDirs` and `clipper.downloads` seeded with a path that no longer exists; a restart with yesterday's clips. | D-PASS-10, story 11 |
| Accessibility and layout | Keyboard-only copy in the palette and the copy-blocks panel; accessible names of every chip and button; tab order; 360px palette; `role`/`aria-label`/`tabindex` on the drag grip. | D-3, D-14, D-18, D-PASS-6 |
| Errors | Every failure message in the area read back from the live UI. | D-10, D-19, D-PASS-2, D-PASS-7, D-PASS-12 |

### Gaps inside this area

- The **native directory dialog itself** was never opened (no window manager
  or `xdotool` in the container), so its title, its filter behaviour and
  whether a `.fcpbundle` **package** can be selected at all on macOS are
  untested. D-22 is `likely` for this reason.
- The **cut lengths** in these runs are not the segment lengths: the stub
  `yt-dlp` ignores `--download-sections` and places the whole 30s fixture, so
  every saved clip probes as 30s. The FCPXML durations are correct *for the
  file on disk* (`750/25s`), which is what the generator is given, but "the
  duration in the document equals the segment length" was not provable here
  and belongs to area B/G.
- **A read-only target folder** cannot be produced by `chmod` because the
  container runs as root, which bypasses the check: a cut into a `0500`
  folder succeeded. Unwritability was produced instead with a target that is a
  file and a target whose parent is missing (D-19), which are real errno
  failures no privilege bypasses.

---

## Not provable here

- **Final Cut Pro, CapCut (and Premiere) actually opening.** macOS only; this
  is Linux. Everything up to and including the arguments was checked: the app
  resolved is a key of `APPS` and never a name from the UI, the command is
  `open -a <appPath> [file]`, the file must be absolute and must exist, and a
  missing app answers `{ok:false, missing:"<label>"}` with the file left in
  place. On Linux every call stops at the `platform !== "darwin"` guard with
  "Opening Final Cut Pro from here is macOS only. The file is saved at
  /tmp/…/Raw clips تجربة.fcpxml", which is the right message and the right
  path. Whether Final Cut then honours `<option key="library location">`,
  creates the project in the second event, or asks about a duplicate project
  name is **not provable here**.
- **Whether `file:startDrag` wedges the main process on macOS and Windows.**
  D-1 is confirmed on Linux (an AppImage is a shipped target, see
  `package.json` `build.linux`) and the control run isolates the cause to the
  `startDrag` call, but `webContents.startDrag` is platform-specific and the
  macOS and Windows behaviour needs the packaged app on those systems.
- **Whether a macOS open dialog can select a `.fcpbundle`.** A Final Cut
  library is a package, and `dialog:pickDirectory` asks only for
  `openDirectory`; whether the panel lets the user pick the package is a macOS
  question.
- **Real YouTube downloads**, so no claim is made about clip length, chosen
  format or 1080p behaviour (network policy; the stub stands in).
- **The packaged build.** All of the above was driven against
  `electron/main.cjs` in dev shape. The production bundle resolves the server
  through esbuild and compiles the owner-only exporter out, which could change
  which handlers are registered; installers, signing and auto-update are
  outside this area and **not provable here**.
