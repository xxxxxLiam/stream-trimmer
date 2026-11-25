/**
 * File: signInSignal.test.ts
 * Path: src/main/shared/utils/signInSignal.test.ts
 * Description: The footer's "at 360p" signal: quiet until known, clears on sign-in, returns when YouTube ends the session.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createSignInState } from "./signInSignal";

test("unknown is not low quality (no flash at launch)", () => {
  assert.equal(createSignInState().get().lowQualityWithoutSignIn, false);
});

test("true once the browser sweep finds nothing and there is no file; clears on import", () => {
  const s = createSignInState();
  const heard: boolean[] = [];
  s.subscribe((x) => heard.push(x.lowQualityWithoutSignIn));
  s.setFileUsable(false);
  s.setBrowserUsable(false);
  assert.equal(s.get().lowQualityWithoutSignIn, true);
  s.setFileUsable(true);
  assert.equal(s.get().lowQualityWithoutSignIn, false);
  assert.deepEqual(heard, [true, false]);
});

test("a usable browser sign-in clears it", () => {
  const s = createSignInState();
  s.setBrowserUsable(false);
  s.setBrowserUsable(true);
  assert.equal(s.get().lowQualityWithoutSignIn, false);
});

test("comes back when YouTube ends the session, even with a file on disk, until a fresh file or a good download", () => {
  const s = createSignInState();
  s.setFileUsable(true);
  s.sessionEnded();
  assert.equal(s.get().lowQualityWithoutSignIn, true);
  s.sessionConfirmed();
  assert.equal(s.get().lowQualityWithoutSignIn, false);
  s.sessionEnded();
  s.setFileUsable(true);
  assert.equal(s.get().lowQualityWithoutSignIn, false);
});

test("listeners hear changes only, not repeats", () => {
  const s = createSignInState();
  let n = 0;
  s.subscribe(() => (n += 1));
  s.setBrowserUsable(false);
  s.setBrowserUsable(false);
  assert.equal(n, 1);
});

test("A2-1: the engine bundle's copy of the module and main's copy are the same signal", async () => {
  // Two imports under different query strings are two module instances, as engine.cjs and index.cjs are.
  type Mod = typeof import("./signInSignal");
  const load = (query: string): Promise<Mod> => import(`./signInSignal?${query}`);
  const main = await load("main");
  const engine = await load("engine");
  assert.notEqual(main, engine, "really two module instances");
  main.signIn.setFileUsable(true);
  assert.deepEqual(main.signIn.get(), { lowQualityWithoutSignIn: false });
  engine.signIn.sessionEnded();
  assert.deepEqual(main.signIn.get(), { lowQualityWithoutSignIn: true }, "the engine's rejection reaches the footer's signal");
  engine.signIn.sessionConfirmed();
  assert.deepEqual(main.signIn.get(), { lowQualityWithoutSignIn: false });
});
