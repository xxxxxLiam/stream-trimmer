/**
 * File: LookEditor.tsx
 * Path: src/renderer/src/features/handoff/components/LookEditor.tsx
 * Description: The "my look" box in the editor handoff dialog. The user pastes
 *   the text of a Final Cut XML export of one clip that already has their look
 *   on it, and turns the look on or off. Nothing personal is built into the app.
 * Contract: controlled. `onChange` receives only the fields that changed.
 */
import { useId } from "react";
import type { EditorHandoffSettings } from "../../../shared/utils/fcpxml";
import { parseLook } from "../utils/look";

export type LookEditorProps = {
  settings: EditorHandoffSettings;
  onChange: (patch: Partial<EditorHandoffSettings>) => void;
};

export default function LookEditor({ settings, onChange }: LookEditorProps) {
  const areaId = useId();
  const text = settings.lookXml ?? "";

  let found = "";
  let problem = "";
  if (text.trim()) {
    try {
      found = parseLook(text).found.join(", ");
    } catch (err) {
      problem = err instanceof Error ? err.message : String(err);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-body">
        <input
          type="checkbox"
          checked={settings.applyLook === true}
          onChange={(e) => onChange({ applyLook: e.target.checked })}
        />
        Apply my look to every project
      </label>

      <div className="flex flex-col gap-2">
        <label htmlFor={areaId} className="text-body">
          Final Cut export of one clip with your look
        </label>
        <textarea
          id={areaId}
          className="field h-40 resize-y py-2 font-mono text-meta"
          spellCheck={false}
          placeholder="Paste the text of Info.fcpxml here"
          value={text}
          onChange={(e) => onChange({ lookXml: e.target.value })}
        />
        <span className="t-meta">
          In Final Cut choose File, then Export XML. Right-click the saved .fcpxmld, choose Show Package Contents, and open
          Info.fcpxml in TextEdit. Do not double-click it, that imports it. Paste everything here.
        </span>
      </div>

      {problem && (
        <div role="alert" className="card-alert px-3 py-2 text-body">
          {problem}
        </div>
      )}
      {found && <p className="t-meta m-0">Found: {found}</p>}
    </div>
  );
}
