# Workspace editor — spec

Not built. Written up while the reasoning was fresh so it can be picked up
cold. Nothing here has been implemented.

What **is** built is much smaller: the two side columns (transcript, clips)
can be resized by dragging, and the widths persist. See "What exists today".

## The problem

The workspace is three fixed panels in a fixed order: transcript, mark,
clips. A clipper who works the same way all day cannot make it fit how they
work. Someone who lives in the clips list wants it wider and nearer the
video; someone cutting from a transcript wants the transcript tall and the
mark bar compact. Today the only thing that moves is column width, and that
is the same for every campaign.

## What exists today

- `ThreeColumnLayout.tsx` renders the three columns. They stack below a
  container-query breakpoint (840px of the workspace's own width, not the
  window) and sit in one row above it.
- Two drag handles, transcript | centre and centre | clips, resize the side
  columns; the centre takes the difference. Each handle is a focusable
  `role="separator"`: arrows nudge, Shift+arrows nudge further, Home/End jump
  to min/max, Enter or a double-click resets.
- Widths persist globally under `clipper.columnWidths`
  (`{ transcript?: number, clips?: number }`, CSS px, absent = default).
- Pure logic is in `columnSizes.ts`; the handle is `ColumnHandle.tsx`.

Everything below is beyond that.

## What it should do

### 1. Rearranging panels

Let the user choose which panel sits where: swap transcript and clips, or
put clips under the video instead of beside it.

- Rearranging is a **mode**, not something every drag does. Dragging a panel
  by accident in the middle of a cut would cost more than the feature gives.
  Enter it from the footer or settings; leave it with Done or Escape.
- Every move has a keyboard route. In the mode, a focused panel moves with
  Alt+Arrow, and the result is announced ("Clips moved to the left"). A
  drag-only editor would lock keyboard users out of the layout.
- The mark column (video, timeline, In/Out/Add/Cut) is the loop. It may move
  but must never be hidden or shrunk below the floor that keeps In, Out, Add
  and Cut visible.
- Below the stacking breakpoint the order is not editable; the stacked order
  stays mark first.

### 2. Named layouts, per campaign

A layout is the arrangement plus the sizes. Save it under a name ("Podcast
cuts", "Interview, tall transcript") and attach one to a campaign, so
switching campaign switches the workspace.

- Stored with the campaign, not in a separate global list, so removing a
  campaign removes its layouts (the bank already works this way).
- A campaign with no layout uses the global one. Today's
  `clipper.columnWidths` becomes that global default; it must keep working
  untouched for anyone who never opens the editor.
- Saving, renaming, deleting and applying a layout are all plain buttons in
  the editor, reachable by keyboard.
- Layouts are set once and left alone, so this belongs in the footer or
  settings, not in the cutting loop.

### 3. Heights as well as widths

Today the side columns are capped at 75vh and the centre scrolls inside
itself. Allow a panel's height to be set the same way widths are, with a
horizontal handle (`aria-orientation="horizontal"`, Up/Down arrows, Home/End,
reset) and the same clamping rules.

- Heights only mean something in a row of panels, so this depends on
  question 1 below.
- Hiding scrollbars is a standing rule here. A panel made shorter than its
  content must still scroll by wheel and keyboard (it is a focusable region
  with a label), and the editor must not rely on a visible bar to show that
  there is more.

## Build notes

- Extend `columnSizes.ts` rather than writing a second sizing module: the
  clamp and distribute functions are the part that has to be right, and they
  are already tested.
- Store a layout as data (an ordered list of panel ids plus sizes) and render
  from it. Do not encode arrangements as ad-hoc class names.
- Keep the container-query stacking exactly as it is. Sizes are CSS
  variables read only inside the wide query; a layout must never leave an
  inline width on a stacked panel.
- Per-campaign storage touches `src/renderer/src/shared/utils/campaigns.ts` and
  `CampaignContext.tsx`, which other work is changing. Coordinate first.
- Read-back must be defensive: a settings file written by a newer or older
  version may hold unknown panels or nonsense sizes. Fall back to the default
  layout rather than a blank workspace (`parseStored` is the pattern).

## Decide before building

1. Is the layout a fixed row of three slots, or a free arrangement of rows and
   columns? Fixed slots are far simpler and cover swapping; vertical
   stacking and height-resizing push toward a real grid.
2. Does a campaign remember its layout automatically on every change, or only
   when the user presses Save? Automatic is less to do; explicit protects a
   layout someone liked from being nudged out of shape.
3. When the user resizes while a named layout is active, does that edit the
   layout, or detach from it?
4. Should the help drawer take part, or stay an overlay as it is now?

## Not a rewrite

The three panels, their contents and the stacking behaviour stay as they are.
This only decides where the panels sit and how big they are.
