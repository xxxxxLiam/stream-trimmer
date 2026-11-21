/**
 * v-c4-categorise.cjs — C-4. Is there really NO way to set or change a bank
 * row's category or tier after import?
 *
 * Written to DISPROVE the claim if possible: the script enumerates every
 * interactive node in the clips column on both sub-tabs, then actively hunts
 * for an editor — single click, double click, right click (context menu),
 * Enter, F2, and a click on the category/tier chip itself — and after each one
 * re-counts inputs, selects, contenteditables and any dialog that appeared.
 * It also re-imports the same id with a new category to see whether that is a
 * working route.
 *
 * Usage: STUB=/tmp/vstubX xvfb-run -a node v-c4-categorise.cjs
 */
const { boot, loadUrl } = require("./v-lib.cjs");

const VID = "stub0000001";
const campaign = {
  id: "acme",
  name: "Acme Q4",
  targetMinSec: 30,
  targetMaxSec: 60,
  hardMaxSec: 90,
  clipIdPattern: "{prefix}-{videoId}-{nn}",
  prefix: "AQ",
  format: "mp4",
  quality: "best",
  clipsDir: "/tmp/v-c4-clips",
  dataDir: "/tmp/v-c4-data",
  usedRanges: {},
};

const editors = () => {
  const vis = (el) => el && el.offsetParent !== null;
  const col = document.querySelector("#ui-col-clips") || document.body;
  return {
    inputs: [...col.querySelectorAll("input, select, textarea")]
      .filter(vis)
      .map((e) => `${e.tagName}[${e.type || ""}] ${e.getAttribute("aria-label") || e.placeholder || ""}`),
    contentEditable: [...col.querySelectorAll('[contenteditable="true"]')].filter(vis).length,
    dialogs: [...document.querySelectorAll('[role="dialog"], [role="menu"]')].filter(vis).length,
    anyCategoryWording: /set category|change category|edit category|set tier|change tier|recategor/i.test(
      col.innerText,
    ),
  };
};

const allControls = () => {
  const vis = (el) => el && el.offsetParent !== null;
  const col = document.querySelector("#ui-col-clips") || document.body;
  return [...col.querySelectorAll('button, [role="button"], [role="option"], input, select, textarea, a')]
    .filter(vis)
    .map((e) =>
      (e.getAttribute("aria-label") || e.innerText || e.placeholder || e.tagName)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 70),
    );
};

(async () => {
  const a = await boot({
    label: "v-c4-categorise",
    stubRoot: process.env.STUB,
    viewport: { width: 1440, height: 1250 },
    seed: {
      "clipper.dataDirConfirmed": true,
      "clipper.campaigns": [campaign],
      "clipper.activeCampaign": "acme",
      "clipper.bank": {
        acme: {
          [VID]: [
            { id: "OLD1", label: "no category at all", segments: [{ start: 60, end: 100 }], status: "banked" },
            { id: "OLD2", label: "has one", segments: [{ start: 200, end: 240 }], status: "banked", category: "hook", tier: "T1" },
          ],
        },
      },
    },
  });
  try {
    await loadUrl(a, `https://www.youtube.com/watch?v=${VID}`);
    await a.win.waitForTimeout(1500);
    await a.win.locator('[id^="clips-tab-"]:visible', { hasText: "Bank" }).first().click();
    await a.win.waitForTimeout(600);
    a.log("every control in the clips column (Bank tab):", await a.win.evaluate(allControls));
    a.log("editors present:", await a.win.evaluate(editors));
    await a.shot("bank-tab");

    const row = a.win.locator('#clips-panel [role="button"]').first();
    a.log("row text:", (await row.innerText()).replace(/\s+/g, " ").trim());

    await row.click();
    await a.win.waitForTimeout(800);
    a.log("after a single click on the row:", await a.win.evaluate(editors));

    await row.dblclick();
    await a.win.waitForTimeout(800);
    a.log("after a double click:", await a.win.evaluate(editors));

    await row.click({ button: "right" });
    await a.win.waitForTimeout(800);
    a.log("after a right click:", await a.win.evaluate(editors));

    await row.focus();
    await a.win.keyboard.press("Enter");
    await a.win.waitForTimeout(400);
    await a.win.keyboard.press("F2");
    await a.win.waitForTimeout(400);
    a.log("after Enter then F2 on the focused row:", await a.win.evaluate(editors));

    // Click the category chip itself, if there is one.
    const chip = a.win.locator('#clips-panel .chip', { hasText: "hook" }).first();
    if (await chip.count()) {
      await chip.click({ force: true });
      await a.win.waitForTimeout(800);
      a.log("after clicking the 'hook' chip on the row:", await a.win.evaluate(editors));
    } else {
      a.log("no 'hook' chip found on a row");
    }
    await a.shot("after-hunting");

    // The other sub-tabs.
    for (const name of ["This video", "All saved"]) {
      const t = a.win.locator('[id^="clips-tab-"]:visible', { hasText: name }).first();
      if (await t.count()) {
        await t.click();
        await a.win.waitForTimeout(600);
        a.log(`controls on the [${name}] tab:`, await a.win.evaluate(allControls));
        a.log(`editors on [${name}]:`, await a.win.evaluate(editors));
      }
    }

    // Is re-importing the same id with a category a working route?
    // Reload first: the chip click above left a category filter applied.
    await a.win.reload();
    await a.win.waitForTimeout(3500);
    await loadUrl(a, `https://www.youtube.com/watch?v=${VID}`);
    await a.win.waitForTimeout(1500);
    await a.win.locator('[id^="clips-tab-"]:visible', { hasText: "Bank" }).first().click();
    await a.win.waitForTimeout(500);
    await a.win.locator("button:visible", { hasText: "Import timestamps" }).first().click();
    await a.win.locator("textarea:visible").first().fill("OLD1 1:00-1:40 no category at all | payoff | T2");
    await a.win.waitForTimeout(1200);
    const btn = a.win.locator("button:visible", { hasText: /^Import \d+ clip/ }).first();
    a.log("re-import button:", await btn.innerText().catch(() => "none"));
    await btn.click();
    await a.win.waitForTimeout(1500);
    a.log("rows after re-importing OLD1 with a category:", await a.win.evaluate(() =>
      [...document.querySelectorAll('#clips-panel [role="button"]')]
        .filter((e) => e.offsetParent)
        .map((e) => e.innerText.replace(/\s+/g, " ").trim().slice(0, 80))));
    await a.shot("after-reimport");
  } finally {
    a.log("PROOF:", a.writeLog());
    await a.close();
  }
})();
