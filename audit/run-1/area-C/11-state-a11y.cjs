/**
 * File: 11-state-a11y.cjs
 * Path: audit/run-1/area-C/11-state-a11y.cjs
 * Description: Area C: older bank shape, malformed campaign entries, a bank keyed to a
 *   campaign that no longer exists, the controls a bank row actually offers, counts across
 *   screens, delete-a-row-then-re-import, and a keyboard-only import. Audit-only.
 */
const { boot, campaign, clip, loadVideo, openBankTab, importBlock, bankOf, VID } = require("./lib.cjs");

const log = (...x) => console.log("[C11]", ...x);
const colText = (a) => a.win.locator("#ui-col-clips").innerText();

(async () => {
  const a = await boot("C11-state", {
    "clipper.campaigns": [
      campaign("acme-q4", "Acme Q4"),
      null,
      { id: "no-name-here" },
      { name: "no id here" },
      "a bare string",
      { id: "acme-q4", name: "Duplicate id" },
      campaign("beta-launch", "Beta Launch"),
    ],
    "clipper.activeCampaign": "acme-q4",
    "clipper.bank": {
      "acme-q4": {
        [VID]: [
          // older shape: no category, no tier, no status
          { id: "OLD1", label: "from an older version", segments: [{ start: 10, end: 20 }] },
          { id: "OLD2", segments: [{ start: 30, end: 40 }] },
          // malformed rows that must not crash the load
          { id: "BAD1", segments: "not an array" },
          { label: "no id", segments: [{ start: 1, end: 2 }] },
          { id: "BAD3", segments: [{ start: 50, end: 10 }] },
          null,
          clip("GOOD1", 100, 130, { category: "hook", tier: "2" }),
        ],
      },
      "a-campaign-that-no-longer-exists": { [VID]: [clip("GHOST", 5, 9, { category: "ghost" })] },
    },
  });
  try {
    log("campaigns that survived the load:", JSON.stringify(a.readState()["clipper.campaigns"]?.length));
    await a.win.click("#ui-campaign-chip");
    log("campaign menu:", JSON.stringify((await a.win.locator('[role="dialog"][aria-label="Campaign"]').innerText()).replace(/\n/g, " | ")));
    log("shot:", await a.shot("malformed-campaigns"));
    await a.win.keyboard.press("Escape");
    await a.win.mouse.click(700, 400);

    await loadVideo(a);
    await openBankTab(a);
    await a.win.waitForTimeout(500);
    const t = await colText(a);
    log("bank view with an older/malformed bank:", JSON.stringify(t.split("\n")));
    log("pageErrors so far:", JSON.stringify(a.logs.pageErrors).slice(0, 300));
    log("shot:", await a.shot("old-shape-bank"));

    // ---- what controls does a bank row actually offer? (categorise / set tier?)
    const rowControls = await a.win.evaluate(() => {
      const li = document.querySelector("#ui-col-clips ul li");
      if (!li) return null;
      return {
        buttons: [...li.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") || b.textContent.trim()),
        inputs: [...li.querySelectorAll("input,select,textarea")].map((e) => e.tagName),
        editable: [...li.querySelectorAll("[contenteditable]")].length,
      };
    });
    log("controls on a bank row:", JSON.stringify(rowControls));
    const anyCatControl = await a.win.evaluate(() =>
      [...document.querySelectorAll("#ui-col-clips button, #ui-col-clips input, #ui-col-clips select")]
        .map((e) => (e.getAttribute("aria-label") || e.textContent || e.placeholder || "").trim())
        .filter(Boolean),
    );
    log("every control in the clips column:", JSON.stringify(anyCatControl));

    // ---- counts across screens: the setup checklist item for the bank
    const checklist = async () => {
      await a.win.click("#ui-help-button");
      await a.win.waitForTimeout(600);
      const txt = await a.win.locator("#ui-help-drawer").innerText();
      const i = txt.indexOf("Import a clip bank");
      const out = txt.slice(i, i + 160).replace(/\n/g, " | ");
      await a.win.keyboard.press("Escape");
      await a.win.waitForTimeout(300);
      return out;
    };
    log("checklist under Acme (has rows):", JSON.stringify(await checklist()));
    await a.win.click("#ui-campaign-chip");
    await a.win.locator('[role="option"]:has-text("Beta Launch")').first().click();
    await a.win.waitForTimeout(500);
    log("checklist under Beta (empty bank):", JSON.stringify(await checklist()));
    await a.win.click("#ui-campaign-chip");
    await a.win.locator('[role="option"]:has-text("Acme Q4")').first().click();
    await a.win.waitForTimeout(500);
    await openBankTab(a);

    // ---- delete a row, then re-import the same block
    const before = (await colText(a)).split("\n").find((l) => /clips/.test(l));
    await a.win.click('button[aria-label="Remove GOOD1 from the bank"]');
    await a.win.waitForTimeout(400);
    log("after removing GOOD1:", JSON.stringify((await colText(a)).split("\n").find((l) => /clips/.test(l))), "was", JSON.stringify(before));
    log("rows on disk:", JSON.stringify(bankOf(a, "acme-q4").map((c) => c.id)));
    log("re-import the same clip:", await importBlock(a, "GOOD1 1:40-2:10 | hook | T2"));
    log("rows on disk after re-import:", JSON.stringify(bankOf(a, "acme-q4").map((c) => c.id)));
    log("shot:", await a.shot("removed-then-reimported"));

    // ---- keyboard only: tab to Import timestamps, type, confirm
    await a.win.evaluate(() => document.body.focus());
    await a.win.keyboard.press("Tab");
    const path2 = [];
    let opened = false;
    for (let i = 0; i < 60; i++) {
      const cur = await a.win.evaluate(() => {
        const e = document.activeElement;
        return e ? `${e.tagName}:${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 28)}` : "none";
      });
      path2.push(cur);
      if (/Import timestamps/.test(cur)) {
        await a.win.keyboard.press("Enter");
        opened = true;
        break;
      }
      await a.win.keyboard.press("Tab");
    }
    log("keyboard: reached Import timestamps in", path2.length, "tabs?", opened);
    log("keyboard: focus path", JSON.stringify(path2.slice(-12)));
    if (opened) {
      await a.win.waitForTimeout(300);
      const focused = await a.win.evaluate(() => document.activeElement?.tagName);
      log("keyboard: focus after opening the importer is on", focused);
      // tab to the textarea and type
      for (let i = 0; i < 10; i++) {
        const tag = await a.win.evaluate(() => document.activeElement?.tagName);
        if (tag === "TEXTAREA") break;
        await a.win.keyboard.press("Tab");
      }
      log("keyboard: landed on", await a.win.evaluate(() => document.activeElement?.tagName));
      await a.win.keyboard.type("K01 3:00-3:30 typed by keyboard | hook | T1");
      await a.win.waitForTimeout(300);
      // tab onward to the confirm button
      let hit = "";
      for (let i = 0; i < 12; i++) {
        await a.win.keyboard.press("Tab");
        hit = await a.win.evaluate(() => (document.activeElement?.textContent || "").trim().slice(0, 30));
        if (/^Import \d/.test(hit)) break;
      }
      log("keyboard: confirm button reached?", JSON.stringify(hit));
      if (/^Import \d/.test(hit)) {
        await a.win.keyboard.press("Enter");
        await a.win.waitForTimeout(500);
        log("keyboard: imported ->", JSON.stringify(bankOf(a, "acme-q4").map((c) => c.id)));
      }
      log("shot:", await a.shot("keyboard-import"));
    }
    log("final bank keys on disk:", JSON.stringify(Object.keys(a.readState()["clipper.bank"] || {})));
    log("pageErrors:", JSON.stringify(a.logs.pageErrors).slice(0, 400));
  } catch (e) {
    console.error("FAIL", e);
    try { log("shot fail:", await a.shot("fail")); } catch {}
  } finally {
    await a.close();
  }
})();
