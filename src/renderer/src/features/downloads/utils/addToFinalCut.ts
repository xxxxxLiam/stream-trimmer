/**
 * File: addToFinalCut.ts
 * Path: src/renderer/src/features/downloads/utils/addToFinalCut.ts
 * Description: "Add to Final Cut" for clips saved in a location (B-roll, sound effects, music). Picks a library fresh every time
 *   (the picker starts in the last folder used), skips clips that library already has, writes one FCPXML (event "Assets", a
 *   keyword collection per location, files referenced where they sit, never copied), opens it in Final Cut and records
 *   what was added. The bridge is passed in so this stays free of Electron.
 */
import { buildSessionFcpxml, type RawProbe, type SessionClip } from "../../../shared/utils/fcpxml";
import { sourceLinkFor } from "../../../shared/utils/videoSource";
import type { DownloadEntry } from "../../../shared/utils/downloads";

export type FinalCutBridge = {
  pickAssetsLibrary?: () => Promise<string | null>;
  editor?: {
    probe: (file: string) => Promise<({ ok: true } & RawProbe) | { ok: false; error: string }>;
    writeFcpxml: (p: { dirPath: string; filename: string; contents: string }) => Promise<{ ok: boolean; error?: string; path?: string }>;
    openWith: (p: { app: "finalcut"; file?: string }) => Promise<{ ok: boolean; error?: string }>;
    pathExists?: (target: string) => Promise<{ ok: boolean; exists?: boolean; isDirectory?: boolean; error?: string }>;
    assetsLibraryAdded: (p: { library: string; files: string[] }) => Promise<{ ok: boolean; newFiles?: string[]; error?: string }>;
    recordAssetsLibraryAdded: (p: { library: string; files: string[] }) => Promise<{ ok: boolean; error?: string }>;
  };
};

export type Addable = { entry: DownloadEntry; location: string };

export type AddResult =
  | { state: "cancelled" }
  | { state: "failed"; message: string }
  /** `added` and `already` are entry ids: both end up "In Final Cut". */
  | { state: "done"; message: string; added: string[]; already: string[] };

const plural = (n: number) => `${n} ${n === 1 ? "clip" : "clips"}`;

export async function addToFinalCut(items: readonly Addable[], api: FinalCutBridge | undefined): Promise<AddResult> {
  const editor = api?.editor;
  if (!api?.pickAssetsLibrary || !editor) return { state: "failed", message: "This needs the desktop app." };
  const usable = items.filter((i) => i.entry.path);
  if (usable.length === 0) return { state: "failed", message: "There is no file to add." };
  const dir = usable.find((i) => i.entry.dir)?.entry.dir;
  if (!dir) return { state: "failed", message: "These clips have no folder to save the Final Cut file in." };

  const library = await api.pickAssetsLibrary();
  if (!library) return { state: "cancelled" };

  // Clips this library already holds are skipped, never added twice.
  const files = usable.map((i) => i.entry.path as string);
  const known = await editor.assetsLibraryAdded({ library, files });
  if (!known.ok) return { state: "failed", message: known.error ?? "Could not check the library." };
  const fresh = new Set(known.newFiles ?? files);
  const toAdd = usable.filter((i) => fresh.has(i.entry.path as string));
  const already = usable.filter((i) => !fresh.has(i.entry.path as string)).map((i) => i.entry.id);
  if (toAdd.length === 0) return { state: "done", message: `${plural(usable.length)} already in Final Cut.`, added: [], already };

  const clips: SessionClip[] = toAdd.map(({ entry, location }) => ({
    id: entry.label.replace(/\.[^.]+$/, "").trim() || (entry.clipId ?? entry.id),
    label: undefined,
    path: entry.path as string,
    segments: entry.segments ?? [],
    sourceUrl: entry.videoId ? sourceLinkFor(entry.videoId) : undefined,
    sourceTitle: entry.videoTitle || undefined,
    cutAt: entry.savedAt || undefined,
    keyword: location,
  }));

  let built;
  try {
    built = await buildSessionFcpxml(
      clips,
      "Assets",
      async (file) => {
        const r = await editor.probe(file);
        if (!r.ok) throw new Error(r.error);
        return r;
      },
      {
        library,
        libraryExists: async (local) => {
          if (!editor.pathExists) return false;
          const r = await editor.pathExists(local);
          return r.ok && r.exists === true && r.isDirectory !== false;
        },
      },
    );
  } catch (err) {
    return { state: "failed", message: err instanceof Error ? err.message : String(err) };
  }
  if (built.included === 0) return { state: "failed", message: built.skipped[0]?.reason ?? "None of the clips could be read." };

  const written = await editor.writeFcpxml({ dirPath: dir, filename: built.filename, contents: built.xml });
  if (!written.ok || !written.path) return { state: "failed", message: written.error ?? "The Final Cut file could not be saved." };
  const opened = await editor.openWith({ app: "finalcut", file: written.path });
  if (!opened.ok) return { state: "failed", message: opened.error ?? "Final Cut would not open." };

  // Recorded only once Final Cut has it, and only the clips that really went in.
  const skippedIds = new Set(built.skipped.map((s) => s.id));
  const wentIn = toAdd.filter((i) => !skippedIds.has(i.entry.label.replace(/\.[^.]+$/, "").trim() || (i.entry.clipId ?? i.entry.id)));
  await editor.recordAssetsLibraryAdded({ library, files: wentIn.map((i) => i.entry.path as string) });
  const tail = [already.length ? `${already.length} already there.` : "", built.skipped.length ? `${built.skipped.length} could not be read.` : ""].filter(Boolean).join(" ");
  return { state: "done", message: `Added ${plural(wentIn.length)} to Final Cut.${tail ? ` ${tail}` : ""}`, added: wentIn.map((i) => i.entry.id), already };
}
