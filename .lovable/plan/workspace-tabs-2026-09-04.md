# Workspace tabs

Replace the static "YouTube Clipper" title bar with a browser-style tab strip, so several videos or channel exports can run at the same time in parallel sessions.

## What changes

Top bar becomes:

```text
[ Clip · Abu Lahyah ×] [ Export · @channel ×] [ + ]        Check   Local · Private
```

- Each workspace tab is a completely independent session: its own URL, video info, time range, format, preview, transcript and channel export job.
- Inside a tab, the existing Clip / Transcript / Downloads / Export sub-tabs stay exactly as they are today.
- Clicking `+` opens a new blank tab. Tabs can be closed with the `×`; closing the last one leaves a fresh blank tab.
- Background tabs keep running. A tab that is downloading or exporting shows a small activity dot, so you can start a clip in tab 1, switch to tab 2 and start an export there.
- Closing a tab that has an active job asks for confirmation and cancels that job.
- Tab titles auto-name from the loaded video/channel title (falling back to "New tab") and can be renamed by double-clicking the title.

## Shared across all tabs

Save-to folders and their custom labels, YouTube sign-in state, and the Downloads history are global — every tab shows the same lists, and a download started in any tab appears in the shared Downloads history.

## Persistence

Tab names and the order/active tab are remembered across app restarts. Tabs reopen blank — URLs, in-flight downloads and exports are not resumed.

## Technical notes

- New `src/context/WorkspaceContext.tsx` holds the tab list (`id`, `name`, `autoName`, `busy`) plus add/close/rename/select actions, persisted through the existing settings layer (`src/lib/persist.ts`, new key `clipper.workspaces`).
- `App.tsx` renders one `<ClipperProvider><ChannelExportProvider>` pair per tab, all kept mounted; only the active one is visible (hidden ones get `display:none` rather than unmounting) so in-flight jobs and SSE progress streams survive tab switches.
- The backend already keys downloads and exports by a per-request `jobId` (`/api/download?jobId=`, `/api/channel/export`), so concurrent jobs from multiple tabs need no server change.
- Shared state stays where it is: `src/lib/downloads.ts` and the save-folder settings are module-level external stores read via `useSyncExternalStore`, so all provider instances stay in sync automatically.
- Each tab reports its busy state and derived title up to the workspace context so the tab strip can show the name and activity dot.
- The keyboard shortcut listener in `PlayerControls.tsx` becomes active-tab-only, so hidden tabs don't react to key presses.
- New `src/components/WorkspaceTabs.tsx` for the strip, styled with the existing panel/hairline/accent tokens.
