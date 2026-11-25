/**
 * File: cutNaming.ts
 * Path: src/renderer/src/features/clips/utils/cutNaming.ts
 * Description: The one name a clip gets when it is made: the name typed on the lane, else the
 *   engine's suggestion, else two words from the video's title, else "New clip". It is the saved
 *   file's name, the row's name and the editor project's name. A name already taken by a clip of
 *   this video gets " 2", " 3" (a language copy adds its tag after that). Pure.
 */
import { sameName, validateClipName } from "./clipName";
import { suggestProjectName } from "./projectName";

export function clipNameFor(args: {
  /** What the person typed or the engine suggested for the lane, best first. */
  candidates: ReadonlyArray<string | null | undefined>;
  videoTitle?: string;
  /** Names already saved for this video (file names without the extension). */
  taken: readonly string[];
}): string {
  const fromTitle = suggestProjectName({ label: args.videoTitle });
  const pick = [...args.candidates, fromTitle].find((c) => c && validateClipName(c).ok);
  const checked = pick ? validateClipName(pick) : null;
  const base = checked && checked.ok ? checked.name : "New clip";
  let name = base;
  for (let n = 2; args.taken.some((t) => sameName(t, name)); n++) name = `${base} ${n}`;
  return name;
}
