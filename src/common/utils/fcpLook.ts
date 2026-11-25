/**
 * File: fcpLook.ts
 * Path: src/common/utils/fcpLook.ts
 * Description: A user's own Final Cut "look" (scale, colour effects, LUT, audio
 *   enhancements). It is read from the text of a Final Cut XML export of one
 *   clip that already has the look on it, so nothing personal is built into
 *   the app. Pure string work: no disk, no Electron. In common because main reads
 *   and checks the file a user picks, and the renderer writes the look into projects.
 */

export interface Look {
  /** FCPXML version of the export the look came from, e.g. "1.15". */
  version: string;
  /** Effect resources, one per line, already renamed to fx1, fx2 and so on. */
  effects: string[];
  /** The clip's child elements (scale, audio, effects) with effect refs renamed. */
  clip: string;
  /** Plain words for what was found, shown in the dialog. */
  found: string[];
}

const NOT_AN_EXPORT =
  "That does not look like a Final Cut XML export. In Final Cut choose File, then Export XML, and choose that file here.";

/**
 * TextEdit saves rich text (.rtf) by default, which wraps the XML in a header,
 * ends every line with a backslash and closes with a brace. Those stray
 * characters would land inside the project Final Cut opens, so peel them off.
 * Plain XML passes through untouched.
 */
export function plainTextOf(text: string): string {
  if (!/^\s*\{\\rtf/.test(text)) return text;
  const first = text.indexOf("<");
  const last = text.lastIndexOf(">");
  if (first < 0 || last < first) return text;
  return text
    .slice(first, last + 1)
    .replace(/\\\r?\n/g, "\n")
    .replace(/\\par\b ?/g, "\n")
    .replace(/\\tab\b ?/g, "\t")
    .replace(/\\'([0-9a-f]{2})/gi, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u(-?\d+)\??/g, (_m, n: string) => String.fromCharCode(Number(n) < 0 ? Number(n) + 65536 : Number(n)))
    .replace(/\\([{}\\])/g, "$1");
}

/** Read the look off the first clip on the first timeline of an exported project. */
export function parseLook(text: string): Look {
  const source = plainTextOf(text).trim();
  if (!source) throw new Error("That file is empty. Export your Final Cut project again.");

  const version = /<fcpxml\b[^>]*\sversion="(\d+\.\d+)"/.exec(source)?.[1];
  const spine = source.indexOf("<spine");
  if (!version || spine < 0) throw new Error(NOT_AN_EXPORT);

  const open = source.indexOf("<asset-clip", spine);
  const openEnd = open < 0 ? -1 : source.indexOf(">", open);
  if (open < 0 || openEnd < 0) {
    throw new Error("No video clip was found in that export. Export a project with one clip on its timeline.");
  }
  const noLook = "The clip in that export has no look on it. Apply your look to the clip, then export again.";
  if (source[openEnd - 1] === "/") throw new Error(noLook);
  const close = source.indexOf("</asset-clip>", openEnd);
  if (close < 0) throw new Error(NOT_AN_EXPORT);

  let clip = source
    .slice(openEnd + 1, close)
    .replace(/<note>[\s\S]*?<\/note>/g, "")
    .replace(/<metadata>[\s\S]*?<\/metadata>/g, "")
    .replace(/<adjust-colorConform\b[^>]*\/>/g, "")
    .replace(/<(?:keyword|marker|chapter-marker|rating|analysis-marker)\b[^>]*\/>/g, "")
    .trim();
  if (!clip) throw new Error(noLook);

  const refs: string[] = [];
  const refPattern = /<filter-(?:video|audio)\b[^>]*?\sref="([^"]+)"/g;
  let hit: RegExpExecArray | null;
  while ((hit = refPattern.exec(clip)) !== null) {
    if (!refs.includes(hit[1])) refs.push(hit[1]);
  }

  const effects: string[] = [];
  const renamed = new Map<string, string>();
  const names: string[] = [];
  for (const id of refs) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const line = new RegExp(`<effect\\b[^>]*\\sid="${escaped}"[^>]*/>`).exec(source)?.[0];
    if (!line) throw new Error("The export is missing an effect that the clip uses. Export the project again.");
    const fresh = `fx${effects.length + 1}`;
    renamed.set(id, fresh);
    effects.push(`    ${line.replace(/\sid="[^"]*"/, ` id="${fresh}"`)}`);
    const name = /\sname="([^"]*)"/.exec(line)?.[1];
    if (name) names.push(name);
  }
  clip = clip.replace(
    /(<filter-(?:video|audio)\b[^>]*?\sref=")([^"]+)(")/g,
    (_m, a: string, id: string, z: string) => `${a}${renamed.get(id) ?? id}${z}`,
  );

  const found: string[] = [];
  const scale = /<adjust-transform\b[^>]*\sscale="([\d.]+)\s+[\d.]+"/.exec(clip)?.[1];
  if (scale) found.push(`Scale ${Math.round(Number(scale) * 100)}%`);
  found.push(...names);
  if (/<adjust-volume\b/.test(clip)) found.push("Volume");
  if (/<adjust-loudness\b/.test(clip)) found.push("Loudness");
  if (/<adjust-voiceIsolation\b/.test(clip)) found.push("Voice Isolation");
  if (found.length === 0) found.push("Your changes");

  return { version, effects, clip, found };
}
