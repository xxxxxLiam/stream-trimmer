#!/usr/bin/env node
/** Smoke test: the mirror launches, the stub answers, the page is driveable. */
const { launch, api, cookieTxt, SIGNED_IN_STDERR } = require("./lib.cjs");
const { makeStub, calls } = require("./mkstub.cjs");

const STUB = "/tmp/s4-stub-smoke";

(async () => {
  makeStub(STUB, { auth: { default: { stdout: SIGNED_IN_STDERR } } });
  const a = await launch({ mirror: "/tmp/s4-public", label: "smoke", cwd: STUB, cookieFile: cookieTxt() });
  await a.win.waitForSelector("header", { timeout: 30000 });
  const probe = await api(a.win, "POST", "/api/auth/youtube/status", { browser: "app" });
  const info = await api(a.win, "POST", "/api/info", { url: "https://www.youtube.com/watch?v=stub0000001" });
  console.log("auth:", JSON.stringify(probe.json));
  console.log("info status:", info.status, "title:", info.json && info.json.title);
  console.log("yt-dlp calls:", calls(STUB).length);
  console.log("modal present:", await a.win.locator('[role="dialog"]').count());
  console.log(await a.shot("smoke"));
  await a.close();
})().catch((e) => { console.error(e); process.exit(1); });
