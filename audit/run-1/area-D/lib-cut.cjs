/**
 * Real cut flow driver: paste a URL, mark in/out, add the segment, cut.
 * Audit scaffolding; drives the product's own controls only.
 */
async function loadVideo(a, url = "https://www.youtube.com/watch?v=stub0000001") {
  const box = a.win.locator('input[placeholder*="youtube" i], input[placeholder*="link" i], input[type="url"]').first();
  await box.fill(url);
  await box.press("Enter");
  // Wait for the duration readout to stop being 00:00:00.
  for (let i = 0; i < 60; i++) {
    const ready = await a.win.evaluate(() => {
      const t = document.body.innerText;
      return !/Paste a YouTube link to begin/.test(t) && !/Paste a link to preview it/.test(t);
    });
    if (ready) break;
    await a.win.waitForTimeout(500);
  }
  await a.win.waitForTimeout(800);
}

/** Mark in at `from`, out at `to` (seconds), add the segment. */
async function addSegment(a, from, to) {
  await a.win.evaluate((t) => {
    const v = document.querySelector("video");
    if (v) { v.currentTime = t; v.dispatchEvent(new Event("timeupdate")); }
  }, from);
  await a.win.waitForTimeout(250);
  await a.win.click("#ui-mark-in");
  await a.win.evaluate((t) => {
    const v = document.querySelector("video");
    if (v) { v.currentTime = t; v.dispatchEvent(new Event("timeupdate")); }
  }, to);
  await a.win.waitForTimeout(250);
  await a.win.click("#ui-mark-out");
  await a.win.waitForTimeout(250);
  await a.win.click("#ui-add-segment");
  await a.win.waitForTimeout(400);
}

/** Click Cut and wait for the saved toast (or a failure). */
async function cut(a, waitMs = 40000) {
  await a.win.click("#ui-cut");
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const s = await a.win.evaluate(() => ({
      toast: /Clip saved/.test(document.body.innerText),
      alert: Array.from(document.querySelectorAll('[role="alert"]')).map((e) => e.innerText.trim()).join(" || "),
      text: document.body.innerText,
    }));
    if (s.toast) return { ok: true };
    if (/could not|failed|Error|error/i.test(s.alert) && s.alert.length > 3) return { ok: false, why: s.alert };
    await a.win.waitForTimeout(500);
  }
  const t = await a.win.evaluate(() => document.body.innerText);
  return { ok: false, why: "timed out waiting for the saved toast", tail: t.slice(0, 1200) };
}

module.exports = { loadVideo, addSegment, cut };
