/**
 * File: brandedFolder.ts
 * Path: src/main/features/files/services/brandedFolder.ts
 * Description: Turns a folder the person picked into the Clipr folder clips go to (see common/utils/brandedFolder),
 *   reusing a Clipr folder that is already there. Reads the picked folder's names only; makes nothing: the folder is
 *   created with the first clip.
 */
import fs from "node:fs";
import { brandedDir, type CampaignKind } from "../../../../common/utils/brandedFolder";

export function resolveBrandedDir(
  chosen: string,
  kind: CampaignKind,
  name: string,
  readNames: (dir: string) => string[] = listFolderNames,
): string {
  let existing: string[] = [];
  try {
    existing = readNames(chosen);
  } catch {
    // An unreadable or missing folder has nothing to reuse; the rule still gives the same answer.
  }
  return brandedDir(chosen, kind, name, existing);
}

function listFolderNames(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
}
