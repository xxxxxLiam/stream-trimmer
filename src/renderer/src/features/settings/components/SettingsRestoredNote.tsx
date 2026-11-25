/**
 * File: SettingsRestoredNote.tsx
 * Path: src/renderer/src/features/settings/components/SettingsRestoredNote.tsx
 * Description: A quiet line at the bottom of the window: on launch when the settings file was unreadable and the
 *   backup copy was restored ("Clipr restored your settings from <time>."), when nothing could be restored, and when
 *   a save was refused. Dismisses on click; nothing else.
 */
import { useEffect, useState } from "react";
import { onSaveRefused } from "../../../shared/utils/persist";
import { lostNote, restoredNote, savedRefusedNote } from "../utils/restoredNote";

export default function SettingsRestoredNote() {
  const [text, setText] = useState("");
  useEffect(() => {
    let alive = true;
    void window.electronAPI?.settingsRestoredAt?.().then((iso) => alive && setText(restoredNote(iso))).catch(() => {});
    void window.electronAPI?.settingsLost?.().then((kind) => alive && kind && setText(lostNote(kind))).catch(() => {});
    const stop = onSaveRefused((key, reason) => alive && setText(savedRefusedNote(key, reason)));
    return () => {
      alive = false;
      stop();
    };
  }, []);
  if (!text) return null;
  return (
    <div role="status" className="fixed bottom-[16px] left-1/2 z-50 flex -translate-x-1/2 items-center gap-[12px] rounded-control border border-hairlineStrong bg-raised py-[8px] pl-[16px] pr-[8px] text-meta text-fg-dim">
      <span>{text}</span>
      <button type="button" onClick={() => setText("")} className="h-target rounded-control px-[12px] text-meta text-fg hover:bg-hover">
        OK
      </button>
    </div>
  );
}
