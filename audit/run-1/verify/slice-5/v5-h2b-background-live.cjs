/**
 * File: v5-h2b-background-live.cjs
 * Description: H-2 follow-up. The tab sweep shows focus reaching the workspace
 *   behind the scrim; this asks the harder question — can those controls
 *   actually be OPERATED from the keyboard while the "modal" is up, and does
 *   the pointer get through the scrim?
 */
const { boot, log } = require("./v5-lib.cjs");

async function once(run) {
  const a = await boot(`h2b-${run}`, { signedIn: false });
  await a.win.waitForSelector('[aria-labelledby="youtube-connect-title"]', { timeout: 40000 });
  const out = { run };

  // Keyboard-activate the Settings popover from behind the scrim.
  await a.win.evaluate(() => document.querySelector("#ui-settings").focus());
  await a.win.keyboard.press("Enter");
  await a.win.waitForTimeout(400);
  out.settings = await a.win.evaluate(() => ({
    ariaExpanded: document.querySelector("#ui-settings").getAttribute("aria-expanded"),
    popoverInDom: !!document.querySelector('#ui-settings[aria-expanded="true"]'),
    bodyMentionsSettings: document.body.innerText.includes("No app settings yet"),
  }));
  await a.shot("settings-opened-behind-modal");

  // Type a URL into the workspace's URL bar from behind the scrim.
  await a.win.keyboard.press("Escape");
  await a.win.evaluate(() => document.querySelector('#ui-source-chip input[type="url"]').focus());
  await a.win.keyboard.type("https://www.youtube.com/watch?v=stub0000001");
  await a.win.keyboard.press("Enter");
  await a.win.waitForTimeout(3000);
  out.urlBar = await a.win.evaluate(() => ({
    inputValue: (document.querySelector('#ui-source-chip input[type="url"]') || {}).value ?? "<input gone>",
    titleShown: document.body.innerText.includes("Stub video"),
    clipsColumnAppeared: !!document.querySelector("#ui-col-clips"),
    modalStillUp: !!document.querySelector('[aria-labelledby="youtube-connect-title"]'),
  }));
  await a.shot("video-loaded-behind-modal");

  // Mouse: does a real click land on the background, or on the scrim?
  const settingsBox = await a.win.evaluate(() => {
    const r = document.querySelector("#ui-settings").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await a.win.mouse.click(settingsBox.x, settingsBox.y);
  await a.win.waitForTimeout(300);
  out.mouseClickOpenedSettings = await a.win.evaluate(
    () => document.querySelector("#ui-settings").getAttribute("aria-expanded"),
  );

  await a.close();
  return out;
}

(async () => {
  for (const n of [1, 2]) {
    const o = await once(n);
    log(`\n=== run ${n} ===`);
    log("Enter on #ui-settings behind the scrim:", JSON.stringify(o.settings));
    log("typed a URL behind the scrim:", JSON.stringify(o.urlBar));
    log("real mouse click on #ui-settings -> aria-expanded:", o.mouseClickOpenedSettings);
  }
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
