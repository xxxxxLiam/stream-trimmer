/**
 * File: saveTextFile.ts
 * Path: src/main/features/files/services/saveTextFile.ts
 * Description: "Save as .txt…" on a clip list: the person picks the place in the native save dialog, and
 *   the text is written there as a .txt file. The chosen path is theirs, so nothing else is checked
 *   beyond the extension and a size cap.
 */
import fs from "node:fs";

export type SaveTextResult = { ok: true; path: string } | { ok: false; cancelled?: true; error?: string };

const MAX_BYTES = 4 * 1024 * 1024;

export async function saveTextFile(args: {
  /** Opens the save dialog with this file name; resolves to the chosen path, or null when cancelled. */
  choose: (suggestedName: string) => Promise<string | null>;
  name: string;
  text: string;
  write?: (path: string, text: string) => Promise<void>;
}): Promise<SaveTextResult> {
  if (Buffer.byteLength(args.text, "utf8") > MAX_BYTES) return { ok: false, error: "That list is too long to save." };
  const picked = await args.choose(args.name);
  if (!picked) return { ok: false, cancelled: true };
  const target = /\.txt$/i.test(picked) ? picked : `${picked}.txt`;
  try {
    await (args.write ?? ((p, t) => fs.promises.writeFile(p, t, "utf8")))(target, args.text);
    return { ok: true, path: target };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The file could not be saved." };
  }
}
