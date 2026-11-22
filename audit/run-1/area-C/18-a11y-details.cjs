/**
 * File: 18-a11y-details.cjs
 * Path: audit/run-1/area-C/18-a11y-details.cjs
 * Description: Area C: accessible names and structure of a bank row, focus handling around
 *   the importer, and the singular/plural count line. Audit-only.
 */
const { boot, campaign, clip, loadVideo, openBankTab, VID } = require("./lib.cjs");
const log = (...x) => console.log("[C18]", ...x);

(async () => {
  const a = await boot("C18-a11y", {
    "clipper.campaigns": [campaign("acme-q4", "Acme Q4")],
    "clipper.activeCampaign": "acme-q4",
    "clipper.bank": { "acme-q4": { [VID]: [clip("A01", 60, 90, { category: "hook", tier: "1" })] } },
  });
  try {
    await loadVideo(a);
    await openBankTab(a);
    await a.win.waitForTimeout(500);
    log("count line with exactly one clip:", JSON.stringify((await a.win.locator("#ui-col-clips").innerText()).split("\n").find((l) => /clips?/.test(l))));
    log("shot:", await a.shot("one-clip-count"));

    const row = await a.win.evaluate(() => {
      const el = document.querySelector('#ui-col-clips [role="button"]');
      if (!el) return null;
      return {
        role: el.getAttribute("role"),
        tabindex: el.getAttribute("tabindex"),
        ariaLabel: el.getAttribute("aria-label"),
        nestedInteractive: [...el.querySelectorAll("button,a,input,select")].map((b) => b.getAttribute("aria-label") || b.textContent.trim()),
        text: el.innerText.replace(/\n/g, " | "),
      };
    });
    log("bank row:", JSON.stringify(row));

    // focus order through a row
    await a.win.evaluate(() => document.querySelector('#ui-col-clips input[aria-label="Search the bank"]').focus());
    const seq = [];
    for (let i = 0; i < 6; i++) {
      await a.win.keyboard.press("Tab");
      seq.push(await a.win.evaluate(() => {
        const e = document.activeElement;
        return `${e.tagName}${e.getAttribute("role") ? `[${e.getAttribute("role")}]` : ""}:${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30)}`;
      }));
    }
    log("tab order from the search box:", JSON.stringify(seq));

    // focus when the importer opens and when it is cancelled
    await a.win.click('#ui-col-clips button:has-text("Import timestamps")');
    await a.win.waitForTimeout(400);
    log("focus right after opening the importer:", await a.win.evaluate(() => `${document.activeElement?.tagName}:${(document.activeElement?.getAttribute("aria-label") || "").slice(0, 30)}`));
    log("textarea has a label:", await a.win.evaluate(() => {
      const ta = document.querySelector('textarea[placeholder="Paste your timestamps here"]');
      const lab = ta && document.querySelector(`label[for="${ta.id}"]`);
      return lab ? lab.textContent : "(none)";
    }));
    await a.win.click('#ui-col-clips button:has-text("Cancel")');
    await a.win.waitForTimeout(400);
    log("focus after Cancel:", await a.win.evaluate(() => `${document.activeElement?.tagName}:${(document.activeElement?.textContent || "").trim().slice(0, 30)}`));
    log("pageErrors:", JSON.stringify(a.logs.pageErrors).slice(0, 300));
  } catch (e) {
    console.error("FAIL", e);
  } finally {
    await a.close();
  }
})();
