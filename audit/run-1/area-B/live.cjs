/**
 * File: live.cjs
 * Description: Reads the ACTIVE workspace tab's pane only. Every tab mounts a
 *   full copy of the workspace (same element ids), so a plain `#ui-...` query
 *   can land on a hidden tab. This finds the pane that is actually on screen.
 */
const PANE_JS = `(() => {
  const visible = Array.from(document.querySelectorAll('#ui-mark-in'))
    .find((el) => el.offsetParent !== null || el.getClientRects().length > 0);
  if (!visible) return null;
  const pane = visible.closest('div.absolute.inset-0') || document.body;
  const txt = (sel) => {
    const e = pane.querySelector(sel);
    return e ? (e.innerText || e.textContent || '').replace(/\\s+/g, ' ').trim() : null;
  };
  return {
    rows: Array.from(pane.querySelectorAll('ol[aria-label^="Segments"] > li')).map((li) => li.innerText.replace(/\\s+/g, ' ').trim()),
    total: txt('#ui-stitched-total'),
    source: txt('#ui-source-chip'),
    markIn: pane.querySelector('#ui-mark-in')?.value ?? null,
    markOut: pane.querySelector('#ui-mark-out')?.value ?? null,
    timelineSegments: pane.querySelectorAll('[aria-label^="Segment "]').length,
    status: txt('#ui-col-centre [role=status]'),
    alert: txt('#ui-col-centre [role=alert]'),
    transcriptHeader: txt('#ui-col-transcript header span[aria-live="polite"]'),
    transcriptRows: pane.querySelectorAll('[data-line]').length,
    cutDisabled: pane.querySelector('#ui-cut')?.disabled ?? null,
    addDisabled: pane.querySelector('#ui-add-segment')?.disabled ?? null,
    cancelVisible: Array.from(pane.querySelectorAll('button')).some((b) => b.innerText.trim() === 'Cancel'),
  };
})()`;

async function live(a) {
  return a.win.evaluate(PANE_JS);
}

/** All panes at once, so cross-tab leakage is visible in one reading. */
async function allPanes(a) {
  return a.win.evaluate(`(() => Array.from(document.querySelectorAll('#ui-mark-in')).map((el, i) => {
    const pane = el.closest('div.absolute.inset-0');
    const shown = el.offsetParent !== null || el.getClientRects().length > 0;
    return {
      i,
      shown,
      source: pane?.querySelector('#ui-source-chip')?.innerText.replace(/\\s+/g, ' ').trim() ?? null,
      total: pane?.querySelector('#ui-stitched-total')?.innerText.trim() ?? null,
      rows: Array.from(pane?.querySelectorAll('ol[aria-label^="Segments"] > li') ?? []).map((li) => li.innerText.replace(/\\s+/g, ' ').trim()),
    };
  }))()`);
}

const S = {
  wsTabs: 'div[role="tab"]',
  newTab: 'button[aria-label="New tab"]',
  markIn: "#ui-mark-in:visible",
  markOut: "#ui-mark-out:visible",
  add: "#ui-add-segment:visible",
  cut: "#ui-cut:visible",
  urlInput: 'input[type="url"]:visible',
};

async function loadLive(a, url, waitMs = 2200) {
  if (!(await a.win.locator(S.urlInput).count())) {
    await a.win.locator("#ui-source-chip button:has-text('Change')").locator("visible=true").first().click();
  }
  const input = a.win.locator(S.urlInput).first();
  await input.click();
  await input.fill("");
  await input.fill(url);
  await a.win.keyboard.press("Enter");
  await a.win.waitForTimeout(waitMs);
}

async function markLive(a, i, o) {
  await a.win.fill(S.markIn, i);
  await a.win.fill(S.markOut, o);
}

module.exports = { live, allPanes, S, loadLive, markLive };
