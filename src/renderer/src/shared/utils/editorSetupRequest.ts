/**
 * File: editorSetupRequest.ts
 * Path: src/renderer/src/shared/utils/editorSetupRequest.ts
 * Description: The Clip arrow menu tells the app which editor was just picked; the app decides whether to open
 *   that editor's setup in Settings. A plain listener list, so the menu needs no props from the app shell.
 */
type Listener = (editor: string) => void;
const listeners = new Set<Listener>();

export function requestEditorSetup(editor: string): void {
  listeners.forEach((l) => l(editor));
}

export function onEditorSetupRequest(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
