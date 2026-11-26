/**
 * File: potTokenProvider.test.ts
 * Path: src/main/features/engine/services/download/potTokenProvider.test.ts
 * Description: The PO-token provider's decision logic, with the process, port and network
 *   calls injected so no real subprocess or socket is ever touched here.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { extractorArgsFor, startPotProvider, vendorDir, vendorEntryPoint } from "./potTokenProvider";

test("vendorDir resolves under the packaged resources folder, not process.cwd(), once packaged", () => {
  const before = process.env.ELECTRON_RESOURCES;
  try {
    delete process.env.ELECTRON_RESOURCES;
    assert.equal(vendorDir(), path.join(process.cwd(), "resources", "pot-provider"));
    process.env.ELECTRON_RESOURCES = "/packaged/resources";
    assert.equal(vendorDir(), path.join("/packaged/resources", "pot-provider"));
  } finally {
    if (before === undefined) delete process.env.ELECTRON_RESOURCES;
    else process.env.ELECTRON_RESOURCES = before;
  }
});

test("extractorArgsFor adds the provider's base url as a second extractor-args entry", () => {
  assert.deepEqual(extractorArgsFor("youtube:player_client=default"), ["youtube:player_client=default"]);
  assert.deepEqual(extractorArgsFor("youtube:player_client=default", "http://127.0.0.1:4416"), [
    "youtube:player_client=default",
    "youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416",
  ]);
});

test("vendorEntryPoint is null until tools:refresh-pot has vendored both the build and node_modules", () => {
  assert.equal(vendorEntryPoint("/anywhere", () => false), null);
  assert.equal(vendorEntryPoint("/anywhere", () => true), "/anywhere/build/main.js");
});

test("vendorEntryPoint is null when the build exists but node_modules does not (a half-finished vendor)", () => {
  const entry = "/anywhere/build/main.js";
  assert.equal(
    vendorEntryPoint("/anywhere", (p) => p === entry),
    null,
  );
});

test("startPotProvider is a no-op (null, no spawn) when nothing is vendored", async () => {
  let spawned = false;
  const handle = await startPotProvider({
    entry: null,
    runtime: "/bin/deno",
    spawnServer: () => {
      spawned = true;
      return {} as any;
    },
    waitUntilListening: async () => {},
    pickPort: async () => 1234,
  });
  assert.equal(handle, null);
  assert.equal(spawned, false, "a provider that is not vendored must never be spawned");
});

test("startPotProvider is a no-op when Deno is not bundled", async () => {
  let spawned = false;
  const handle = await startPotProvider({
    entry: "/vendor/server.js",
    runtime: null,
    spawnServer: () => {
      spawned = true;
      return {} as any;
    },
    waitUntilListening: async () => {},
    pickPort: async () => 1234,
  });
  assert.equal(handle, null);
  assert.equal(spawned, false);
});

test("startPotProvider returns a handle on the picked port once the server is listening", async () => {
  let killed = false;
  const handle = await startPotProvider({
    entry: "/vendor/server.js",
    runtime: "/bin/deno",
    spawnServer: () => ({ kill: () => (killed = true) }) as any,
    waitUntilListening: async () => {},
    pickPort: async () => 4416,
  });
  assert.equal(handle?.baseUrl, "http://127.0.0.1:4416");
  handle?.stop();
  assert.equal(killed, true);
});

test("startPotProvider kills the child and returns null when the server never comes up", async () => {
  let killed = false;
  const handle = await startPotProvider({
    entry: "/vendor/server.js",
    runtime: "/bin/deno",
    spawnServer: () => ({ kill: () => (killed = true) }) as any,
    waitUntilListening: async () => {
      throw new Error("timed out");
    },
    pickPort: async () => 4416,
  });
  assert.equal(handle, null);
  assert.equal(killed, true, "a server that never starts listening must still be cleaned up");
});
