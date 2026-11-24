/**
 * File: helpTasks.ts
 * Path: src/renderer/src/features/help/utils/helpTasks.ts
 * Description: The help catalogue as data plus a fuzzy search (BUILD-SPEC section 7).
 *   A task is 2 to 4 steps, each ONE short line. A task that needs more is two tasks;
 *   helpTasks.test.ts enforces this. Each step points at a live control by `anchorId`
 *   (the element's DOM id). Channel-export tasks live in CHANNEL_HELP_TASKS so a
 *   public build, which compiles the exporter out, can drop them.
 *
 * anchorId rule: an anchor is the id a control ACTUALLY carries in the running app. A step may
 *   not invent an id and hope a component adopts it: helpTasks.test.ts reads src/ and fails when
 *   an anchor is not rendered by the component that is meant to render it, in the state the step
 *   needs (F-1: 19 of 26 invented ids were absent and 8 of 14 tutorials were dead). Where the
 *   precise control has no id yet, the step points at the nearest real container and
 *   PENDING_PRECISE_ANCHORS (below) names the id the owning component should add.
 */

export type HelpStep = {
  /** What to do. ONE line, imperative. */
  do: string;
  /** Why it matters / what it does. One short line. */
  why: string;
  /**
   * DOM id of the control to highlight, or null when the step happens outside the app (a browser,
   * a native dialog) or no control carries an id yet. The drawer shows no "not on screen" notice
   * for null. helpTasks.test.ts lists every null and why.
   */
  anchorId: string | null;
};

export type HelpTask = {
  id: string;
  /** Verb-first. */
  title: string;
  aliases: string[];
  steps: HelpStep[];
};

export const MAX_STEPS = 4;
export const MIN_STEPS = 2;
export const MAX_DO_LENGTH = 90;

/** Every anchor id a step may use. Each is the id of a real element; the test proves it. */
export const ANCHORS = {
  sourceChip: "ui-source-chip",
  campaignChip: "ui-campaign-chip",
  copyBlocks: "ui-copy-blocks",
  symbols: "ui-symbols",
  footerClips: "ui-footer-clips",
  footerData: "ui-footer-data",
  footerFormat: "ui-footer-format",
  /** The left panels (Videos, Transcript, Markers). */
  transcriptColumn: "ui-panels-left",
  /** The centre panels: Preview over Timeline. */
  centreColumn: "ui-panels-centre",
  markIn: "ui-mark-in",
  markOut: "ui-mark-out",
  addSegment: "ui-add-segment",
  stitchedTotal: "ui-stitched-total",
  usedWarning: "ui-overlap-warning",
  /** "Cut as one file". */
  cut: "ui-cut",
  copyTranscript: "ui-copy-block-transcript",
  copyScript: "ui-copy-block-script",
  clipsTabAll: "clips-tab-all",
  clipsPanel: "clips-panel",
  /** The YouTube sign-in chip's button in the header. */
  youtubeStatus: "help-anchor-youtube-status",
  /** The segment list (only while there are segments). */
  segmentList: "ui-segment-list",
  timeline: "ui-timeline",
  transcriptSearch: "ui-transcript-search",
  transcriptLines: "ui-transcript-lines",
  /** The campaign menu's list (only while the menu is open). */
  campaignList: "ui-campaign-list",
  /** The symbols palette's results (only while it is open). */
  symbolList: "ui-symbol-list",
  /** The first row of "All saved" (only when something has been saved). */
  savedClip: "ui-saved-clip",
} as const;

/**
 * Ids the catalogue WANTS so a step can highlight the exact control rather than its container,
 * but that no component carries yet. Empty now: every one T8 listed exists and was moved into
 * ANCHORS (the channel exporter's two are literals in CHANNEL_HELP_TASKS, kept out of this file's
 * public surface). The test fails if an id listed here appears in a component, so a new wish
 * cannot rot unnoticed.
 */
export const PENDING_PRECISE_ANCHORS: Readonly<Record<string, string>> = {};

const A = ANCHORS;

export const HELP_TASKS: HelpTask[] = [
  {
    id: "cut-clip",
    title: "Cut a clip",
    aliases: ["download", "trim", "make a clip", "save a clip", "export a clip", "start end"],
    steps: [
      { do: "Click a transcript line where the clip starts.", why: "Moves the video to that moment.", anchorId: A.transcriptColumn },
      { do: "Press I to mark in, then O to mark out.", why: "Sets the start and end of the range.", anchorId: A.markIn },
      { do: "Press Cut as one file.", why: "Downloads the range into your clips folder.", anchorId: A.cut },
    ],
  },
  {
    id: "stitch-two-moments",
    title: "Pull two moments into one clip",
    aliases: ["stitch", "join", "combine", "merge", "two segments", "multi segment", "concatenate"],
    steps: [
      { do: "Mark the first moment, then press Add segment.", why: "Keeps that range and clears the marks.", anchorId: A.addSegment },
      { do: "Mark the second moment and add it too.", why: "Segments are joined in list order.", anchorId: A.addSegment },
      { do: "Press Cut as one file.", why: "One download, joined into a single file.", anchorId: A.cut },
    ],
  },
  {
    id: "find-by-words",
    title: "Find a moment by what was said",
    aliases: ["search transcript", "look up", "locate", "keyword", "phrase", "quote"],
    steps: [
      { do: "Press Cmd F and type a word or phrase.", why: "Searches every caption line, not just those on screen.", anchorId: A.transcriptSearch },
      { do: "Press Enter to jump to the next match.", why: "The video seeks to that line.", anchorId: A.transcriptLines },
    ],
  },
  {
    id: "nudge-edge",
    title: "Nudge an edge frame by frame",
    aliases: ["fine tune", "adjust start", "adjust end", "trim edge", "precise", "frame", "arrow keys"],
    steps: [
      { do: "Click the edge you want to move.", why: "That edge becomes the active one.", anchorId: A.timeline },
      { do: "Press the arrow keys; add Shift for one frame.", why: "Plain arrows move 0.25s, Shift moves one frame.", anchorId: A.timeline },
    ],
  },
  {
    id: "check-unused",
    title: "Check a moment has not been used",
    aliases: ["reuse", "duplicate", "already published", "overlap", "used before", "no reuse"],
    steps: [
      { do: "Look for the grey hatch and the used tag.", why: "Marks ranges earlier clips already took.", anchorId: A.transcriptColumn },
      { do: "Read the overlap warning when you cut.", why: "Names the clip that used it before.", anchorId: A.usedWarning },
    ],
  },
  {
    id: "reorder-segments",
    title: "Reorder segments",
    aliases: ["move segment", "change order", "drag", "sequence", "remove segment", "delete segment"],
    steps: [
      { do: "Drag a segment up or down in the list.", why: "The clip plays segments in this order.", anchorId: A.segmentList },
      { do: "Press the x on a segment to remove it.", why: "Drops that range from the clip.", anchorId: A.segmentList },
    ],
  },
  {
    id: "switch-campaign",
    title: "Switch campaign",
    aliases: ["change campaign", "new campaign", "other campaign", "project", "client", "account"],
    steps: [
      { do: "Open the campaign chip in the header.", why: "Lists every campaign you have made.", anchorId: A.campaignChip },
      { do: "Pick a campaign from the list.", why: "Re-points length band, format and both folders.", anchorId: A.campaignList },
    ],
  },
  {
    id: "change-clips-folder",
    title: "Change where clips save",
    aliases: ["save folder", "output folder", "download folder", "directory", "destination", "clips location"],
    steps: [
      { do: "Click the Clips folder chip in the footer.", why: "Opens the folder picker for this campaign.", anchorId: A.footerClips },
      { do: "Choose a folder.", why: "New clips land here. Data exports stay separate.", anchorId: A.footerClips },
    ],
  },
  {
    id: "change-data-folder",
    title: "Change where exported data saves",
    aliases: ["data folder", "csv location", "research folder", "export location", "csv folder"],
    steps: [
      { do: "Click the Data folder chip in the footer.", why: "Opens the folder picker for exported data.", anchorId: A.footerData },
      { do: "Choose a folder.", why: "Keeps large CSVs apart from your clips.", anchorId: A.footerData },
    ],
  },
  {
    id: "copy-transcript",
    title: "Copy a transcript for a chat",
    aliases: ["paste transcript", "handoff", "send transcript", "copy captions", "copy text", "timecodes"],
    steps: [
      { do: "Open Copy blocks (Cmd Shift C).", why: "One button per block of text.", anchorId: A.copyBlocks },
      { do: "Press the transcript block you need.", why: "Copies it with source video timecodes.", anchorId: A.copyTranscript },
    ],
  },
  {
    id: "copy-script-lines",
    title: "Copy the script lines",
    aliases: ["verbatim", "speaker lines", "script", "quote lines", "copy segments"],
    steps: [
      { do: "Add your segments, then open Copy blocks.", why: "Script lines follow your segment order.", anchorId: A.copyBlocks },
      { do: "Press Script lines, verbatim.", why: "Copies speaker, timecode and text per line.", anchorId: A.copyScript },
    ],
  },
  {
    id: "insert-symbol",
    title: "Insert a symbol or honorific",
    aliases: ["arabic", "bismillah", "salawat", "sallallahu", "phrase", "glyph", "special character", "paste symbol"],
    steps: [
      { do: "Open Symbols (Cmd ;).", why: "A click-to-copy palette that stays on top.", anchorId: A.symbols },
      { do: "Search, then click the entry you want.", why: "It copies at once; paste where you need it.", anchorId: A.symbolList },
    ],
  },
  {
    id: "fix-360p",
    title: "Fix a 360p download",
    aliases: ["low quality", "blurry", "resolution", "cookies", "sign in", "session expired", "1080p", "720p"],
    steps: [
      { do: "Check the sign-in chip in the header.", why: "360p means YouTube sees no valid session.", anchorId: A.youtubeStatus },
      { do: "Export youtube.com cookies from your browser.", why: "A cookies.txt extension makes the file.", anchorId: null },
      { do: "Drop the cookies file onto the app.", why: "Signs you in again; then retry the cut.", anchorId: null },
    ],
  },
  {
    id: "recut-saved",
    title: "Re-cut a saved clip",
    aliases: ["recut", "redo", "edit clip", "change clip", "adjust saved", "reopen", "fix clip"],
    steps: [
      { do: "Open the All saved tab in the clips column.", why: "Lists every clip you have cut.", anchorId: A.clipsTabAll },
      { do: "Click the clip to load its segments.", why: "They return to the mark bar for adjusting.", anchorId: A.savedClip },
      { do: "Adjust, then press Cut as one file.", why: "Writes a new file from the new ranges.", anchorId: A.cut },
    ],
  },
];

/** Channel-export tasks. Present only when the exporter is built in. */
export const CHANNEL_HELP_TASKS: HelpTask[] = [
  {
    id: "export-channel",
    title: "Export a channel's data",
    aliases: ["channel export", "csv", "scrape", "comments", "video list", "research data"],
    steps: [
      { do: "Open Channel data in the header.", why: "The exporter is its own screen.", anchorId: "ui-channel-link" },
      { do: "Paste the channel link and press Start.", why: "Streams rows to your data folder as it goes.", anchorId: "ui-channel-start" },
    ],
  },
  {
    id: "stop-run",
    title: "Stop a run and keep what it got",
    aliases: ["cancel", "abort", "halt", "interrupt", "stop export", "partial"],
    steps: [
      { do: "Press Stop while the export runs.", why: "Ends the run without losing rows so far.", anchorId: "ui-channel-stop" },
      { do: "Check your data folder for the file.", why: "Everything fetched before Stop is saved.", anchorId: "ui-footer-data" },
    ],
  },
];

/* ------------------------------ Search ------------------------------ */

const STOP_WORDS = new Set([
  "a", "an", "the", "to", "of", "for", "in", "on", "my", "me", "i", "how", "do", "can",
  "and", "or", "it", "is", "what", "where", "want", "need", "with", "from", "into", "this",
]);

function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ']+/g, " ")
    .split(" ")
    .map((w) => w.replace(/'/g, ""))
    .filter(Boolean);
}

function queryTokens(q: string): string[] {
  const all = tokenize(q);
  const kept = all.filter((w) => !STOP_WORDS.has(w));
  // A query of only filler words asks for nothing in particular: show everything.
  return kept.map(stem);
}

/** True when `a` and `b` differ by one insert, delete, substitution or swap. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    // Adjacent transposition ("campiagn") counts as one typo.
    for (let k = 0; k < a.length - 1; k++) {
      if (a[k] !== b[k]) {
        if (a[k] === b[k + 1] && a[k + 1] === b[k] && a.slice(k + 2) === b.slice(k + 2)) return true;
        break;
      }
    }
  }
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Score one query token against a list of words. 0 = no match. */
function tokenScore(tok: string, words: string[]): number {
  let best = 0;
  for (const raw of words) {
    const w = stem(raw);
    let s = 0;
    if (w === tok) s = 4;
    else if (w.startsWith(tok)) s = 3;
    else if (tok.length >= 3 && w.includes(tok)) s = 2;
    else if (tok.length >= 4 && w.length >= 4 && withinOneEdit(tok, w)) s = 1.5;
    if (s > best) best = s;
  }
  return best;
}

/**
 * Rank tasks for a query. Every meaningful query word must match the title or an
 * alias (prefix, substring or one typo). Title hits outrank alias hits. An empty
 * query returns every task in catalogue order.
 */
export function searchTasks(tasks: readonly HelpTask[], query: string): HelpTask[] {
  const toks = queryTokens(query);
  if (toks.length === 0) return [...tasks];
  const scored: { task: HelpTask; score: number; order: number }[] = [];
  tasks.forEach((task, order) => {
    const titleWords = tokenize(task.title);
    const aliasWords = task.aliases.flatMap(tokenize);
    let total = 0;
    for (const tok of toks) {
      const t = tokenScore(tok, titleWords);
      const a = tokenScore(tok, aliasWords);
      const s = Math.max(t * 1.5, a);
      if (s === 0) return;
      total += s;
    }
    scored.push({ task, score: total, order });
  });
  scored.sort((x, y) => y.score - x.score || x.order - y.order);
  return scored.map((s) => s.task);
}
