/**
 * File: states.cjs
 * Path: audit/run-1/area-H/lib/states.cjs
 * Description: Named screens and overlay states area H measures, each with the
 *   steps that reach it from the signed-in workspace. Audit-only.
 */
const URL_OK = "https://www.youtube.com/watch?v=stub0000001";

const closeAll = async (win) => {
  await win.evaluate(() => {
    // Close every overlay by pressing Escape and clicking the toggles that are on.
    for (const id of ["ui-settings", "ui-copy-blocks", "ui-symbols", "ui-help-button", "ui-campaign-chip", "ui-footer-format", "ui-footer-data"]) {
      const el = document.getElementById(id);
      if (el && (el.getAttribute("aria-expanded") === "true" || el.getAttribute("aria-pressed") === "true")) el.click();
    }
  });
  await win.keyboard.press("Escape");
  await win.waitForTimeout(250);
};

/** Click through the DOM, so an overlay above the target cannot swallow it. */
const jsClick = (win, sel) => win.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) throw new Error("no element for " + s);
  el.click();
}, sel);

const STATES = [
  { name: "workspace-empty", open: async () => {} },
  { name: "settings-popover", open: async (win) => { await jsClick(win, "#ui-settings"); } },
  { name: "campaign-popover", open: async (win) => { await jsClick(win, "#ui-campaign-chip"); } },
  { name: "copy-blocks", open: async (win) => { await jsClick(win, "#ui-copy-blocks"); } },
  { name: "symbol-palette", open: async (win) => { await jsClick(win, "#ui-symbols"); } },
  { name: "help-drawer", open: async (win) => { await jsClick(win, "#ui-help-button"); } },
  {
    name: "setup-checklist",
    open: async (win) => {
      await jsClick(win, "#ui-help-button");
      await win.waitForTimeout(300);
      await jsClick(win, "#help-setup-toggle");
    },
  },
  { name: "footer-format-popover", open: async (win) => { await jsClick(win, "#ui-footer-format"); } },
  { name: "footer-data-popover", open: async (win) => { await jsClick(win, "#ui-footer-data"); } },
  {
    name: "session-chip-menu",
    open: async (win) => {
      await win.evaluate(() => {
        const b = [...document.querySelectorAll("header button")].find((x) => /Signed in|Not signed in|expire/i.test(x.innerText));
        if (b) b.click();
      });
    },
  },
  { name: "clips-tab-bank", open: async (win) => { await jsClick(win, "#clips-tab-bank"); } },
  { name: "clips-tab-all", open: async (win) => { await jsClick(win, "#clips-tab-all"); } },
];

module.exports = { STATES, closeAll, jsClick, URL_OK };
