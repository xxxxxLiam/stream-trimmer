/**
 * File: helpContent.ts
 * Path: src/renderer/src/features/help/utils/helpContent.ts
 * Description: Every Help answer, in one place and never inside screen code (help-content-plan.md).
 *   Each answer lists the control labels it names; helpContent.test.ts checks every one against the
 *   app's own source, so renaming a control without updating Help fails the check.
 */

/** A small picture of the control a step names, drawn from the app's own parts (HelpStepPicture). */
export type HelpPic = "paste" | "clip" | "history" | "row-folder" | "add-section" | "audio" | "languages" | "clip-arrow" | "final-cut";

/** What Show me in Clipr does for a step: ring this control on the real screen. */
export type ShowStep = {
  /** CSS selector of the real control. */
  target: string;
  /** When several controls match the selector, the one whose text or label is this. */
  withText?: string;
  /** Finish the step by the real action: "click" (the ringed control), or keys such as "o". */
  advance?: "click" | string[];
};

export type HelpStep = { text: string; pic?: HelpPic; show?: ShowStep };

export type HelpAnswer = {
  id: string;
  question: string;
  /** Numbered steps, as few as possible. A long answer splits them under plain labels; numbering carries on. */
  groups: { label?: string; steps: HelpStep[] }[];
  /** At most one short note, under the steps. */
  note?: string;
  /** Control labels the answer names, exactly as the app shows them. */
  labels: string[];
  /** Words people use for this that are not in the answer. */
  synonyms: string[];
  /** Found by search only; the Common questions list keeps the five the board shows. */
  searchOnly?: boolean;
};

/** Every step of an answer, in order. */
export const stepsOf = (a: HelpAnswer): HelpStep[] => a.groups.flatMap((g) => g.steps);

/** All the words of an answer, for the search. */
export const answerText = (a: HelpAnswer): string => [a.question, ...stepsOf(a).map((s) => s.text), a.note ?? ""].join(" ");

const TIMELINE: ShowStep = { target: "#ui-timeline" };
const CLIP: ShowStep = { target: "#ui-cut", advance: "click" };

export const HELP_ANSWERS: HelpAnswer[] = [
  {
    id: "make-clip",
    question: "How do I make a clip?",
    groups: [
      {
        steps: [
          { text: "Paste a YouTube link.", pic: "paste", show: { target: 'input[type="url"]' } },
          { text: "Press I at the start and O at the end, or drag on the timeline.", show: { ...TIMELINE, advance: ["o"] } },
          { text: "Press Clip.", pic: "clip", show: CLIP },
        ],
      },
    ],
    note: "Only that part downloads.",
    labels: ["Clip"],
    synonyms: ["download", "export", "save", "cut", "start", "begin", "new", "mark", "range"],
  },
  {
    id: "clip-greyed",
    question: "Why is Clip greyed out?",
    groups: [{ steps: [{ text: "Set a start and an end.", show: TIMELINE }, { text: "Make the part long enough.", show: { target: "#ui-cut" } }] }],
    note: "Hover over Clip to see what’s missing.",
    labels: ["Clip"],
    synonyms: ["grey", "gray", "disabled", "can't", "cant", "cannot", "dimmed", "won't", "wont", "stuck"],
  },
  {
    id: "where-clip",
    question: "Where did my clip go?",
    groups: [
      {
        steps: [
          { text: "Open History.", pic: "history", show: { target: '[role="tab"]', withText: "History", advance: "click" } },
          { text: "Click the folder icon on the clip’s row.", pic: "row-folder", show: { target: '[aria-label="Show in Finder"]' } },
        ],
      },
    ],
    note: "Clips save to your campaign’s folder. Change it in Settings › Clips folder.",
    labels: ["History", "Settings", "Clips folder"],
    synonyms: ["download", "export", "save", "find", "folder", "missing", "lost", "location"],
  },
  {
    id: "join-parts",
    question: "How do I join two parts into one clip?",
    groups: [
      {
        steps: [
          { text: "Mark the first part, then press + section.", pic: "add-section", show: { target: "#ui-add-segment", advance: "click" } },
          { text: "Mark the second part.", show: TIMELINE },
          { text: "Press Clip. You get one file.", show: CLIP },
        ],
      },
    ],
    note: "The skipped bit isn’t downloaded.",
    labels: ["+ section", "Clip"],
    synonyms: ["merge", "combine", "stitch", "two", "together", "one file"],
  },
  {
    id: "dubbed-audio",
    question: "How do I get dubbed audio?",
    groups: [
      {
        steps: [
          { text: "Click the audio button in the bottom bar.", pic: "audio", show: { target: '[aria-label^="Audio:"]', advance: "click" } },
          { text: "Tick the languages you want.", pic: "languages", show: { target: '[aria-label^="Audio:"]' } },
          { text: "Press Clip.", pic: "clip", show: CLIP },
        ],
      },
    ],
    note: "You get one clip per language.",
    labels: ["Clip"],
    synonyms: ["dub", "language", "languages", "translation", "translate", "spanish", "audio", "voice"],
  },
  {
    id: "send-final-cut",
    question: "How do I send clips to Final Cut Pro?",
    searchOnly: true,
    groups: [
      {
        label: "Once per campaign",
        steps: [
          { text: "Click the arrow beside Clip.", pic: "clip-arrow", show: { target: '#ui-cut [aria-haspopup="menu"]', advance: "click" } },
          { text: "Tick Final Cut Pro.", pic: "final-cut", show: { target: '[role^="menuitem"]', withText: "Final Cut Pro" } },
          { text: "Open the campaign’s settings and choose your Final Cut library.", show: { target: "#ui-campaign-chip" } },
        ],
      },
      {
        label: "Each clip",
        steps: [{ text: "Mark the part, then press Clip.", show: CLIP }, { text: "Final Cut opens with the clip in the Export event." }],
      },
    ],
    note: "Only on a Mac. Not tested against a real Final Cut yet.",
    labels: ["Clip", "Final Cut Pro"],
    synonyms: ["final cut", "fcp", "editor", "premiere", "davinci", "resolve", "capcut", "handoff", "send", "open in"],
  },
  {
    id: "final-cut-look",
    question: "How do I make my Final Cut projects look like mine?",
    searchOnly: true,
    groups: [
      {
        label: "In Final Cut",
        steps: [
          { text: "Make a project with one clip. Add your usual colour, zoom, volume and audio settings, and don’t cut it." },
          { text: "Choose File, then Export XML, and save it." },
          { text: "Right-click the saved package, choose Show Package Contents, and find Info.fcpxml." },
        ],
      },
      { label: "In Clipr", steps: [{ text: "Open Settings, pick your campaign, and under Your look choose that file or drop it on the row." }] },
    ],
    note: "Each campaign has its own look, and a look you have uploaded can be picked again for another campaign.",
    labels: ["Settings", "Your look"],
    synonyms: ["look", "template", "preset", "colour grade", "color grade", "lut", "zoom", "volume", "final cut", "xml", "style"],
  },
  {
    id: "sign-in",
    question: "How do I sign in for 1080p?",
    searchOnly: true,
    groups: [
      {
        steps: [
          { text: "Sign in to YouTube in Chrome, Edge, Firefox or Brave. Clipr looks for it when it opens." },
          { text: "If it can’t find one, press Sign in for 1080p at the bottom of the window." },
          { text: "Export your cookies.txt as that page says, then drop it there or choose the file." },
        ],
      },
    ],
    note: "Signed out, clips come down at 360p.",
    labels: ["Sign in for 1080p"],
    synonyms: ["cookies", "cookie", "cookies.txt", "login", "log in", "account", "youtube", "360p", "1080p", "quality", "resolution", "age", "restricted", "members", "bot"],
  },
  {
    id: "undo-clip",
    question: "How do I undo a clip?",
    searchOnly: true,
    groups: [{ steps: [{ text: "Right after a clip is made, press the Undo ring on its row. It counts down 8 seconds." }] }],
    note: "After that, the file is in your campaign’s folder like any other.",
    labels: ["Undo"],
    synonyms: ["undo", "oops", "mistake", "delete", "remove", "take back", "cancel", "wrong", "by mistake"],
  },
  {
    id: "find-in-transcript",
    question: "How do I find a moment in the transcript?",
    searchOnly: true,
    groups: [
      {
        steps: [
          { text: "Open the Transcript tab.", show: { target: '[role="tab"]', withText: "Transcript", advance: "click" } },
          { text: "Type what was said in the search box above the lines.", show: { target: "#ui-transcript-search" } },
          { text: "Click a line to play from it." },
        ],
      },
    ],
    note: "Enter and Shift Enter move between matches.",
    labels: ["Transcript"],
    synonyms: ["transcript", "search", "words", "said", "captions", "subtitles", "find", "moment", "text"],
  },
  {
    id: "speed",
    question: "How do I change the playback speed?",
    searchOnly: true,
    groups: [{ steps: [{ text: "Click the speed button, 1x, under the video." }, { text: "Pick a faster or slower speed." }] }],
    note: "Hold L or J to shuttle forward or back.",
    labels: [],
    synonyms: ["speed", "faster", "slower", "slow", "fast", "2x", "playback", "rate"],
  },
  {
    id: "quota",
    question: "How do I change a campaign’s clips a day?",
    searchOnly: true,
    groups: [
      {
        steps: [
          { text: "Open Settings, then Campaigns.", show: { target: "#ui-settings", advance: "click" } },
          { text: "Pick the campaign and use − and + beside Clips a day." },
        ],
      },
    ],
    note: "The top bar counts clips made today against it.",
    labels: ["Settings", "Clips a day"],
    synonyms: ["quota", "daily", "target", "goal", "limit", "per day", "how many", "campaign", "today"],
  },
  {
    id: "fcp-layout",
    question: "How do I change how clips are laid out in Final Cut?",
    searchOnly: true,
    groups: [{ steps: [{ text: "Open Settings and pick your campaign." }, { text: "Under Final Cut Pro, open Layout and choose a template." }] }],
    note: "The preview shows how the event will look.",
    labels: ["Settings", "Layout"],
    synonyms: ["layout", "event", "keyword", "keywords", "collection", "template", "templates", "export event", "per video", "per day", "final cut"],
  },
  {
    id: "panels",
    question: "How do I move or hide panels?",
    searchOnly: true,
    groups: [
      {
        steps: [
          { text: "Open the Panels menu in the top bar.", show: { target: "#ui-panels-menu", advance: "click" } },
          { text: "Tick the panels you want, or choose Reset layout." },
        ],
      },
    ],
    note: "Drag a tab to move it to the other side.",
    labels: ["Panels", "Reset layout"],
    synonyms: ["panels", "panel", "layout", "move", "hide", "show", "tabs", "resize", "drag", "export", "history", "videos", "markers"],
  },
  {
    id: "timeline-zoom",
    question: "How do I zoom the timeline?",
    searchOnly: true,
    groups: [{ steps: [{ text: "Use − and + at the top right of the timeline to zoom, or pinch or hold Ctrl and scroll." }, { text: "Press Fit to see the whole video." }] }],
    labels: [],
    synonyms: ["zoom", "zoom in", "zoom out", "fit", "timeline", "wider", "closer", "bigger", "smaller", "magnify"],
  },
  {
    id: "window-zoom",
    question: "How do I make the text bigger?",
    searchOnly: true,
    groups: [{ steps: [{ text: "Press Ctrl and + (⌘ and + on a Mac) to make everything in the window bigger, and Ctrl and − to make it smaller." }, { text: "Ctrl and 0 puts it back to normal." }] }],
    labels: [],
    synonyms: ["text bigger", "text size", "large text", "font size", "font", "bigger text", "smaller text", "window zoom", "magnify", "scale", "readable"],
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
  { keys: "M", does: "Drop a flag at the playhead" },
  { keys: "A  B  D", does: "Timeline tools: Pointer, Scissors, Select range" },
  { keys: "F  H  Z", does: "Timeline tools: Flag, Hand, Zoom" },
  { keys: "Shift N", does: "Go to the next video" },
  { keys: "⌘ Enter", does: "Clip" },
  { keys: "⌘ B", does: "Save the marked part for later (it goes to the Export panel)" },
  { keys: "R", does: "Retry the failed clip" },
  { keys: "⌘ R", does: "Show the last saved clip in Finder (File Explorer on Windows)" },
  { keys: "⌘ L", does: "Loop the marked part" },
  { keys: "⌘ F", does: "Search the transcript" },
  { keys: "⌘ 1–9", does: "Switch to that video" },
  { keys: "⌘ Tab", does: "Next video (Shift for the one before)" },
  { keys: "⌘ ,", does: "Settings" },
  { keys: "⌘ ;", does: "Symbols" },
  { keys: "⌘ /", does: "Help" },
  { keys: "Esc", does: "Close a drawer or leave full screen" },
];
