/**
 * File: c1-negative-control.cjs
 * Path: audit/run-2/area-B/c1-negative-control.cjs
 * Description: Settles C-1 (two tabs + a non-empty clip bank blanked the whole app,
 *   React #185) by driving ONE script against three builds. Audit-only.
 *
 *   Usage: xvfb-run -a node c1-negative-control.cjs <head|rev0|rev1>
 *     rev0 = 26ea7ab, the run-1 code before any fix        -> the negative control
 *     rev1 = HEAD with ONLY the C-1 call site reverted     -> the brief's revert
 *     head = the real tree
 *
 *   Precondition the brief insists on, and which an earlier false pass missed:
 *   TWO TABS BOTH SHOWING THE SAME VIDEO, and a bank row that still yields a
 *   PLANNED range (status "banked", never cut). The seed below is checked after
 *   loading: `planned` is read off the timeline and the bank row's own status is
 *   printed, so a run that silently failed the precondition is visible.
 */
const { boot, stubRoot, live, allPanes, alive, reactErrors, loadLive, campaign, bankClip, S, SP } = require("./lib.cjs");

const TREE = process.argv[2] || "head";
const STUB = `${SP}/stubB2`;
const VID = "stub0000001";
const URL = `https://www.youtube.com/watch?v=${VID}`;
const log = (...x) => console.log(`[c1:${TREE}]`, ...x);

(async () => {
  const stub = stubRoot(STUB);
  stub.write({ info: { id: VID, title: "Bank video", duration: 600, uploader: "Ch" }, transcriptLines: 10 });

  const a = await boot({
    tree: TREE,
    label: `c1-${TREE}`,
    stub: STUB,
    viewport: { width: 1440, height: 900 },
    seed: {
      "clipper.campaigns": [campaign("acme-q4", "Acme Q4")],
      "clipper.activeCampaign": "acme-q4",
      // Two rows, both status "banked" => both still yield PLANNED ranges.
      "clipper.bank": { "acme-q4": { [VID]: [bankClip("A01", 60, 90), bankClip("A02", 120, 150)] } },
    },
  });

  try {
    log("booted. alive:", JSON.stringify(await alive(a)));

    // --- tab 1: load the video, open the Bank sub-tab -------------------------------
    await loadLive(a, URL);
    await a.win.click("#clips-tab-bank").catch(() => log("no #clips-tab-bank"));
    await a.win.waitForTimeout(800);
    log("tab 1 loaded. alive:", JSON.stringify(await alive(a)));
    log("PRECONDITION bank rows on screen:", JSON.stringify(await a.win.evaluate(() => {
      const col = Array.from(document.querySelectorAll("#ui-col-clips")).find((c) => c.offsetParent !== null);
      return col ? col.innerText.replace(/\s+/g, " ").trim().slice(0, 260) : null;
    })));
    log("PRECONDITION planned ranges painted on the timeline:", JSON.stringify(await a.win.evaluate(() => {
      const els = Array.from(document.querySelectorAll('[title]')).map((e) => e.getAttribute("title")).filter((t) => /^Banked/.test(t || ""));
      return els;
    })));
    log("bank statuses on disk:", JSON.stringify((a.readState()["clipper.bank"] || {})["acme-q4"]?.[VID]?.map((c) => [c.id, c.status])));
    log("shot:", await a.shot("tab1-bank"));

    // --- step 2: a second tab ------------------------------------------------------
    await a.win.click(S.newTab);
    await a.win.waitForTimeout(3000);
    log("AFTER NEW TAB alive:", JSON.stringify(await alive(a)));
    log("AFTER NEW TAB react errors:", JSON.stringify(reactErrors(a)).slice(0, 400));
    log("shot:", await a.shot("after-new-tab"));

    // --- step 3: the precondition proper — BOTH tabs on the SAME video --------------
    await loadLive(a, URL);
    await a.win.waitForTimeout(1500);
    await a.win.click("#clips-tab-bank").catch(() => {});
    await a.win.waitForTimeout(3000);
    log("BOTH TABS SAME VIDEO alive:", JSON.stringify(await alive(a)));
    log("clips columns mounted:", await a.win.evaluate(() => document.querySelectorAll("#clips-tab-bank").length).catch(() => "n/a"));
    log("panes:", JSON.stringify(await allPanes(a)).slice(0, 500));
    log("react errors:", JSON.stringify(reactErrors(a)).slice(0, 600));
    log("shot:", await a.shot("both-tabs-same-video"));

    // --- step 4: switch between them a few times (the plan is repainted each time) ---
    for (let i = 0; i < 4; i++) {
      const tabs = await a.win.locator(S.wsTabs).all();
      await tabs[i % 2].click().catch(() => {});
      await a.win.waitForTimeout(500);
    }
    await a.win.waitForTimeout(2000);
    log("AFTER SWITCHING alive:", JSON.stringify(await alive(a)));
    log("AFTER SWITCHING live pane:", JSON.stringify(await live(a)));
    log("react errors:", JSON.stringify(reactErrors(a)).slice(0, 600));
    log("shot:", await a.shot("after-switching"));

    // --- step 5: does the HIDDEN tab get its own plan painted? (T4's open question) --
    log("planned outlines per pane:", JSON.stringify(await a.win.evaluate(() =>
      Array.from(document.querySelectorAll("#ui-mark-in")).map((el, i) => {
        const pane = el.closest("div.absolute.inset-0");
        const titles = Array.from(pane?.querySelectorAll("[title]") ?? [])
          .map((e) => e.getAttribute("title"))
          .filter((t) => /^Banked/.test(t || ""));
        return { i, shown: el.offsetParent !== null, planned: titles.length, titles: titles.slice(0, 3) };
      }),
    ).catch((e) => String(e))));

    log("8s later alive:", JSON.stringify(await (async () => { await a.win.waitForTimeout(8000); return alive(a); })()));
    log("bank on disk after:", JSON.stringify(a.readState()["clipper.bank"]));
  } catch (e) {
    log("SCRIPT ERROR", e && e.message);
    log("alive at error:", JSON.stringify(await alive(a)));
    log("react errors:", JSON.stringify(reactErrors(a)).slice(0, 600));
    await a.shot("error").catch(() => {});
  }
  await a.close();
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
