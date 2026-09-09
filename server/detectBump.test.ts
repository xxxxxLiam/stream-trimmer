/**
 * File: detectBump.test.ts
 * Path: server/detectBump.test.ts
 * Description: Verifies the release bump is read from commit subjects and
 * cannot be tripped by prose — the defect that shipped v3.0.0 for a bugfix.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  detectBump,
}: {
  detectBump: (input: {
    subjects?: string[];
    bodies?: string[];
  }) => { bump: "patch" | "minor" | "major"; why: string };
} = require("../scripts/detectBump.cjs");

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
