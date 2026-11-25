/**
 * File: detectBump.test.ts
 * Path: scripts/detectBump.test.ts
 * Description: Verifies the release bump is read from commit subjects and
 * cannot be tripped by prose — the defect that shipped v3.0.0 for a bugfix.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  detectBump,
  rangeFrom,
}: {
  detectBump: (input: {
    subjects?: string[];
    bodies?: string[];
  }) => { bump: "patch" | "minor" | "major"; why: string };
  rangeFrom: (input: { tag?: string; logLines?: string[] }) => string | null;
} = require("./detectBump.cjs");

const bump = (subjects: string[], bodies: string[] = []) =>
  detectBump({ subjects, bodies }).bump;

test("a body that documents the markers does not trigger a bump", () => {
  // The exact commit that released v3.0.0 for a patch-level bugfix.
  const body = [
    "The bump is read from the commit messages since the previous tag. An",
    "explicit [major]/[minor] marker wins, then Conventional-Commit syntax",
    "(BREAKING CHANGE: footer or type!: for major, feat: for minor), and",
    "everything else is a patch.",
  ].join("\n");
  assert.equal(bump(["Release on merge, in one workflow"], [body]), "patch");
});

test("prose about breaking changes stays a patch", () => {
  assert.equal(
    bump(["Add a loader"], ["This is not a breaking change at all."]),
    "patch",
  );
  assert.equal(bump(["Fix the sign-in window aborting itself"]), "patch");
});

test("explicit markers in the subject are honoured", () => {
  assert.equal(bump(["Rewrite the engine [major]"]), "major");
  assert.equal(bump(["[minor] Add a dubbed audio picker"]), "minor");
  assert.equal(bump(["Add picker [MINOR]"]), "minor");
});

test("conventional commit subjects are honoured", () => {
  assert.equal(bump(["feat: add multi-language audio"]), "minor");
  assert.equal(bump(["feat(export): add tag columns"]), "minor");
  assert.equal(bump(["feat!: drop the browser-cookie path"]), "major");
  assert.equal(bump(["refactor(api)!: rename the endpoint"]), "major");
  // "feature request" is not a `feat:` prefix.
  assert.equal(bump(["feature request follow-up: tidy copy"]), "patch");
});

test("a real BREAKING CHANGE footer is honoured", () => {
  assert.equal(
    bump(["Rework storage"], ["BREAKING CHANGE: 2.x settings are not read"]),
    "major",
  );
  assert.equal(bump(["Rework"], ["BREAKING-CHANGE: gone"]), "major");
  // Only at the start of a line, and only in that exact form.
  assert.equal(
    bump(["Rework"], ["see the (BREAKING CHANGE: ...) convention"]),
    "patch",
  );
});

test("the strongest signal across the range wins", () => {
  assert.equal(bump(["fix: a", "feat: b", "chore: c"]), "minor");
  assert.equal(bump(["fix: a", "feat: b", "feat!: c"]), "major");
  assert.equal(bump([]), "patch");
});

// The pure function above is only half of it: the workflow runs the CLI, and
// the first CLI used NUL as a record separator — which cannot be passed as a
// process argument at all. The unit tests never noticed because they call
// detectBump() directly. This runs the real thing.
test("the CLI runs against a real repository", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const script = path.join(here, "..", "scripts", "detectBump.cjs");
  const run = (...args: string[]) =>
    execFileSync("node", [script, ...args], {
      encoding: "utf8",
      cwd: path.join(here, ".."),
    }).trim();

  assert.match(run(), /^(patch|minor|major)$/);
  assert.equal(run("minor"), "minor");
  assert.equal(run("major"), "major");
  assert.match(run("auto"), /^(patch|minor|major)$/);
});


// The runaway: this repo carries no tags, because the release tag is created in
// the releases repo over the REST API. The old "no tags, so consider everything"
// fallback meant two BREAKING CHANGE footers from ~900 commits back re-triggered
// a major bump on EVERY automatic run. The version went 2.1.0 -> 14.0.0 across
// twelve unintended releases in a day, each one downloaded by real people.
test("without a boundary the range is null, so an unbounded scan cannot infer major", () => {
  assert.equal(rangeFrom({ tag: "", logLines: ["abc feat: a thing", "def fix: another"] }), null);
  assert.equal(rangeFrom({ tag: "", logLines: [] }), null);
});

test("the previous Release commit is the boundary when there are no tags", () => {
  const range = rangeFrom({
    tag: "",
    logLines: ["aaa1111 fix: since the release", "bbb2222 Release v2.1.0", "ccc3333 feat!: ancient history"],
  });
  assert.equal(range, "bbb2222..HEAD");
});

test("the previous Release commit wins over a stale tag", () => {
  assert.equal(rangeFrom({ tag: "v3.3.0", logLines: ["aaa1111 fix: a", "bbb2222 Release v19.0.0"] }), "bbb2222..HEAD");
});

test("a tag is only the fallback when no Release commit exists", () => {
  assert.equal(rangeFrom({ tag: "v1.2.3", logLines: ["aaa1111 fix: a"] }), "v1.2.3..HEAD");
});

// The real runaway, rebuilt: an old v3.3.0 tag with a BREAKING CHANGE footer behind it, a
// `Release v19.0.0` commit, then new work. The workflow ran `npm version <bump>` on this.
test("a stale tag with an old BREAKING CHANGE does not make the next release major", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "bump-"));
  const git = (...a: string[]) => execFileSync("git", a, { cwd: dir, encoding: "utf8" }).trim();
  const next = (b: string) => {
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x", version: "19.0.0" }));
    return execFileSync("npm", ["version", b, "--no-git-tag-version"], { cwd: dir, encoding: "utf8" }).trim();
  };
  const bumpHere = () =>
    execFileSync("node", [path.join(path.dirname(fileURLToPath(import.meta.url)), "detectBump.cjs")], { cwd: dir, encoding: "utf8" }).trim();
  const commit = (msg: string) => git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "--allow-empty", "-qm", msg);
  git("init", "-q");
  commit("first");
  git("tag", "v3.3.0");
  commit("old work\n\nBREAKING CHANGE: v2 settings are gone");
  commit("Release v19.0.0");
  commit("Fix a clip row");
  commit("Merge PR 1");
  assert.equal(next(bumpHere()), "v19.0.1");
  commit("Release fixes, downloading pill [minor]");
  assert.equal(next(bumpHere()), "v19.1.0");
  rmSync(dir, { recursive: true, force: true });
});

test("only a real Release commit is a boundary, not a commit that mentions one", () => {
  // "docs: explain the Release v... boundary" must not be mistaken for the thing
  // it describes, or the range silently starts in the wrong place.
  assert.equal(
    rangeFrom({ tag: "", logLines: ["aaa1111 docs: explain the Release v2.1.0 boundary"] }),
    null,
  );
});
