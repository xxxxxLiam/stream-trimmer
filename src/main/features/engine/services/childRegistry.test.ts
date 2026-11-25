/**
 * File: childRegistry.test.ts
 * Path: src/main/features/engine/services/childRegistry.test.ts
 * Description: E-13. Processes the engine started are remembered in a file; the next start stops the ones still running
 *   as the same program, never one whose pid was reused, and a real orphan is really stopped.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createChildRegistry } from "./childRegistry";

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "children-")), "engine-children.json");

test("a leftover process of the same program is stopped at the next start; a reused pid and a gone process are not", async () => {
  const file = tmp();
  const killed: number[] = [];
  const running: Record<number, string> = { 101: "yt-dlp_linux", 102: "bash", 103: "ffmpeg" };
  const reg = createChildRegistry({ file, commandOf: async (pid) => running[pid] ?? null, kill: (pid) => void killed.push(pid) });
  reg.add(101, "yt-dlp_linux");
  reg.add(102, "yt-dlp_linux"); // pid reused by another program after a reboot
  reg.add(103, "ffmpeg");
  reg.add(104, "ffmpeg"); // already gone
  assert.equal(await reg.reap(), 2);
  assert.deepEqual(killed.sort(), [101, 103]);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), []);
});

test("a process that finished is forgotten, and a damaged file is read as empty", async () => {
  const file = tmp();
  const killed: number[] = [];
  const reg = createChildRegistry({ file, commandOf: async () => "yt-dlp", kill: (p) => void killed.push(p) });
  reg.add(201, "yt-dlp");
  reg.remove(201);
  assert.equal(await reg.reap(), 0);
  fs.writeFileSync(file, "{not json");
  assert.equal(await reg.reap(), 0);
  assert.deepEqual(killed, []);
});

test("quitting stops everything remembered", () => {
  const file = tmp();
  const killed: number[] = [];
  const reg = createChildRegistry({ file, commandOf: async () => null, kill: (p) => void killed.push(p) });
  reg.add(301, "yt-dlp");
  reg.add(302, "ffmpeg");
  reg.stopAllNow();
  assert.deepEqual(killed.sort(), [301, 302]);
});

test("a real orphan: a process left behind by a dead parent is found and stopped", { skip: process.platform === "win32" }, async () => {
  const file = tmp();
  const child = spawn("sleep", ["30"], { detached: true, stdio: "ignore" });
  const pid = child.pid as number;
  const { execFile } = await import("node:child_process");
  const reg = createChildRegistry({
    file,
    commandOf: (p) => new Promise((r) => execFile("ps", ["-p", String(p), "-o", "comm="], (e, o) => r(e || !o.trim() ? null : o.trim()))),
    kill: (p) => process.kill(-p, "SIGKILL"),
  });
  reg.add(pid, "sleep");
  assert.equal(await reg.reap(), 1);
  await new Promise((r) => (child.exitCode !== null || child.signalCode ? r(null) : child.once("exit", r)));
  assert.throws(() => process.kill(pid, 0));
});
