/**
 * File: editorPaths.test.ts
 * Description: The editor IPC only touches the user's own folders (D-12).
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkEditorRequest } from "./editorPaths";

const base = mkdtempSync(join(tmpdir(), "editor-paths-"));
const clips = join(base, "Clips");
const outside = join(base, "outside");
mkdirSync(clips);
mkdirSync(outside);
symlinkSync(outside, join(clips, "link"));
const roots = [clips];
const refused = (kind: Parameters<typeof checkEditorRequest>[0], payload: unknown) => checkEditorRequest(kind, payload, roots).ok === false;

test("writeFcpxml: inside a clips folder is fine; outside, ../, a symlink out, and a bad type are refused", () => {
  assert.equal(refused("writeFcpxml", { dirPath: clips }), false);
  assert.equal(refused("writeFcpxml", { dirPath: join(clips, "Acme") }), false);
  assert.equal(refused("writeFcpxml", { dirPath: outside }), true);
  assert.equal(refused("writeFcpxml", { dirPath: join(clips, "..", "outside") }), true);
  assert.equal(refused("writeFcpxml", { dirPath: join(clips, "link") }), true);
  assert.equal(refused("writeFcpxml", { dirPath: "relative/dir" }), true);
  assert.equal(refused("writeFcpxml", {}), true);
  assert.equal(refused("writeFcpxml", null), true);
});

test("copyFiles: the folder and every file must be inside; one stray file refuses the lot", () => {
  assert.equal(refused("copyFiles", { dirPath: join(clips, "drop"), files: [join(clips, "a.mp4")] }), false);
  assert.equal(refused("copyFiles", { dirPath: outside, files: [join(clips, "a.mp4")] }), true);
  assert.equal(refused("copyFiles", { dirPath: clips, files: [join(clips, "a.mp4"), "/etc/hostname"] }), true);
});

test("reveal and openWith: only paths inside a clips folder", () => {
  assert.equal(refused("reveal", join(clips, "a.fcpxml")), false);
  assert.equal(refused("reveal", "/"), true);
  assert.equal(refused("reveal", "/Applications/Final Cut Pro.app"), true);
  assert.equal(refused("openWith", { app: "finalcut", file: join(clips, "a.fcpxml") }), false);
  assert.equal(refused("openWith", { app: "finalcut", file: "/etc/hostname" }), true);
  assert.equal(refused("openWith", { app: "capcut" }), false, "opening an editor with no file has no path to check");
});

test("pathExists: clips folders and .fcpbundle libraries only, not any directory", () => {
  assert.equal(refused("pathExists", join(clips, "x")), false);
  assert.equal(refused("pathExists", "/Users/me/Movies/Client.fcpbundle"), false);
  assert.equal(refused("pathExists", "/root/.ssh"), true);
  assert.equal(refused("pathExists", "/Users/me/Movies/Client.fcpbundle/../../.ssh"), true);
});

test("the refusal is one plain sentence", () => {
  const v = checkEditorRequest("reveal", "/", roots);
  assert.equal(v.ok, false);
  assert.match(v.ok ? "" : v.error, /outside the folders Clipr saves clips in/);
});
