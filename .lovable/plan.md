# Rename save locations + Downloads history tab

## 1. Rename saved locations

Each saved folder gets an optional custom label.

- Add a nickname map (path -> label) persisted alongside the existing saved-folder list, so it survives app restarts like the folders do.
- In the "Save to" list, hovering a row reveals a pencil button next to the remove button. Clicking it turns the title into an inline text input; Enter or blur saves, Escape cancels.
- Title shows the custom name when set, otherwise the folder name (current behaviour). The full path line below stays unchanged.
- Clearing the name resets it back to the folder name.

## 2. New "Downloads" tab

Tabs become: Clip, Transcript, Downloads, Export.

Every completed save (clip file and channel/comment export bundles) appends an entry to a persisted history list:

- Title / filename
- Kind (clip or export)
- Format and time range where applicable
- Full saved path plus the label of the destination folder it went to
- Timestamp of the download

The Downloads tab lists newest first with:

- A "View" button that opens Finder / File Explorer at that file (same reveal action the toast uses)
- A remove button per row (removes from list only, never deletes the file)
- A "Clear all" action
- Empty state when nothing has been downloaded yet

In the browser (non-Electron) the list still records entries but the View button is hidden, since reveal is desktop-only.

## Technical notes

- Persistence uses the existing settings layer (`src/lib/persist.ts`) — `userData/settings.json` in Electron, localStorage in the browser. New keys: `clipper.saveDirNames`, `clipper.downloads` (capped at ~200 entries).
- State and actions (`renameSaveDir`, `downloads`, `revealDownload`, `removeDownload`, `clearDownloads`) live in `src/hooks/useClipper.ts` and are exposed through `ClipperContext`.
- History entries are pushed at the same points that currently set `savedNotice` (clip download and export saves).
- New component `src/components/DownloadsPanel.tsx`; `DestinationSelector.tsx` gains inline rename; `App.tsx` gains the fourth tab.
- No backend or Electron main-process changes needed — existing `file:showInFolder` and settings IPC cover it.
