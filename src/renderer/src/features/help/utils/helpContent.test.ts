/**
 * File: helpContent.test.ts
 * Description: Help stays true to the app. Every control label an answer names must appear in the
 *   app's own source (so renaming a control without updating Help fails here), and the instant
 *   search finds each answer from the words people use, including the editor synonyms.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { HELP_ANSWERS, SHORTCUTS } from "./helpContent";
import { searchHelp } from "./helpSearch";

const ROOT = join(process.cwd(), "src/renderer/src");

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (p.endsWith(join("features", "help"))) continue;
      sources(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(readFileSync(p, "utf8"));
  }
  return out;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const appears = (label: string, files: string[]) => {
  const re = new RegExp("[>\"'`]\\s*" + escape(label) + "[<\"'`\\s]");
  return files.some((f) => re.test(f));
};

/** Labels from controls another thread is still building. Remove each as it lands; the test then
 *  insists it is gone from this list, so the check never goes quiet. */
const NOT_BUILT_YET = new Set(["Clip joined"]);

test("every control label an answer names is a label the app shows", () => {
  const files = sources(ROOT);
  for (const a of HELP_ANSWERS) {
    for (const label of a.labels) {
      if (NOT_BUILT_YET.has(label)) continue;
      assert.ok(appears(label, files), `"${a.question}" names "${label}", which no screen shows`);
    }
  }
});

test("a label that is waiting for its panel must still be unbuilt, or leave the waiting list", () => {
  const files = sources(ROOT);
  for (const label of NOT_BUILT_YET) {
    assert.ok(!appears(label, files), `"${label}" now exists in the app: remove it from NOT_BUILT_YET`);
  }
});

test("a renamed control is caught", () => {
  assert.equal(appears("Retired control name", sources(ROOT)), false);
});

test("each synonym finds its answer", () => {
  const find = (q: string) => searchHelp(q).answers.map((a) => a.id);
  assert.ok(find("download").includes("make-clip"));
  assert.ok(find("export").includes("where-clip"));
  assert.ok(find("save").includes("where-clip"));
  assert.ok(find("merge").includes("join-parts"));
  assert.ok(find("stitch").includes("join-parts"));
  assert.ok(find("combine").includes("join-parts"));
  assert.ok(find("dub").includes("dubbed-audio"));
  assert.ok(find("translation").includes("dubbed-audio"));
  assert.ok(find("grey").includes("clip-greyed"));
  assert.ok(find("can't").includes("clip-greyed"));
});

test("search ignores case and word order, keeps list order, and an empty query shows everything", () => {
  assert.deepEqual(searchHelp("CLIP GREYED").answers.map((a) => a.id)[0], "clip-greyed");
  assert.equal(searchHelp("").answers.length, HELP_ANSWERS.filter((a) => !a.searchOnly).length);
  assert.equal(searchHelp("colour grade").answers[0].id, "final-cut-look");
  assert.equal(searchHelp("template").answers[0].id, "final-cut-look");
  const ids = searchHelp("clip").answers.map((a) => a.id);
  assert.deepEqual(ids, HELP_ANSWERS.filter((a) => ids.includes(a.id)).map((a) => a.id));
});

test("no match gives nothing, and the More rows are searchable", () => {
  const none = searchHelp("zzzzqx");
  assert.equal(none.answers.length + none.more.length, 0);
  assert.ok(searchHelp("bug").more.includes("report"));
  assert.ok(searchHelp("hotkeys").more.includes("shortcuts"));
});

test("F-5: cookies, sign in, 1080p, undo and key names all find something", () => {
  const found = (q: string) => searchHelp(q);
  for (const q of ["cookies", "sign in", "1080p", "360p", "login"]) assert.equal(found(q).answers[0]?.id, "sign-in", q);
  for (const q of ["undo", "oops", "take back"]) assert.equal(found(q).answers[0]?.id, "undo-clip", q);
  for (const q of ["enter", "space", "ctrl", "cmd"]) assert.ok(found(q).more.includes("shortcuts"), q);
  assert.ok(searchHelp("").answers.every((a) => a.id !== "sign-in" && a.id !== "undo-clip"), "searchOnly answers stay off the default list");
});

test("F-6: every shortcut listed is handled, and every handled shortcut is listed", () => {
  const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
  const code = [
    "routes/App.tsx",
    "features/player/hooks/usePreviewEffects.ts",
    "features/player/hooks/useTimelineEffects.ts",
    "features/player/hooks/useClipController.ts",
    "features/player/utils/transport.ts",
    "features/clips/utils/clipFailure.ts",
    "features/workspace/utils/workspaceShortcuts.ts",
    "features/transcript/components/TranscriptColumn.tsx",
  ].map(read).join("\n");
  const handled: Record<string, RegExp> = {
    "Space": /e\.key === " "/,
    "J  K  L": /k === "j"/,
    "I": /e\.key === "i"/,
    "O": /e\.key === "o"/,
    "M": /e\.key !== "m"/,
    "Shift N": /e\.shiftKey && !e\.metaKey && !e\.ctrlKey && e\.key === "N"/,
    "⌘ Enter": /\(e\.metaKey \|\| e\.ctrlKey\) && e\.key === "Enter"/,
    "R": /toLowerCase\(\) !== "r"/,
    "⌘ R": /k === "r" && !e\.shiftKey/,
    "⌘ L": /modifier\) return k === "l"/,
    "⌘ F": /e\.key\.toLowerCase\(\) === "f" && searchRef/,
    "⌘ 1–9": /\/\^\[1-9\]\$\/\.test\(k\)/,
    "⌘ Tab": /k === "tab"/,
    "⌘ ,": /k === "," && !e\.shiftKey/,
    "⌘ ;": /k === ";" && !e\.shiftKey/,
    "⌘ /": /k === "\/" && !e\.shiftKey/,
  };
  for (const s of SHORTCUTS) {
    if (s.keys === "Esc") continue;
    assert.ok(handled[s.keys], `${s.keys} has a handler check`);
    assert.match(code, handled[s.keys], `${s.keys} (${s.does}) is not handled by any key handler`);
  }
  for (const k of Object.keys(handled)) assert.ok(SHORTCUTS.some((s) => s.keys === k), `${k} is handled but not listed`);
  assert.ok(!SHORTCUTS.some((s) => s.keys === "⌘ B"), "nothing handles Ctrl/⌘ B");
});

test("F2-4: transcript, speed, quota, layout, panels, fit and zoom find an answer; lut is not resolution; Undo says 8 seconds", () => {
  const first = (q: string) => searchHelp(q).answers[0]?.id;
  assert.equal(first("transcript"), "find-in-transcript");
  assert.equal(first("speed"), "speed");
  assert.equal(first("quota"), "quota");
  assert.equal(first("layout"), "fcp-layout");
  assert.ok(searchHelp("panels").answers.some((a) => a.id === "panels"));
  assert.ok(searchHelp("fit").answers.some((a) => a.id === "timeline-zoom"));
  assert.ok(searchHelp("zoom").answers.some((a) => a.id === "timeline-zoom"));
  assert.ok(!searchHelp("lut").answers.some((a) => a.id === "sign-in"), "a typed word matches the start of a word, not its middle");
  assert.ok(searchHelp("cookies.txt").answers.some((a) => a.id === "sign-in"), "file names still match");
  const undo = HELP_ANSWERS.find((a) => a.id === "undo-clip")!;
  assert.match(JSON.stringify(undo.groups), /8 seconds/);
  assert.doesNotMatch(JSON.stringify(undo.groups), /5 seconds/);
});
