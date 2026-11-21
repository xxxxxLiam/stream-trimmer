/**
 * File: v5-smoke.cjs
 * Description: Slice-5 smoke test — can I reach the workspace signed in, load a
 *   video, and reach the Bank tab? Prints what it found.
 */
const { boot, loadVideo, campaign, log } = require("./v5-lib.cjs");

(async () => {
  const a = await boot("smoke", {
    seed: {
      "clipper.campaigns": [campaign("acme-q4", "Acme Q4")],
      "clipper.activeCampaign": "acme-q4",
    },
  });
  log("modal present:", await a.win.evaluate(() => !!document.querySelector('[aria-labelledby="youtube-connect-title"]')));
  log("viewport:", await a.win.evaluate(() => [window.innerWidth, window.innerHeight]));
  await loadVideo(a);
  log("clips col:", await a.win.evaluate(() => !!document.querySelector("#ui-col-clips")));
  log("mark-in:", await a.win.evaluate(() => !!document.querySelector("#ui-mark-in")));
  log("cut:", await a.win.evaluate(() => !!document.querySelector("#ui-cut")));
  const bank = await a.win.evaluate(() => !!document.querySelector("#clips-tab-bank"));
  log("bank tab:", bank);
  if (bank) await a.win.click("#clips-tab-bank");
  log("shot:", await a.shot("smoke"));
  log("pageErrors:", a.logs.pageErrors.slice(0, 3));
  await a.close();
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
