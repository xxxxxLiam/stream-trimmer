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
  /** The export's own frame size and rate (e.g. fps "25"), once Engine reads them; the Timeline switch names it. */
  format?: { width: number; height: number; fps: string };
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

interface XmlNode {
  name: string;
  /** Raw text of the opening tag, e.g. `<filter-video ref="r3">`. */
  open: string;
  /** Offset of "<" of the opening tag, and one past the end of the closing tag. */
  start: number;
  end: number;
  /** Offset just after the opening tag (equal to `end` for a self-closing tag). */
  innerStart: number;
  children: XmlNode[];
}

/** Elements of an XML text with their exact spans. Throws when the tags do not balance. */
function readElements(src: string): XmlNode[] {
  const roots: XmlNode[] = [];
  const stack: XmlNode[] = [];
  let i = 0;
  const bad = () => new Error(NOT_AN_EXPORT);
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt < 0) break;
    if (src.startsWith("<!--", lt)) {
      const e = src.indexOf("-->", lt + 4);
      if (e < 0) throw bad();
      i = e + 3;
    } else if (src.startsWith("<![CDATA[", lt)) {
      const e = src.indexOf("]]>", lt + 9);
      if (e < 0) throw bad();
      i = e + 3;
    } else if (src.startsWith("<?", lt)) {
      const e = src.indexOf("?>", lt + 2);
      if (e < 0) throw bad();
      i = e + 2;
    } else if (src.startsWith("<!", lt)) {
      const e = src.indexOf(">", lt + 2);
      if (e < 0) throw bad();
      i = e + 1;
    } else if (src.startsWith("</", lt)) {
      const e = src.indexOf(">", lt);
      const name = e < 0 ? "" : src.slice(lt + 2, e).trim();
      const top = stack.pop();
      if (!top || top.name !== name) throw bad();
      top.end = e + 1;
      i = e + 1;
    } else {
      // Opening tag: attribute values may hold ">", so walk past quoted values.
      let j = lt + 1;
      let quote = "";
      for (; j < src.length; j++) {
        const c = src[j];
        if (quote) {
          if (c === quote) quote = "";
        } else if (c === '"' || c === "'") quote = c;
        else if (c === ">") break;
      }
      if (j >= src.length) throw bad();
      const name = /^[^\s/>]+/.exec(src.slice(lt + 1, j))?.[0];
      if (!name) throw bad();
      const selfClosing = src[j - 1] === "/";
      const node: XmlNode = { name, open: src.slice(lt, j + 1), start: lt, end: j + 1, innerStart: j + 1, children: [] };
      const parent = stack[stack.length - 1];
      (parent ? parent.children : roots).push(node);
      if (!selfClosing) stack.push(node);
      i = j + 1;
    }
  }
  if (stack.length > 0) throw bad();
  return roots;
}

function find(nodes: XmlNode[], name: string): XmlNode | undefined {
  for (const n of nodes) {
    if (n.name === name) return n;
    const inner = find(n.children, name);
    if (inner) return inner;
  }
  return undefined;
}

/**
 * What a look can carry from the clip it was made on: how it is scaled, graded
 * and sounds. Anything else on the clip (connected clips, titles, markers, notes)
 * belongs to that one project, so it stays behind, and every id it needs is carried.
 */
const KEPT_CHILDREN = /^(?:adjust-(?!colorConform$)[\w-]+|audio-channel-source|audio-role-source|filter-video|filter-video-mask|filter-audio)$/;

/** Read the look off the first clip on the first timeline of an exported project. */
export function parseLook(text: string): Look {
  const source = plainTextOf(text).trim();
  if (!source) throw new Error("That file is empty. Export your Final Cut project again.");

  const version = /<fcpxml\b[^>]*\sversion="(\d+\.\d+)"/.exec(source)?.[1];
  if (!version || !source.includes("<spine")) throw new Error(NOT_AN_EXPORT);
  const tree = readElements(source);

  const spine = find(tree, "spine");
  if (!spine) throw new Error(NOT_AN_EXPORT);
  const clipNode = spine.children.find((n) => n.name === "asset-clip");
  if (!clipNode) {
    throw new Error("No video clip was found in that export. Export a project with one clip on its timeline.");
  }
  const noLook = "The clip in that export has no look on it. Apply your look to the clip, then export again.";

  const kept = clipNode.children.filter((n) => KEPT_CHILDREN.test(n.name));
  if (kept.length === 0) throw new Error(noLook);
  let clip = kept.map((n) => source.slice(n.start, n.end)).join("\n");

  // Every effect id the kept elements use, anywhere inside them.
  const refs: string[] = [];
  const refPattern = /<[\w-]+\b[^>]*?\sref="([^"]+)"/g;
  let hit: RegExpExecArray | null;
  while ((hit = refPattern.exec(clip)) !== null) {
    if (!refs.includes(hit[1])) refs.push(hit[1]);
  }

  const resources = find(tree, "resources");
  const effectNodes = (resources?.children ?? []).filter((n) => n.name === "effect");
  const effects: string[] = [];
  const renamed = new Map<string, string>();
  const names: string[] = [];
  for (const id of refs) {
    const node = effectNodes.find((n) => new RegExp(`\\sid="${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(n.open));
    if (!node) throw new Error("The export is missing an effect that the clip uses. Export the project again.");
    const fresh = `fx${effects.length + 1}`;
    renamed.set(id, fresh);
    const whole = source.slice(node.start, node.end);
    effects.push(`    ${whole.replace(/\sid="[^"]*"/, ` id="${fresh}"`)}`);
    const name = /\sname="([^"]*)"/.exec(node.open)?.[1];
    if (name) names.push(name);
  }
  clip = clip.replace(
    /(<[\w-]+\b[^>]*?\sref=")([^"]+)(")/g,
    (_m, a: string, id: string, z: string) => `${a}${renamed.get(id) ?? id}${z}`,
  );

  const found: string[] = [];
  const scale = /<adjust-transform\b[^>]*\sscale="(-?[\d.]+)\s+-?[\d.]+"/.exec(clip)?.[1];
  if (scale) found.push(`Scale ${Math.round(Math.abs(Number(scale)) * 100)}%`);
  found.push(...names);
  if (/<adjust-volume\b/.test(clip)) found.push("Volume");
  if (/<adjust-loudness\b/.test(clip)) found.push("Loudness");
  if (/<adjust-voiceIsolation\b/.test(clip)) found.push("Voice Isolation");
  if (found.length === 0) found.push("Your changes");

  return { version, effects, clip, found };
}
