/**
 * File: saveText.ts
 * Path: src/renderer/src/shared/utils/saveText.ts
 * Description: Save some text as a .txt file: the desktop app's save dialog, or the browser's download in the
 *   browser build. Says what happened in a short sentence the caller can show.
 */
export async function saveText(name: string, text: string): Promise<{ ok: boolean; cancelled?: boolean; message: string }> {
  const save = window.electronAPI?.saveTextFile;
  if (save) {
    const res = await save({ name, text });
    if (res.ok) return { ok: true, message: "Saved" };
    if (res.cancelled) return { ok: false, cancelled: true, message: "" };
    return { ok: false, message: res.error ?? "Could not save the file." };
  }
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { ok: true, message: "Saved" };
}

/** A safe file name for a transcript: "<title> - transcript.txt" or "<title> - clip words.txt". */
export function transcriptFileName(title: string | undefined, kind: "whole" | "clip"): string {
  const base = (title ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Transcript";
  return `${base} - ${kind === "clip" ? "clip words" : "transcript"}.txt`;
}
