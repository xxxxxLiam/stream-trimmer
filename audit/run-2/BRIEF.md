# Audit run 2 — shared brief

Run 1 found 151 defects; 10 blockers and 27 major were fixed by nine threads.
Run 2 exists to answer three questions, in this order of importance:

1. **Did the fixes actually hold?** Re-run run 1's confirmed findings for your
   area against the fixed app. A fix that passes its own unit test but fails
   in the running app is the most valuable thing you can find.
2. **What did the fixes break?** Regressions are the point of this run. The
   changes were large and touched shared state, layout, the cookie path, the
   owner gate and the cut pipeline. Attack the things *near* each fix.
3. **What did run 1 miss?** Run 1 was the first pass over this app. Hunt
   fresh, especially in paths run 1 reached late or not at all.

Read before starting:
- `audit/harness/README.md` — how to drive the real app, the stub, evidence rules
- `audit/inventory.md` — the feature map and this container's limits
- `audit/run-1/report.md` — what was found and what held up
- `audit/run-1/action-plan.md` — what each thread was asked to change
- `audit/run-1/fixes/*.md` — what each thread actually changed, and what it
  admitted it could not prove
- `CLAUDE.md` — standing rules, including **no visible scrollbars** (scrolling
  must still work; the absence of a bar is never itself a defect)

## State of the tree

609 tests pass, `tsc` is clean, both build shapes build, and the public
bundle contains zero exporter strings.

## Things run 1's own authors flagged as unproven — verify these first

Each of these is a fix whose author said, honestly, that they could not
demonstrate it in the running app. They are the likeliest places for a fix to
be wrong:

- **C-1** (two tabs + a non-empty bank blanked the app). The call-site fix is
  in, but nobody has reproduced the crash *or* its absence end to end. The
  precondition is two tabs **both showing the same video**, with a bank row
  that still yields a **planned** range — a row already marked `cut` does not
  trigger it. A check that does not crash with the fix **reverted** proves
  nothing; establish the negative control first.
- **B-2** (segments shared across tabs) — same store, same caveat.
- **D-1** (drag-out wedging the main process) — only the no-gesture guard is
  fixed; the real drag is untestable here (no window manager). Do not pass it.
- **F-10 / the error boundary** — never exercised with a real render throw.
- **D-3's wiring** — tested with the stub, not a real transcript.
- **Item 12** (a cancelled download answering 499) — never driven for real.
- **E-4 / `export:save`** — the owner guard was pinned by test order, not by
  driving the IPC handler from a non-owner build.

## Rules, unchanged from run 1

- **Change no product code.** You report; fixing happens later.
- Evidence or it did not happen: a screenshot, a failing script, or captured
  output. Code reading alone is `likely`, never `confirmed`.
- Use the finding format in `audit/harness/README.md`, with IDs prefixed by
  your area letter and numbered from 1 (e.g. `B2-1` for run 2, area B).
- Judge severity honestly. Run 1 filed 31 of 68 too high, which cost a whole
  verification pass. blocker = cannot do the job or loses data; major = a core
  function is wrong with no workaround; minor = wrong but survivable; polish =
  cosmetic.
- Say **not provable here** rather than passing something this container
  cannot test: real YouTube, signed-in 1080p, the editors launching,
  installers and auto-update.

## Harness traps that have already cost us runs

- `tsx` is a wrapper: killing it orphans the server. With a fixed port a later
  run silently talks to an **earlier run's server**. Pick a free port, wait for
  the process's own "listening on" line, kill the process group.
- Run your suites one at a time. Eight concurrent runs starved each other in
  run 1 and several threads never got a result.
- `make-stub-root.cjs` with no argument overwrites the repo's real
  `resources/bin/yt-dlp`. Always pass a target directory.
- The sign-in gate now has a "Continue without signing in (360p)" button —
  use it to get past the modal rather than suppressing product UI.

Write your findings to `audit/run-2/areas/<AREA>.md` and your scripts to
`audit/run-2/area-<X>/`.
