/**
 * File: useLookMutations.ts
 * Path: src/renderer/src/features/settings/hooks/useLookMutations.ts
 * Description: Changes to a campaign's Final Cut look: read a chosen or dropped file, check it with
 *   parseLook, save it to the list of saved looks (the same file is never saved twice), pick a saved
 *   look or none, and delete an unused one. A campaign keeps only the id of its look.
 */
import { useCallback, useRef, useState } from "react";
import { parseLook } from "../../handoff/utils/look";
import type { EditorHandoffSettings } from "../../../shared/utils/fcpxml";
import { readSetting } from "../../../shared/utils/persist";
import { addLook, lookNameFromFile, looksStore, removeLook, type SavedLook } from "../../../shared/utils/looks";

type Editor = { settings: EditorHandoffSettings; onChange: (s: EditorHandoffSettings) => void };

/** What the native picker may hand back: the text, or a plain reason it could not. */
type Picked = string | { text?: string; name?: string; reason?: string; error?: string } | null | undefined;

export function useLookMutations(editor: Editor, looks: readonly SavedLook[]) {
  const [problem, setProblem] = useState("");
  const [open, setOpen] = useState(false);
  const [guide, setGuide] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const applyText = useCallback(
    (name: string, text: string) => {
      try {
        parseLook(text);
      } catch (err) {
        setProblem(err instanceof Error ? err.message : String(err));
        return;
      }
      const added = addLook(looksStore.get(), name, text);
      looksStore.set(added.list);
      editor.onChange({ ...editor.settings, lookId: added.id });
      setProblem("");
      setOpen(false);
    },
    [editor],
  );

  const readFile = useCallback(
    async (file: File) => {
      if (file.size > 5 * 1024 * 1024) return setProblem("That file is too big to be a Final Cut export.");
      applyText(lookNameFromFile(file.name), await file.text());
    },
    [applyText],
  );

  const choose = useCallback(async () => {
    const pick = window.electronAPI?.pickFinalCutLook;
    if (!pick) return inputRef.current?.click();
    const res = (await pick()) as Picked;
    if (!res) return;
    if (typeof res === "string") return applyText("My look", res);
    if (res.text) return applyText(res.name ? lookNameFromFile(res.name) : "My look", res.text);
    setProblem(res.reason ?? res.error ?? "That file could not be read.");
  }, [applyText]);

  const pickSaved = (id: string | null) => {
    editor.onChange({ ...editor.settings, lookId: id });
    setProblem("");
    setOpen(false);
  };

  const remove = (id: string) => {
    const stored = readSetting<Record<string, { lookId?: string | null }>>("clipper.editorHandoff", {});
    const used = [...Object.values(stored).map((s) => s?.lookId), editor.settings.lookId];
    looksStore.set(removeLook(looks, id, used));
  };

  return {
    problem,
    open,
    guide,
    inputRef,
    toggleOpen: () => setOpen((v) => !v),
    toggleGuide: () => setGuide((v) => !v),
    choose,
    readFile,
    pickSaved,
    remove,
  };
}
