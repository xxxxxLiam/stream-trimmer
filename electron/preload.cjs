// electron/preload.cjs — reads the loopback API base URL from the additional
// argument passed by main.cjs and exposes it as window.__API_BASE__ before
// any renderer code runs.
const { contextBridge } = require("electron");

const arg = process.argv.find((a) => a.startsWith("--api-base="));
const apiBase = arg ? arg.slice("--api-base=".length) : "";

try {
  contextBridge.exposeInMainWorld("__API_BASE__", apiBase);
} catch {
  // contextBridge unavailable in some contexts — fall back to a direct set.
  // eslint-disable-next-line no-undef
  window.__API_BASE__ = apiBase;
}