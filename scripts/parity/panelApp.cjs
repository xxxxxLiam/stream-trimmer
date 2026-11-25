/**
 * File: panelApp.cjs
 * Path: scripts/parity/panelApp.cjs
 * Description: Screenshot ONE element of the real app for a fixture (used by panelParity.cjs).
 */
const { loadFixture, withApp } = require("./parity.cjs");
const { MEASURE } = require("./boardRender.cjs");

async function screenshotElement(screen, fixtureName, selector) {
  const fx = loadFixture(fixtureName);
  const win = fx.window || { width: 1360, height: 760 };
  return withApp(screen, fx, win, async (page) => {
    const el = page.locator(selector).first();
    await el.waitFor({ timeout: 10000 });
    const boxes = await el.evaluate(MEASURE);
    return { png: await el.screenshot(), boxes };
  });
}

module.exports = { screenshotElement };
