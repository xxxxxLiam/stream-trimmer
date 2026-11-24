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
import { HELP_ANSWERS } from "./helpContent";
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
const NOT_BUILT_YET = new Set(["+ section", "Clip joined"]);

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
  assert.equal(searchHelp("").answers.length, HELP_ANSWERS.length);
  const ids = searchHelp("clip").answers.map((a) => a.id);
  assert.deepEqual(ids, HELP_ANSWERS.filter((a) => ids.includes(a.id)).map((a) => a.id));
});

test("no match gives nothing, and the More rows are searchable", () => {
  const none = searchHelp("zzzzqx");
  assert.equal(none.answers.length + none.more.length, 0);
  assert.ok(searchHelp("bug").more.includes("report"));
  assert.ok(searchHelp("hotkeys").more.includes("shortcuts"));
});
