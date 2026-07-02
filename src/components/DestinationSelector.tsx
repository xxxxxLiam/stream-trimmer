/**
 * File: DestinationSelector.tsx
 * Path: src/components/DestinationSelector.tsx
 * Description: Electron-only save-folder picker; hidden in the browser.
 */
import { Folder2Open, PencilSquare } from "react-bootstrap-icons";
import { useClipperContext } from "../context/ClipperContext";

export default function DestinationSelector() {
  const { isElectron, saveDir, pickSaveDir } = useClipperContext();
  if (!isElectron) {
    return (
      <div className="rounded-row border border-dashed border-hairline px-3 py-2 text-[11px] text-fg-faint">
        Files save to your browser's Downloads folder. Install the desktop app to
        choose a custom folder.
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={pickSaveDir}
      className="group flex items-center gap-2 rounded-row border border-hairline bg-panel-raised px-3 py-2 text-left text-[12px] text-fg-muted transition-colors hover:border-accent/60"
      title="Change download folder"
    >
      <Folder2Open size={13} className="shrink-0 text-fg-muted" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-fg-faint">
          Save to
        </div>
        <div className="truncate text-fg">
          {saveDir || "Choose a folder…"}
        </div>
      </div>
      <PencilSquare
        size={12}
        className="shrink-0 text-fg-faint opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
  );
}