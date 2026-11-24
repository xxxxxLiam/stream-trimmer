/**
 * File: channels.test.ts
 * Path: src/common/ipc/channels.test.ts
 * Description: Every IPC channel in IPC has one main-process side and one preload side,
 * and neither side names a channel by a bare string any more.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { IPC } from "./channels";

const root = path.resolve(import.meta.dirname, "../../..");
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p);
  }
  return out;
}
const main = sources(path.join(root, "src/main")).map((f) => readFileSync(f, "utf8")).join("\n");
const preload = readFileSync(path.join(root, "src/preload/index.ts"), "utf8");
const keyOf = Object.fromEntries(Object.entries(IPC).map(([k, v]) => [v, k]));

test("channel names are unique", () => {
  const values = Object.values(IPC);
  assert.equal(new Set(values).size, values.length);
});

test("every channel is registered in main exactly once and used by preload", () => {
  for (const [key, channel] of Object.entries(IPC)) {
    const ref = new RegExp(`IPC\\.${key}\\b`, "g");
    const inMain = (main.match(ref) ?? []).length;
    assert.equal(inMain, 1, `${channel}: main references it ${inMain} times`);
    assert.match(preload, ref, `${channel}: preload never uses it`);
  }
});

test("no IPC call names a channel by a bare string", () => {
  const bare = /(?:ipcMain\.(?:handle|on)|ipcRenderer\.(?:invoke|send|sendSync|on|removeListener)|webContents\.send)\(\s*["']([^"']+)["']/g;
  for (const [label, text] of [["main", main], ["preload", preload]] as const) {
    const hits = [...text.matchAll(bare)].map((m) => m[1]);
    assert.deepEqual(hits, [], `${label} uses bare channel strings: ${hits.join(", ")} (known: ${hits.map((h) => keyOf[h] ?? "none").join(", ")})`);
  }
});
