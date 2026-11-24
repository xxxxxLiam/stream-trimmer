# Campaign setup wizard — spec

Not built. Written up while the reasoning was fresh so it can be picked up
cold. Nothing here has been implemented.

## The problem

A new user installs Clipr and lands in a window where nothing is configured
and nothing says what to configure. The header reads `Campaign None yet`, the
footer reads `Clips Not set` and `Data Not set`, and the app will let them cut
anyway. It works, but:

- The clip goes to `~/Downloads` instead of a client folder.
- It takes the slow delivery path. `useClipperController.ts` gates on
  `deliverPath = Boolean(isElectron && window.electronAPI?.saveClip && saveDir)`.
  With no folder set that is `false`, so the whole finished file is buffered
  as a Blob through the renderer instead of the main process moving a file on
  disk. The comment there says it plainly: *"Only then does the media avoid
  the UI entirely; every other case still streams."*
- None of the per-campaign machinery — naming pattern, length band, used-range
  memory, the bank — does anything, because all of it hangs off a campaign.

So the penalty for skipping setup is invisible, and the reward for doing it is
undiscoverable. That is the wrong way round.

## The user's model

One tab per campaign, set once and left alone. A tab without a campaign is an
unfinished tab, not a valid state someone should live in.

> *"Each tab would hold one of my campaigns. So generally, that would be
> permanently set. […] When I start a new tab, I need to select a campaign. If
> I don't have a campaign, there's a lot of settings that haven't been attached
> to the tab."*

## What it should do

On opening a new tab, offer a campaign picker:

- **Existing campaigns** listed for one-click selection. This is the common
  case after the first week and must stay one click.
- **Create a new campaign** → the wizard.

Not mandatory. Someone who wants to paste a link and cut once should still be
able to dismiss it. The point is that the choice is **offered and explained**,
not that it is enforced.

On very first launch there are no campaigns to list, so the picker is the
wizard.

## Why a wizard rather than the form that exists

`CampaignMenu.tsx` already has a complete New campaign form, and
`setupTasks.ts` already has a "New campaign" / "Pick a campaign" entry in the
Help drawer's optional Setup checklist. Neither solves this, because both
require already knowing that campaigns are the thing that matters. The form is
behind a dropdown labelled with the problem rather than the solution, and the
checklist is marked Optional in a drawer that opens closed.

A wizard earns its place only if each step says *why*, not just *what*:

> *"Otherwise people might not know all the benefits of what they are setting
> up and how to even set up. They just get pushed in and they don't know what
> is what."*

## The good news: the data model is already complete

`Campaign` in `src/renderer/src/shared/utils/campaigns.ts` already holds every field a wizard would
collect. No schema work is needed.

| Field | Wizard step | Why it matters to the user |
|---|---|---|
| `name` | Name it | Which client this tab is for |
| `clipsDir` | Where clips go | Deliverables land in the client folder, and it puts cuts on the fast path |
| `dataDir` | Where data goes | Research CSVs, kept apart from deliverables — must never equal `clipsDir` |
| `prefix`, `clipIdPattern` | Naming | Files arrive named for the client instead of needing a rename pass |
| `targetMinSec`, `targetMaxSec`, `hardMaxSec` | Length band | The length check warns before a cut is out of spec, not after |
| `format`, `quality` | Output | Set once per client rather than per clip |
| `usedRanges` | — | Populated by use; never asked for |

## Build notes

- `src/renderer/src/shared/utils/campaigns.ts` — `Campaign`, `CampaignInput`, `createCampaign`,
  `DEFAULT_PATTERN`. Reuse as-is.
- `src/renderer/src/features/campaigns/hooks/CampaignContext.tsx:216` — new campaigns already start from the
  last folder chosen. Keep that; it makes campaign two onwards fast.
- `src/renderer/src/features/campaigns/components/CampaignMenu.tsx` — the existing form. The wizard should
  drive the same create path, not a parallel one.
- `src/renderer/src/features/help/utils/setupTasks.ts:166` — already has the task entry; wire it to launch
  the wizard rather than open the menu.
- Tab state is where the real new work is: a tab needs to remember its
  campaign, and the binding must survive a restart.

Scope is a UI layer plus tab/campaign binding and its tests. The model,
persistence and creation logic exist.

## Decide before building

1. Dismissing the picker — does the tab stay campaign-less for good, or does
   the prompt return next launch?
2. Can two tabs hold the same campaign? Used-range memory is per campaign, so
   two tabs on one campaign can disagree about what has been cut until one
   writes.
3. Does changing a campaign's `clipsDir` later move existing clips, or only
   affect new ones? (Only affect new ones is the safe answer, but it should be
   said out loud in the UI.)

## A cheaper first step, if the wizard is not being built yet

Default `clipsDir` and `dataDir` on first run (e.g. `~/Movies/Clipr/Clips` and
`~/Movies/Clipr/Data`) instead of leaving them empty. That alone puts every
install on the fast delivery path and stops clips scattering into `~/Downloads`,
without adding a single step to the loop. It does not teach anyone what a
campaign is, so it is a mitigation, not the fix.
