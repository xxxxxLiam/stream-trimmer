## Goal
Make the UI responsive with a two-column desktop layout (form left, preview right) that collapses to a single stacked column below 900px, while preserving the strict black/white minimalist styling. Then run through an end-to-end test pass and report results.

## Files to change
- `src/App.jsx` — restructure JSX into two regions (`.controls` and `.preview-col`) inside the existing `.panel`, keeping all existing state, validation, and fetch logic untouched. Mobile order via DOM: URL input → preview → range → button → status (achieved by rendering preview between input and range and reordering with CSS grid on desktop).
- `src/styles.css` — add a CSS grid on `.panel` with `grid-template-columns: 1fr` by default and `grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)` at `@media (min-width: 900px)`. Widen `.panel` max-width to ~1080px on desktop. Place preview in right column on desktop via `grid-column`/`grid-row`, keep mobile stacking order as specified. No new colors, shadows, or libraries.

## Layout approach
```text
Desktop (≥900px)              Mobile (<900px)
┌──────────┬──────────┐       ┌──────────┐
│ URL      │          │       │ URL      │
│ Range    │ Preview  │       │ Preview  │
│ Status   │          │       │ Range    │
│ Button   │          │       │ Button   │
└──────────┴──────────┘       │ Status   │
                              └──────────┘
```
Implemented by making `.panel` a grid; on mobile everything is a single column in DOM order (input, preview, meta, range, status, button). On desktop, preview is pinned to column 2 spanning multiple rows via `grid-column: 2; grid-row: 1 / span N`, and the rest flow in column 1.

## Testing
Since Lovable's preview cannot run yt-dlp/ffmpeg, testing splits into two buckets:

**Testable in Lovable preview (I will run):**
- Layout at desktop and mobile viewports via Playwright screenshots at 1280px and 480px widths.
- Resize across the 900px breakpoint mid-session — confirm URL text, slider values, and error state persist (pure CSS switch, no remount).
- Client-side validation: invalid URL, start ≥ end, end > duration, range > 600s — inline error surfaces without crash. (Duration-dependent checks require a mocked `info` state; I'll verify the code paths but the "duration exceeded" case needs a real `/api/info` response.)
- Backend unreachable → friendly "Backend not reachable" message (already handled by `parseJson`).

**Requires local `npm run dev` (I will document, not execute):**
- Real `/api/info` against a YouTube URL.
- Real clip download and playback.
- Server-side 600s cap and duration re-probe.
- Missing-yt-dlp binary error path (server logs + UI error).
- Long source, short selection — confirm only the section downloads.

## Deliverable format
1. Changed files (`src/App.jsx`, `src/styles.css`) shown in full.
2. Test report table (Test | Expected | Result | Notes) covering both buckets, with "to confirm locally" marked honestly for the backend cases.
3. Bulleted list of any fixes made.
4. Short note on what needs local verification.

## Non-goals
- No changes to `server/index.js`, ports, proxy, validation logic, or dependencies unless a bug is found during testing.
