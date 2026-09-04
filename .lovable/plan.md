# Auto-search on paste + tighter Clip layout

## 1. Auto-search the URL (no Enter, no button click)

- As soon as the URL field holds a valid YouTube link (watch, youtu.be, shorts, or with extra query params), the app loads the video automatically.
- Works for empty → URL and URL → different URL. Re-typing the same link does nothing (no duplicate loads).
- Small debounce (~450 ms) so a paste fires once and typing character-by-character doesn't spam requests.
- Paste itself triggers immediately (no wait) since a pasted string is complete.
- Invalid/partial text is ignored silently — no red error while typing; the error only appears if a real load fails.
- The Search button stays but becomes a retry affordance: it turns into a small spinner while loading and an X/cancel is not needed since loads are quick. Enter still works.

## 2. Transcript moves into the Clip tab

Removes the top-level Transcript tab. Top tabs become: **Clip · Downloads · Export**.

On the Clip tab, the right column (currently just the preview) becomes a stacked workspace:

```text
+-------------------- Clip tab --------------------+
|  URL bar (auto-search)                           |
+------------------------+-------------------------+
| Video meta             |  Video preview          |
| Time range + scrubber  |  (player + controls)    |
| Format / quality       +-------------------------+
| Save destination       |  Transcript             |
| Errors                 |  search | copy | export |
|                        |  scrollable lines       |
+------------------------+-------------------------+
|  Footer: status · progress · Download            |
+--------------------------------------------------+
```

- Transcript sits directly under the preview, sharing the right column, so it always has the video it belongs to.
- It is collapsible: a header row ("Transcript · N lines") toggles it open/closed. Collapsed by default when the window is short, so the preview keeps its space.
- An "Expand" button opens the transcript in a full-screen overlay (large modal) for long reading/searching sessions — same search box, same click-a-line-to-jump, same set-in/set-out buttons, same Copy and Export actions.
- Clicking a transcript line still seeks the player and can set the clip in/out points, which now works without switching tabs.

## 3. Other UX improvements included

- **Empty state**: when no video is loaded, the Clip tab shows one centered paste prompt instead of a half-empty two-column form, so the space isn't wasted.
- **Loading**: replace the full-screen overlay for "Loading video info" with inline skeletons in the meta/preview slots — less jarring, and the tab stays usable.
- **Denser left column**: format, quality and browser sign-in collapse into a single compact row group; the save destination shows the active folder label with a dropdown instead of a full block.
- **Range readability**: show the selected duration and in/out timestamps inline on the scrubber instead of a separate line.
- **Keyboard**: `Cmd/Ctrl+L` focuses the URL bar; `Cmd/Ctrl+F` focuses transcript search when the transcript is open. Existing player shortcuts unchanged and still active-tab-only.

## Technical notes

- Add a `parseYouTubeUrl` helper (reuses existing shorts normalisation) in `src/lib/clip.ts`; `useClipper.ts` gets an effect that debounces `url`, compares the parsed video id against the last-loaded id, and calls `loadInfo()` when it changes. Loads already in flight are guarded by `loadingInfo`.
- `UrlBar.tsx` adds an `onPaste` fast-path that skips the debounce.
- `App.tsx`: drop `"transcript"` from the `Mode` union and `ModeTabs`; render `<TranscriptPanel />` under `<PreviewPanel />` in the right column, wrapped in a new collapsible/expandable shell (`src/components/TranscriptDock.tsx`) that owns the collapsed and modal states.
- `TranscriptPanel.tsx` stays the same component (it already handles search, jump, copy, in/out); it gains a `compact` prop for the docked variant. The modal uses the same instance rendered into a portal-style overlay with the existing panel/hairline/accent tokens and framer-motion fade.
- No backend or business-logic changes; all edits are presentation plus the auto-load effect.
