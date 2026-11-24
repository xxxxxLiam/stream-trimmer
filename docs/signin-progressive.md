# Sign-in: one step at a time — spec

Not built. Written up while the reasoning was fresh so it can be picked up
cold. Nothing here has been implemented.

## The problem

`YouTubeConnectModal.tsx` (483 lines) shows the whole sign-in story at once.
On first launch, before the automatic browser sweep has even finished, the
modal is already showing:

- the headline and the 360p explanation,
- **Continue without signing in (360p)**,
- a live progress row, *"Checking chrome…"*, still running,
- **"Not found automatically. Three steps:"** — the full manual fallback,
  three numbered steps with a long paragraph each, including a warning about
  a malware-flagged Chrome extension and look-alike clones,
- a second **Checking…** button,
- a closing paragraph on session refresh and expiry.

Two things are wrong with that, and the second is worse than the length:

1. **It is too much to read.** The modal is the first thing a new user meets,
   and it asks them to absorb a browser-extension install, a private-window
   dance and a file export before they have pasted a single link.
2. **It shows the failure path before the check has failed.** "Not found
   automatically" is on screen while the sweep is still saying "Checking
   chrome…". If the sweep then succeeds, the user has already read three
   steps they never needed. If it fails, they read the verdict before the
   evidence. Either way the modal contradicts itself for a few seconds on
   every launch.

## What it should do

One state visible at a time. Nothing about step N+1 until step N has
actually failed.

### State 1 — checking

Only the headline, the one-line reason (no sign-in means 360p), the live
progress row, and **Continue without signing in (360p)**.

Nothing about cookies, extensions or files. Most users with a signed-in
browser never leave this state, and they should never learn that the manual
route exists.

### State 2 — not found, here is the manual route

Reached **only** once the sweep has finished and found nothing. The three
steps appear now, and only now.

Within this state, keep going one at a time rather than showing all three:
step 2 (export) is meaningless until the extension from step 1 is installed,
and step 3 (drop the file) is meaningless until step 2 has produced one. A
disclosure per step, or a small stepper, with the next one opening as the
previous is marked done.

The drop target and the file picker belong to step 3 and should not be
visible before it.

### State 3 — it failed, here is what to send

Reached only when an imported file is rejected. The current modal has no
distinct state for this; the error appears alongside the instructions that
produced it.

This state should carry the **Copy diagnostics** button, so a user who has
genuinely got stuck can report it in one click rather than describing what
they saw. That is the only point at which diagnostics are relevant, and
showing them earlier invites people to send logs for a flow that was
working.

## Build notes

- `src/renderer/src/features/youtubeConnection/components/YouTubeConnectModal.tsx` — the modal. The content for all
  three states already exists here; the work is gating it, not writing it.
- `src/renderer/src/shared/utils/youtubeConnection.ts` — the state machine, 750 lines, already
  tracks everything the gating needs: `restoring`, `busy`, `step`,
  `expired`, and a `signInEpoch` that makes a late browser sweep stand down
  rather than overwrite a sign-in made meanwhile (lines 233–235, 517).
  **Do not add a parallel notion of "which step are we on" beside it** — the
  existing state should be what decides which panel renders.
- `src/renderer/src/shared/components/DiagnosticsDisclosure.tsx` — the Copy diagnostics control
  for state 3. Reuse it; do not build a second one.
- `src/renderer/src/features/help/utils/setupTasks.ts` — the Setup checklist also narrates sign-in. Keep
  the two in agreement, or the checklist will describe a step the modal is
  no longer showing.
- `signedOutQuality.test.ts` pins that the help button and drawer withdraw
  while the gate is up. Any restructuring must keep that true.

## Decide before building

1. Does **Continue without signing in** stay visible in all three states? It
   should — someone who gets stuck at step 2 needs the exit more than
   someone who has just opened the app.
2. Does the modal remember which state you were in across a restart, or
   start from the sweep every time? Starting fresh is simpler and the sweep
   is cheap, but it loses a half-finished manual import.
3. Does state 2 appear at all for a user who has previously signed in and
   then expired? They know the drill; they may want the drop target
   immediately rather than three steps again.

## Not a rewrite

The copy in the existing modal is accurate and hard-won — the malware
warning about the non-LOCALLY extension, and the private-window advice
(a session you keep browsing in rotates and stops working within hours) are
both real findings. This is a sequencing change. Keep the words; show fewer
of them at a time.
