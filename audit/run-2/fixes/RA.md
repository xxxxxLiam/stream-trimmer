# Fix thread RA: CD2-1, CD2-2, CD2-3

Files changed: `src/App.tsx`, `src/components/EditorHandoff.tsx`, `src/components/ClipsColumn.tsx`,
`src/lib/handoff.ts`, plus tests in `EditorHandoff.test.ts`, `ClipsColumn.test.ts`, `handoff.test.ts`.
Nothing committed. Evidence: `audit/run-2/fixes/RA/` (before/after logs, `ra-midcut.cjs`).

## Verdicts

| ID | Verdict |
|---|---|
| CD2-1 (blocker) | **FIXED** |
| CD2-2 (major) | **FIXED** (`forgetUse`: not wired, see below) |
| CD2-3 (major) | **FIXED** |

CD2-1 and CD2-3 share one cause (the session's clips were session-wide, not campaign-wide) and are fixed
once. CD2-2 is a separate one-line cause.

## What was wrong, and the fix

**CD2-1 / CD2-3.** Two stores held "this session's clips" with no campaign in the key: `sessionBatch` in
`EditorHandoff.tsx` (keyed by clips folder only; a new campaign inherits the previous folder) and
`sessionClips` in `App.tsx` (one list for the whole session). Fix: a session's clips now belong to exactly
one campaign.
- `src/lib/handoff.ts`: `addSessionClip` / `sessionClipsFor` / `mergeSessionClips` (pure, one list per campaign id;
  "no campaign" is its own bucket, never anyone's).
- `EditorHandoff.tsx`: `HandoffContext.campaignId` is now required, and `sessionBatch` is keyed by campaign
  first, then folder. A clip cut under X cannot reach Y's document whatever the folders are.
  `resetSessionHandoff()` stays, but only for tests: scoping is structural, so no reset call is needed
  (and a reset on switch would have thrown away A's batch when switching back).
- `App.tsx`: `sessionClips` is derived for the active campaign only, so the panel's Export, Send all and
  Copy file path see only that campaign's clips ("No clips yet", buttons disabled, for B).
- Related leak found on the way: the panel's status line (`lastAuto`, and button results) was global, so B's
  panel showed A's "Saved A.fcpxml with 2 clips". `lastAuto` now carries its campaign and the panel shows
  only its own campaign's outcome, clears status on a switch, and drops a Send/Copy result that finishes
  after a switch.

**Extra, same family (found while fixing): After-cutting settings read live.** `afterSaved` read
`editorRef.current`, i.e. the settings of whichever campaign is active when the download FINISHES. Cut under A
(Send to Final Cut on), switch to B (off): A's cut got B's settings and was never sent; the reverse would send
A's clip under B's rules. Settings are now captured when the cut starts (main Cut and banked Cut).
Proven in the real app: `RA/ra-midcut.cjs`. Before: no `Client A.fcpxml`. After: written.

**CD2-2.** `ClipsColumn.tsx` called `recordUse(vid, ranges, clipId)` with no campaign id, so it fell back to
the campaign active at finish. It now passes the `campaignId` the cut started in (as the bank half and the
main Cut button already did). The post-cut step is extracted as exported `finishBankedCut` so it is testable.

**`forgetUse`: neither wired nor removed by me.** It lives in `CampaignContext.tsx` (not mine). Recommendation:
remove it, or give it a `campaignId` argument first. Wiring it (e.g. to bank-row Remove) would let a user
erase the no-reuse record, which is a product decision, and as written it has the same flaw as the old
`recordUse`: it acts on whichever campaign is active now. With CD2-2 fixed there is no wrong record to undo.

## Reproduce, fix, negative control

Reproduced on the baseline build (real app, scratch build of the pre-fix tree) with the audit's own scripts
(`r2-cross-campaign.cjs`, `d5-handoff.cjs` PART C):

| | before | after |
|---|---|---|
| CD2-1 `Client B.fcpxml` | holds `AAA-...-01`, `AAA-...-02` and B's | holds only `BBB-stub0000001-01`; `VERDICT ... Client A's clips: no` |
| CD2-2 used ranges after switch | A `{}`, B has `A01` | A has `A01`, B `{}`; `VERDICT: no crossing` |
| CD2-3 panel with B active | "(1)", Copy path enabled, returns `.../Client A clips/AAA-...-01.mp4` | no count, Copy path disabled |

Unit tests, with a negative control for each (fix reverted, test run, fix restored, test run):

| test | negative control | result |
|---|---|---|
| `EditorHandoff.test.ts` "CD2-1: a campaign's document never holds another campaign's clips..." | batch key back to folder only | **FAILED** (test 5), restored: pass |
| `ClipsColumn.test.ts` "CD2-2: a banked cut records its used range against the campaign it started in" | `recordUse` without the campaign id | **FAILED** (test 2), restored: pass |
| `handoff.test.ts` "CD2-3 ..." (2 tests) and CD2-1 | `sessionCampaignKey` ignores the campaign | **FAILED** (tests 5, 24, 25), restored: pass |

Limit: the App-level wiring (derived `sessionClips`, captured settings) has no DOM test (no renderer in the repo);
it is covered by the real-app runs above, whose "before" runs are the negative control for it.

## What still holds

Real app, scratch build of the fixed tree (separate `--outDir`, electron/ copy identical to the baseline):
- Campaign isolation: `c2-names-isolation.cjs`, **36 of 36 assertions** (includes the 24 isolation rounds).
- FCPXML: **34 documents** (31 from `src/lib/fcpxml.ts` + 3 the app wrote) all pass `xmllint --dtdvalid` against
  Apple's 1.10 DTD, **0 `<library>` elements**, `<import-options>` is the first child wherever a library is set
  (32 documents; the one without a library has none). `d6-fcpxml.ts` 8/8 assertions. D-4 and D-5 verdicts in
  `d5-handoff.cjs` still HELD (second cut grows the same file 2,791 to 3,885 bytes, DTD OK).
- `src/lib/fcpxml.ts` is untouched.

## Suite

`node_modules/.bin/tsc --noEmit`: clean. Full suite once: **649 tests, 648 pass, 1 fail.** The failure is not
mine: `server/updater.test.ts` "the download links point at the artifacts the build produces" expects repo
`stream-trimmer` but gets `clipr`, from `package.json` `build.publish.repo` having been renamed (the run 2 report
notes that change). Whoever owns the updater or package.json must reconcile the test or the name. My 6 new tests
(649 vs 609 includes other threads' additions) all pass.

## Needed but not owned

- `src/context/CampaignContext.tsx`: `forgetUse` (above); also `recordUse`'s no-id fallback to the active campaign is a
  trap for any future caller: consider making `campaignId` required.
- `package.json` / `server/updater.test.ts`: the one failing test above.
