/**
 * File: ownerHandlers.ts
 * Path: src/main/ipc/ownerHandlers.ts
 * Description: Owner gate: is this computer on the build's allowlist? Answers a
 *   boolean and nothing else. The list and salt come from what this build was
 *   baked with. Never logs or returns the id or hash.
 */
import electron from "electron";
import { ownerGate } from "../features/owner/services/ownerGate";

const { ipcMain } = electron;

export function registerOwnerHandlers() {
  // The arguments are ignored: main answers from what this build was baked with,
  // so a page cannot choose its own answer. export:save asks the same gate.
  ipcMain.handle("owner:check", () => ownerGate.check());
}
