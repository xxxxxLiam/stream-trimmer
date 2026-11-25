# Working rules for this repository

## File structure

Process-first, per the Electron File Structure Guide:

```
src/main/{index.ts, ipc/, features/<name>/{services,utils,...}, modules/<name>/, shared/}
src/preload/index.ts
src/renderer/{index.html, src/{main.tsx, routes/, features/, modules/, shared/}}
src/common/{ipc,schemas,types,constants,utils}
resources/ build/ e2e/ scripts/ docs/
```

- Placement by consumer: one feature uses it → that feature's folder; two or
  more features in one process → that process's `shared/`; two or more
  processes → `src/common`.
- **Import boundary:** main, preload and renderer never import each other.
  Only `src/common` crosses. Enforced by the split tsconfigs
  (`tsconfig.node/preload/web.json`) and ESLint `no-restricted-imports`
  (`npm run lint`). Test files are exempt.
- **IPC handlers** in `src/main/ipc/` do input validation and one call into
  `features/<name>/services/*` — no business logic.
- **Exception:** `src/preload/index.ts` is a one-file folder (process root);
  no other folder may hold a single file.
- The engine (`src/main/features/engine`) runs in the main process.

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
them. Ice and Frost palette ("The Clean Cut"). The Tailwind names and the
CSS variables in `src/renderer/src/styles.css` carry them; a component never
holds a raw hex or rgba.

```
bg #0A0D0F   panel #121619   raised #181D21   hover #232A2F
hairline rgba(255,255,255,0.08)   hairlineStrong rgba(255,255,255,0.14)
fg #F2F5F6        fg-dim #94A0A5 (the only muted tier)
disabled #8B979C
ice #5FD8CA (the one signal colour)   frost #B8E4EA (the light: playhead, saved flash)
error #FF6363 (failure only: a 1px border and the sentence, never a fill)
radius: panel 14, control 8, chip 5      spacing step 4      target 44
type: Inter (bundled), 20 / 15 / 13 / 12, weights 400 and 500,
      named exceptions text-cliplength 22 and text-drawer-title 17
```

WCAG contrast, measured: fg 17.79 on bg, 16.60 on panel, 15.50 on raised,
13.28 on hover. fg-dim 7.27 / 6.78 / 6.33 / 5.42 on the same four. Disabled
6.50 / 6.07 / 5.66 / 4.85. All clear AA (4.5:1).

There are exactly two readable text tiers, `fg` and `fg-dim`; a third does not
exist. Nothing under 12px. Disabled text uses the `disabled` token, never
`fg-dim` with an opacity modifier. Surfaces are flat (fill plus hairline); no
gradients and no plain drop shadows. Glow is a brand-colour shadow that marks
live state only, from the named set (`glow-cut`, `glow-range`, `glow-row`,
`glow-playhead`, `glow-box`, `glow-mark`, `flash-saved`). Ice alpha tints have
names too (`ice-tint-12` and so on). Ice appears at most twice per screen.

The product's logo is `src/renderer/src/shared/components/BrandMark.tsx`: the
scissor-blade mark, with the "Clipr" wordmark beside it in the app (lockup C:
the mark with "Clipr" in Inter 500, its r cut by a diagonal slit with the top
piece in Ice; the paths come from `design/clipr-lockup-c.svg`, never rebuilt by
hand; below 32px the mark stands alone). The app, installer and tray icons are
mark-only.

## Who this is for

One user: a solo freelance video editor who clips for an agency or clients
across several campaigns a day. Each campaign has a small daily quota, so
under 15 clips a day in total, but every quota has to land on time and the
clips have to be good enough to win views. Sources run from 10 minutes to
multi-hour. The test any change has to pass is whether every campaign's
quota gets done sooner and done well. Features set once a session belong in
the footer or settings, not in the loop. See `plans/icp.md` in project files.

## Testing

- Run the project's own commands: `npm test` (every suite: main, preload,
  common, scripts, renderer; the release workflow runs this too),
  `npm run test:renderer` (renderer only), and `npm run check` for everything
  (typecheck of all four tsconfigs, `npm test`, lint). Do not bundle
  tests with esbuild to run them — it breaks their relative `require`s and
  invents failures. Checks run locally; GitHub Actions are for releases only.
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
