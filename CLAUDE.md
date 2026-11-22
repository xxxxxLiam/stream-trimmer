# Working rules for this repository

## Design

**No visible scrollbars.** Anywhere in the UI, in designs and in the shipped
app. This is a standing preference, not a per-screen decision.

Scrolling itself must keep working — by wheel, trackpad, keyboard (arrows,
Page Up/Down, Home/End) and programmatic scroll. Hiding the bar must never
cost anyone the ability to reach the content, so anything scrollable still
needs a keyboard route to everything inside it.

```css
*::-webkit-scrollbar { width: 0; height: 0; }
* { scrollbar-width: none; -ms-overflow-style: none; }
```

A corollary worth stating, because it has already caused a contradictory
audit finding: the absence of a scrollbar is never itself a defect. If
content is unreachable, the defect is the unreachable content — say that
instead, and fix it without bringing the bar back.

## Design tokens

These are computed and contrast-checked; do not introduce values outside
them.

```
bg #0B0B0C   panel #161618   raised #1C1C1F   hover #252527
hairline rgba(255,255,255,0.08)   hairlineStrong rgba(255,255,255,0.14)
fg #F5F5F7        fg-dim #969697 (the only muted tier)
disabled #909092  accent #FF6363
radius: panel 14, control 8, chip 5
```

`rgba(255,255,255,0.35)` was removed for failing WCAG AA at 3.25:1. There are
exactly two readable text tiers, `fg` and `fg-dim`; a third does not exist.
Disabled text uses the `disabled` token, never `fg-dim` with an opacity
modifier — that lands around 2:1.

The product's logo is `src/components/shell/BrandMark.tsx`, traced from the
installer icon so the window and the dock show one mark. It stands alone:
there is no wordmark beside it.

## Who this is for

One user: a clipper cutting many short vertical clips out of long podcasts
and interviews, across several client campaigns a day. The test any change
has to pass is whether it gets more clips out of one long video per hour.
Features set once a session belong in the footer or settings, not in the
loop.

## Testing

- Run the project's own command: `npm test` (`tsx --test server/*.test.ts`).
  For the renderer suites too: `node_modules/.bin/tsx --test $(git ls-files
  '*.test.ts' '*.test.tsx')`. Do not bundle tests with esbuild to run them —
  it breaks their relative `require`s and invents failures.
- A test that cannot fail is not a test. When fixing a bug, revert the fix
  and watch the new test fail before restoring it.
- `audit/harness/` drives the real packaged-shape app under xvfb with an
  isolated user-data dir per launch; `audit/harness/README.md` explains it.

## Environment notes

- YouTube is unreachable from cloud sessions (network policy), so real
  downloads, transcripts and signed-in behaviour cannot be verified there.
  Say "not verified against real YouTube" rather than implying otherwise.
- Final Cut, Premiere and CapCut handoff is macOS-only and cannot be
  exercised on Linux.
- Electron's binary is not fetched by `npm ci` in cloud sessions; run
  `node node_modules/electron/install.js` once.
