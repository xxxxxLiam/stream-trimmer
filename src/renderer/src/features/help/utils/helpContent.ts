/**
 * File: helpContent.ts
 * Path: src/renderer/src/features/help/utils/helpContent.ts
 * Description: Every Help answer, in one place and never inside screen code (help-content-plan.md).
 *   Each answer lists the control labels it names; helpContent.test.ts checks every one against the
 *   app's own source, so renaming a control without updating Help fails the check.
 */

export type HelpAnswer = {
  id: string;
  question: string;
  paras: string[];
  /** Control labels the answer names, exactly as the app shows them. */
  labels: string[];
  /** Words people use for this that are not in the answer. */
  synonyms: string[];
};

export const HELP_ANSWERS: HelpAnswer[] = [
  {
    id: "make-clip",
    question: "How do I make a clip?",
    paras: [
      "Paste a YouTube link. Mark where the clip starts and ends: press I and O, drag on the timeline, or use the scissors tool. Then press Clip.",
      "Only that part downloads, into your campaign’s folder.",
    ],
    labels: ["Clip"],
    synonyms: ["download", "export", "save", "cut", "start", "begin", "new"],
  },
  {
    id: "clip-greyed",
    question: "Why is Clip greyed out?",
    paras: [
      "Clip needs a start and an end, and the part has to be long enough.",
      "Hover over Clip to see what’s missing, for example “Set an end first: click the timeline or press O”.",
    ],
    labels: ["Clip"],
    synonyms: ["grey", "gray", "disabled", "can't", "cant", "cannot", "dimmed", "won't", "wont", "stuck"],
  },
  {
    id: "where-clip",
    question: "Where did my clip go?",
    paras: [
      "Into your campaign’s folder. You can change it in Settings, under Clips folder.",
      "While you work it’s listed in Export, and later in History. Click the folder icon on its row to show it in Finder (File Explorer on Windows).",
      "If you picked an editor in the Clip menu, the clip opens there too. Some editors, such as CapCut, can’t take a project from Clipr. Then Clip opens the editor and shows the file in Finder (File Explorer on Windows), so you can drag it in.",
    ],
    labels: ["Settings", "Clips folder", "Export", "History", "Clip"],
    synonyms: ["download", "export", "save", "find", "folder", "missing", "lost", "location"],
  },
  {
    id: "join-parts",
    question: "How do I join two parts into one clip?",
    paras: [
      "Mark the first part and press + section to lock it in. Then mark the second part. The parts show in play order with the total length, and the skipped bit in between isn’t downloaded.",
      "Press Clip joined to get one file. In Markers, two flags that both have a range can be joined with Join.",
    ],
    labels: ["+ section", "Clip joined", "Markers", "Join"],
    synonyms: ["merge", "combine", "stitch", "two", "together", "one file"],
  },
  {
    id: "dubbed-audio",
    question: "How do I get dubbed audio?",
    paras: [
      "If a video has dubbed audio, the bar at the bottom shows an audio button, such as Original. Click it and tick the languages you want.",
      "The sentence then says how many clips Clip will make, for example “Makes 2 clips”, and you get one per language, such as “Honest Version” and “Honest Version ES”, in the same folder. Clipr remembers your ticks for each campaign.",
      "To hear a dub while you watch, use the gear in the video player.",
    ],
    labels: ["Original", "Clip"],
    synonyms: ["dub", "language", "languages", "translation", "translate", "spanish", "audio", "voice"],
  },
];

/** The rows under "More" that the search also covers. */
export const HELP_MORE = [
  { id: "replay-tips", label: "Replay tips", synonyms: ["tour", "tutorial", "tips", "show again"] },
  { id: "shortcuts", label: "Keyboard shortcuts", synonyms: ["keys", "hotkeys", "shortcut", "keyboard"] },
  { id: "report", label: "Report a problem", synonyms: ["bug", "broken", "error", "crash", "feedback", "contact"] },
  { id: "about", label: "About Clipr", synonyms: ["version", "update", "whats new"] },
] as const;

export type HelpMoreId = (typeof HELP_MORE)[number]["id"];

export type Shortcut = { keys: string; does: string };

/** Keys as decided in decisions-current.md. ⌘ reads as Ctrl on Windows (see platformKeys). */
export const SHORTCUTS: Shortcut[] = [
  { keys: "Space", does: "Play or pause" },
  { keys: "J  K  L", does: "Back, stop, forward (hold L to shuttle)" },
  { keys: "I", does: "Mark the start of a part" },
  { keys: "O", does: "Mark the end of a part" },
  { keys: "M", does: "Drop a flag" },
  { keys: "N", does: "Trim to the next flag" },
  { keys: "⌘ Enter", does: "Clip" },
  { keys: "⌘ B", does: "Save the part for later" },
  { keys: "R", does: "Retry the selected failed clip" },
  { keys: "⌘ L", does: "Loop the marked part" },
  { keys: "⌘ ,", does: "Settings" },
  { keys: "⌘ /", does: "Help" },
  { keys: "Esc", does: "Close a drawer or leave full screen" },
];
