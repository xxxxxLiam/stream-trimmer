/**
 * File: preloadDrag.test.ts
 * Path: electron/preloadDrag.test.ts
 * Description: D-1 keeper — the bridge's startDrag must refuse unless the
 * browser delivered a genuine (isTrusted) dragstart a moment ago. Loads the
 * real preload.ts with a fake electron and window.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

function loadPreload() {
  const sent: unknown[][] = [];
  let api: any;
  const listeners: Record<string, ((e: any) => void)[]> = {};
  (globalThis as any).window = {
    addEventListener: (t: string, fn: (e: any) => void) => (listeners[t] ||= []).push(fn),
  };
  const origLoad = (Module as any)._load;
  (Module as any)._load = function (request: string, ...rest: unknown[]) {
    if (request === "electron") {
      return {
        contextBridge: { exposeInMainWorld: (name: string, v: any) => { if (name === "electronAPI") api = v; } },
        ipcRenderer: { send: (...a: unknown[]) => sent.push(a), invoke: () => Promise.resolve(), sendSync: () => ({}), on() {}, removeListener() {} },
      };
    }
    return origLoad.call(this, request, ...rest);
  };
  try {
    delete require.cache[require.resolve("./preload.ts")];
    require("./preload.ts");
  } finally {
    (Module as any)._load = origLoad;
  }
  const fire = (isTrusted: boolean) => (listeners.dragstart || []).forEach((fn) => fn({ isTrusted }));
  return { api, sent, fire };
}

test("startDrag with no gesture in progress sends nothing", () => {
  const { api, sent } = loadPreload();
  api.startDrag("/some/clip.mp4");
  assert.equal(sent.length, 0);
});

test("a synthetic (untrusted) dragstart does not open the gate", () => {
  const { api, sent, fire } = loadPreload();
  fire(false);
  api.startDrag("/some/clip.mp4");
  assert.equal(sent.length, 0);
});

test("a genuine dragstart lets the drag through", () => {
  const { api, sent, fire } = loadPreload();
  fire(true);
  api.startDrag("/some/clip.mp4");
  assert.deepEqual(sent, [["file:startDrag", "/some/clip.mp4"]]);
});

test("the gate closes again once the gesture is over", () => {
  const { api, sent, fire } = loadPreload();
  const realNow = Date.now;
  try {
    fire(true);
    const t0 = realNow();
    Date.now = () => t0 + 5000;
    api.startDrag("/some/clip.mp4");
  } finally {
    Date.now = realNow;
  }
  assert.equal(sent.length, 0);
});
