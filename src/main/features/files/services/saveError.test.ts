/**
 * File: saveError.test.ts
 * Path: src/main/features/files/services/saveError.test.ts
 * Description: Pins that a failed save is one plain sentence, with no Node text, stack lines or paths.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { describeSaveError, plainSaveError } from "./saveError";

const err = (code: string, message: string) => Object.assign(new Error(message), { code });

test("each kind of failed save gets its own plain sentence and leaks nothing", () => {
  const cases: [unknown, RegExp][] = [
    [err("ENOSPC", "ENOSPC: no space left on device, write '/Users/x/Clips/a.mp4'"), /folder is full/],
    [err("EACCES", "EACCES: permission denied, mkdir '/Library/x'"), /can't write to that folder/],
    [err("EEXIST", "EEXIST: file already exists, mkdir '/tmp/e15-not-a-folder'\n    at async Object.mkdir (node:internal/fs/promises:858:10)"), /can't be used/],
    [new TypeError("The argument 'path' must be a string without null bytes"), /can't be used/],
    [new Error("weird"), /couldn't be saved/],
    [undefined, /couldn't be saved/],
  ];
  for (const [e, re] of cases) {
    const s = plainSaveError(e);
    assert.match(s, re);
    assert.doesNotMatch(s, /\/|node:|at async|E[A-Z]{3,}/);
  }
});

test("each failed save carries a code the Export row can act on (Change folder), with the plain sentence", () => {
  const code = (e: unknown) => describeSaveError(e).code;
  assert.equal(code(err("ENOSPC", "no space left on device")), "DISK_FULL");
  assert.equal(code(err("EDQUOT", "quota")), "DISK_FULL");
  assert.equal(code(err("EACCES", "permission denied")), "FOLDER_NOT_WRITABLE");
  assert.equal(code(err("EROFS", "read-only file system")), "FOLDER_NOT_WRITABLE");
  assert.equal(code(err("ENOENT", "no such file or directory")), "FOLDER_GONE");
  assert.equal(code(err("ENOTDIR", "not a directory")), "FOLDER_GONE");
  assert.equal(code(new Error("weird")), "SAVE_FAILED");
  assert.match(describeSaveError(err("ENOSPC", "x")).error, /folder is full/);
});
