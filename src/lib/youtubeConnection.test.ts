/**
 * File: youtubeConnection.test.ts
 * Description: A-1 (signed-out path) and A-2 (late sweep must not clobber a
 * sign-in made meanwhile). Runs under tsx in node with a stubbed window/fetch.
 */
import test from "node:test";
import assert from "node:assert/strict";

type Resolver = (status: string) => void;
const pending: Array<{ browser: string; resolve: Resolver }> = [];

const g = globalThis as any;
g.window = {
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  electronAPI: {
    probeYouTube: async () => ({ connected: false }),
    importYouTubeCookies: async () => ({ ok: true }),
    getBrowserOrder: async () => ({ browsers: ["firefox", "chrome"] }),
  },
};
g.fetch = (_url: string, init: { body: string }) =>
  new Promise((resolve) => {
    const browser = JSON.parse(init.body).browser as string;
    pending.push({
      browser,
      resolve: (status) =>
        resolve({ ok: true, headers: { get: () => "application/json" }, text: async () => JSON.stringify({ status }), json: async () => ({ status }) }),
    });
  });

const tick = () => new Promise((r) => setTimeout(r, 0));
async function until(cond: () => boolean) {
  for (let i = 0; i < 50 && !cond(); i++) await tick();
}

test("A-1: continueSignedOut hides the gate without connecting; resumeSignIn brings it back", async () => {
  const lib = await import("./youtubeConnection");
  assert.equal(lib.isConnected(), false);
  lib.continueSignedOut();
  assert.deepEqual(lib.cookiePayload(), {}, "signed-out requests carry no cookies");
  let snap: any;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const React = await import("react");
  function Probe() {
    snap = lib.useYouTubeConnection();
    return null;
  }
  renderToStaticMarkup(React.createElement(Probe));
  assert.equal(snap.skipped, true);
  assert.equal(snap.connected, false);
  lib.resumeSignIn();
  renderToStaticMarkup(React.createElement(Probe));
  assert.equal(snap.skipped, false);
});

test("A-2: a sweep that returns after a cookies.txt sign-in must not overwrite it", async () => {
  const lib = await import("./youtubeConnection");
  pending.length = 0;
  const sweep = lib.sweepBrowsers();
  await tick();
  assert.equal(pending.length, 1, "sweep is checking the first browser");
  const sweepFirst = pending.shift()!;

  // User drops a cookies.txt mid-sweep; its verification passes.
  const imported = lib.importCookies();
  await until(() => pending.length > 0);
  const verify = pending.shift()!;
  assert.equal(verify.browser, "app");
  verify.resolve("signed_in");
  assert.equal(await imported, true);
  assert.equal(lib.isConnected(), true);

  // The sweep now comes back negative for every browser.
  sweepFirst.resolve("signed_out");
  await tick();
  while (pending.length) pending.shift()!.resolve("signed_out");
  await sweep;

  assert.equal(lib.isConnected(), true, "sign-in survives the late sweep");
  assert.deepEqual(lib.cookiePayload(), { cookiesFromBrowser: "app" });
  let snap: any;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const React = await import("react");
  renderToStaticMarkup(
    React.createElement(() => {
      snap = lib.useYouTubeConnection();
      return null;
    }),
  );
  assert.equal(snap.message, undefined, "no 'None of your browsers' message");
  assert.equal(snap.source, "app");
});

test("A-2: a late sweep SUCCESS also must not replace the imported source", async () => {
  const lib = await import("./youtubeConnection");
  await lib.signOut();
  pending.length = 0;
  const sweep = lib.sweepBrowsers();
  await tick();
  const first = pending.shift()!;
  const imported = lib.importCookies();
  await until(() => pending.length > 0);
  pending.shift()!.resolve("signed_in");
  await imported;
  first.resolve("signed_in");
  await sweep;
  assert.deepEqual(lib.cookiePayload(), { cookiesFromBrowser: "app" });
});
