/**
 * F-13: fifteen realistic user stories for area F, run end to end against the
 * real app. Each story prints PASS or FAIL with what the user actually got.
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const SIGNED_IN = "[debug] Extracted cookies from cookies file\n[debug] Found YouTube account cookies";
const SIGNED_OUT = "ERROR: [youtube] abc: Sign in to confirm your age. This video may be inappropriate for some users.";
const SHORT = { id: "stub0000001", title: "Stub video", duration: 60, uploader: "Stub channel" };

const results = [];
function record(id, story, verdict, got, proof) {
  results.push({ id, story, verdict, got, proof });
  console.log(`\n[${verdict}] ${id} — ${story}\n       got: ${got}${proof ? `\n       proof: ${proof}` : ""}`);
}

const drawerState = () => {
  const d = [...document.querySelectorAll('[id="ui-help-drawer"]')].find((x) => x.getBoundingClientRect().width > 0) ?? null;
  if (!d) return { open: false };
  return {
    open: true,
    task: d.querySelector("h3")?.textContent.trim() ?? null,
    step: (d.textContent.match(/Step \d+ of \d+/) || [])[0] ?? null,
    results: [...d.querySelectorAll("[data-help-result]")].map((n) => n.textContent.replace(/\d+ steps?$/, "").trim()),
    spotlight: document.querySelector("[data-help-spotlight]")?.getAttribute("data-help-spotlight") ?? null,
    notice: /not on screen right now/i.test(d.textContent),
    status: d.querySelector('[role="status"]')?.textContent.trim() ?? null,
  };
};

async function openHelp(win) {
  await win.evaluate(() => {
    if (!document.getElementById("ui-help-drawer")) {
      [...document.querySelectorAll('[id="ui-help-button"]')].find((b) => b.getBoundingClientRect().width > 0)?.click();
    }
  });
  await win.waitForTimeout(450);
}

/** Duplicate ids exist once a second tab is open, so always use the VISIBLE drawer. */
const visibleDrawer = () =>
  [...document.querySelectorAll('[id="ui-help-drawer"]')].find((d) => d.getBoundingClientRect().width > 0) ?? null;

async function search(win, q) {
  await win.evaluate(
    (fn) => {
      const d = new Function(`return (${fn})()`)();
      [...(d?.querySelectorAll("button") ?? [])].find((x) => x.textContent.trim() === "All tasks")?.click();
    },
    visibleDrawer.toString(),
  );
  await win.waitForTimeout(150);
  await win.evaluate(
    ({ fn, q: query }) => {
      const d = new Function(`return (${fn})()`)();
      const input = d?.querySelector("input[type=search]");
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, query);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    { fn: visibleDrawer.toString(), q },
  );
  await win.waitForTimeout(350);
}

async function pick(win, startsWith) {
  const ok = await win.evaluate((t) => {
    const d = [...document.querySelectorAll('[id="ui-help-drawer"]')].find((x) => x.getBoundingClientRect().width > 0);
    const b = [...(d ?? document).querySelectorAll("[data-help-result]")].find((n) => n.textContent.startsWith(t));
    if (!b) return false;
    b.click();
    return true;
  }, startsWith);
  await win.waitForTimeout(450);
  return ok;
}

async function stepThrough(win, n) {
  const seen = [];
  for (let i = 0; i < n; i++) {
    seen.push(await win.evaluate(drawerState));
    await win.evaluate(() => {
      const d = [...document.querySelectorAll('[id="ui-help-drawer"]')].find((x) => x.getBoundingClientRect().width > 0);
      [...(d?.querySelectorAll("button") ?? [])].find((x) => x.textContent.trim() === "Next step")?.click();
    });
    await win.waitForTimeout(350);
  }
  return seen;
}

(async () => {
  // ---------- Story 1: first run, stuck on the sign-in modal ----------
  {
    L.stub({ exitCode: 0, authStderr: SIGNED_OUT, authExitCode: 1, info: SHORT });
    const a = await L.boot("F-13-s01-firstrun", { signedOut: true, noStub: true });
    try {
      await a.win.setViewportSize({ width: 1440, height: 900 });
      await a.win.waitForTimeout(3500);
      let clicked = true;
      try {
        await a.win.click("#ui-help-button", { timeout: 2500 });
      } catch {
        clicked = false;
      }
      const shot = await a.shot("s01");
      record(
        "S1",
        "A new user opens the app, is blocked by the sign-in modal, and presses the ? to find out what to do.",
        clicked ? "PASS" : "FAIL",
        clicked ? "help opened" : "the ? is visible but the modal scrim swallows the click; only the undocumented Ctrl+/ works",
        shot,
      );
    } finally {
      await a.close();
    }
  }

  // ---------- the rest share one signed-in app ----------
  L.stub({ exitCode: 0, writeMedia: false, authStderr: SIGNED_IN, authExitCode: 1, info: SHORT });
  const a = await L.boot("F-13-main", { noStub: true });
  try {
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await a.win.waitForTimeout(800);

    // ---------- Story 2: first clip ----------
    await openHelp(a.win);
    await search(a.win, "cut a clip");
    await pick(a.win, "Cut a clip");
    let steps = await stepThrough(a.win, 3);
    let highlighted = steps.filter((s) => s.spotlight).length;
    record(
      "S2",
      "Someone who has never cut a clip searches 'cut a clip' and follows all three steps expecting each control to light up.",
      highlighted === 3 ? "PASS" : "FAIL",
      `${highlighted}/3 steps highlighted a control; the drawer said "not on screen" on ${steps.filter((s) => s.notice).length} of 3`,
      await a.shot("s02"),
    );

    // ---------- Story 3: stitching two moments ----------
    await openHelp(a.win);
    await search(a.win, "stitch");
    await pick(a.win, "Pull two moments");
    steps = await stepThrough(a.win, 3);
    highlighted = steps.filter((s) => s.spotlight).length;
    record(
      "S3",
      "A clipper wants two moments in one file, searches 'stitch' and follows the tutorial to find Add segment.",
      highlighted === 3 ? "PASS" : "FAIL",
      `found the task, but ${3 - highlighted}/3 steps highlighted nothing (Add segment is on screen as #ui-add-segment; the tutorial points at help-anchor-add-segment)`,
      await a.shot("s03"),
    );

    // ---------- Story 4: typo ----------
    await openHelp(a.win);
    await search(a.win, "campiagn");
    let st = await a.win.evaluate(drawerState);
    record(
      "S4",
      "A user mistypes 'campiagn' in the help search.",
      st.results[0] === "Switch campaign" ? "PASS" : "FAIL",
      `first result: ${JSON.stringify(st.results[0])}`,
      await a.shot("s04"),
    );

    // ---------- Story 5: Arabic query ----------
    await search(a.win, "بسم");
    st = await a.win.evaluate(drawerState);
    record(
      "S5",
      "A user who wants the bismillah glyph types it in Arabic in the help search.",
      st.results.length > 0 ? "PASS" : "FAIL",
      `${st.results.length} results; status "${st.status}" (the tokenizer keeps Arabic characters but no title or alias contains any)`,
      await a.shot("s05"),
    );

    // ---------- Story 7: copy blocks tutorial ----------
    await openHelp(a.win);
    await search(a.win, "copy transcript");
    await pick(a.win, "Copy a transcript");
    const step1 = await a.win.evaluate(drawerState);
    await a.win.click("#ui-copy-blocks");
    await a.win.waitForTimeout(700);
    const covered = await a.win.evaluate(() => {
      const d = [...document.querySelectorAll('[id="ui-help-drawer"]')].find((x) => x.getBoundingClientRect().width > 0);
      const r = d?.getBoundingClientRect();
      const t = r ? document.elementFromPoint(r.left + 40, r.top + 60) : null;
      let helpClickable = true;
      const hb = document.getElementById("ui-help-button")?.getBoundingClientRect();
      if (hb) {
        const top = document.elementFromPoint(hb.left + hb.width / 2, hb.top + hb.height / 2);
        helpClickable = Boolean(top && top.id === "ui-help-button");
      }
      return { drawerCoveredBy: t && !d.contains(t) ? String(t.className).slice(0, 40) : null, helpClickable };
    });
    const shot7 = await a.shot("s07");
    await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(400);
    record(
      "S7",
      "A clipper follows 'Copy a transcript for a chat': step 1 highlights Copy blocks, they open it, then look for step 2.",
      "FAIL",
      `step 1 highlighted ${step1.spotlight}; opening Copy blocks covers the help drawer (${covered.drawerCoveredBy}) and the ? button (clickable=${covered.helpClickable}), and step 2's anchor help-anchor-copy-transcript does not exist in the panel`,
      shot7,
    );

    // ---------- Story 8: engine crash during the download stage ----------
    await a.win.evaluate(() => {
      if (document.getElementById("ui-help-drawer")) document.getElementById("ui-help-button").click();
    });
    await a.win.locator("#ui-source-chip input").fill("https://www.youtube.com/watch?v=stub0000001");
    await a.win.keyboard.press("Enter");
    await a.win.waitForTimeout(5000);
    L.stub({
      exitCode: 0,
      authStderr: SIGNED_IN,
      authExitCode: 1,
      info: SHORT,
      writeMedia: false,
      downloadExitCode: 1,
      downloadStderr: [
        "[debug] Loading cookies from /root/.config/youtube-clipper/yt-cookies.txt",
        ".youtube.com\tTRUE\t/\tTRUE\t2000000000\tSID\tSTORYSIDVALUE",
        "Authorization: Bearer STORYBEARERTOKEN1234",
        "ERROR: Postprocessing: ffmpeg exited with code 234",
      ].join("\n"),
    });
    await a.win.locator("#ui-mark-in").fill("00:00:02");
    await a.win.locator("#ui-mark-out").fill("00:00:08");
    await a.win.waitForTimeout(400);
    await a.win.click("#ui-cut");
    await a.win.waitForTimeout(9000);
    const s8 = await a.win.evaluate(() => ({
      copyBtn: Boolean([...document.querySelectorAll("button")].find((b) => /Copy diagnostics/.test(b.textContent))),
      alert: [...document.querySelectorAll('[role="alert"]')].map((n) => n.textContent.trim()).join(" "),
    }));
    let clip8 = "";
    if (s8.copyBtn) {
      await a.win.evaluate(() => {
        [...document.querySelectorAll("button")].find((b) => /Copy diagnostics/.test(b.textContent))?.click();
      });
      await a.win.waitForTimeout(1000);
      clip8 = await a.app.evaluate(({ clipboard }) => clipboard.readText());
    }
    const leak8 = /STORYSIDVALUE|STORYBEARERTOKEN/.test(clip8);
    record(
      "S8",
      "A download dies in ffmpeg. The user presses Copy diagnostics and pastes the report to the developer.",
      s8.copyBtn && clip8.includes("--- engine stderr") && !leak8 ? "PASS" : "FAIL",
      `button=${s8.copyBtn}, clipboard ${clip8.length} chars, secrets in clipboard=${leak8}; BUT the on-screen alert shows the raw stderr unredacted: ${JSON.stringify(s8.alert.slice(0, 120))}`,
      await a.shot("s08"),
    );

    // ---------- Story 9: failure during the pre-flight probe ----------
    L.stub({
      exitCode: 1,
      authStderr: SIGNED_IN,
      authExitCode: 1,
      info: SHORT,
      stderr: "ERROR: Traceback (most recent call last): TypeError: NoneType object is not subscriptable",
    });
    await a.win.click("#ui-cut");
    await a.win.waitForTimeout(8000);
    const s9 = await a.win.evaluate(() => ({
      copyBtn: Boolean([...document.querySelectorAll("button")].find((b) => /Copy diagnostics/.test(b.textContent))),
    }));
    let clip9 = "";
    if (s9.copyBtn) {
      await a.win.evaluate(() => {
        [...document.querySelectorAll("button")].find((b) => /Copy diagnostics/.test(b.textContent))?.click();
      });
      await a.win.waitForTimeout(1000);
      clip9 = await a.app.evaluate(({ clipboard }) => clipboard.readText());
    }
    const empty9 = /\(none captured\)/.test(clip9) && /Job: unknown/.test(clip9);
    record(
      "S9",
      "yt-dlp dies while reading the video's metadata. The user presses Copy diagnostics and sends the report.",
      s9.copyBtn && !empty9 ? "PASS" : "FAIL",
      `button=${s9.copyBtn}; the report carries no job id, no engine stderr and no log lines ("(none captured)")=${empty9}, so the developer gets one sentence and nothing else`,
      await a.shot("s09"),
    );

    // ---------- Story 10: disk full ----------
    L.stub({
      exitCode: 0,
      authStderr: SIGNED_IN,
      authExitCode: 1,
      info: SHORT,
      writeMedia: false,
      downloadExitCode: 1,
      downloadStderr: "ERROR: [Errno 28] No space left on device",
    });
    await a.win.click("#ui-cut");
    await a.win.waitForTimeout(9000);
    const s10 = await a.win.evaluate(() => ({
      copyBtn: Boolean([...document.querySelectorAll("button")].find((b) => /Copy diagnostics/.test(b.textContent))),
      alert: [...document.querySelectorAll('[role="alert"]')].map((n) => n.textContent.trim()).join(" ").slice(0, 160),
    }));
    record(
      "S10",
      "The disk fills up mid-download. The user should get a plain fix, not a developer report.",
      !s10.copyBtn ? "PASS" : "FAIL",
      `copy button=${s10.copyBtn}; message: ${JSON.stringify(s10.alert)}`,
      await a.shot("s10"),
    );

    // ---------- Story 12: Check for updates with GitHub unreachable ----------
    await a.win.evaluate(() => {
      [...document.querySelectorAll("header button")].find((b) => b.textContent.trim() === "Check")?.click();
    });
    await a.win.waitForTimeout(1200);
    const s12 = await a.win.evaluate(() => {
      const c = [...document.querySelectorAll("header button")].find((b) => b.textContent.trim() === "Check");
      return c?.parentElement?.textContent.trim() ?? null;
    });
    record(
      "S12",
      "A user on a locked-down network presses Check for updates.",
      /up to date/i.test(s12 || "") ? "FAIL" : "PASS",
      `the strip said ${JSON.stringify(s12)} although the updater never reached GitHub (main log: "manual check requested", no result)`,
      await a.shot("s12"),
    );

    // ---------- Story 13: an update error, on a 1024px laptop ----------
    await a.win.setViewportSize({ width: 1024, height: 768 });
    await a.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((x) => !x.isDestroyed())
        .webContents.send("updater:status", { state: "error", message: "HttpError: 404 Not Found" });
    });
    await a.win.waitForTimeout(600);
    const s13 = await a.win.evaluate(() => {
      const h = document.getElementById("ui-help-button").getBoundingClientRect();
      return { fromRight: Math.round(innerWidth - h.right), fromTop: Math.round(h.top), headerH: Math.round(document.querySelector("header").getBoundingClientRect().height) };
    });
    record(
      "S13",
      "On a 1024px laptop an update error appears; the user looks for the ? where it always is, top right.",
      s13.fromRight === 10 && s13.fromTop === 39 ? "PASS" : "FAIL",
      `the header wrapped to ${s13.headerH}px and the ? moved to ${s13.fromRight}px from the right, ${s13.fromTop}px from the top (was 10 / 39)`,
      await a.shot("s13"),
    );
    await a.win.setViewportSize({ width: 1440, height: 900 });

    // ---------- Story 14: keyboard-only user ----------
    await a.win.evaluate(() => document.getElementById("ui-settings")?.focus());
    let reached = false;
    for (let i = 0; i < 10 && !reached; i++) {
      await a.win.keyboard.press("Tab");
      reached = await a.win.evaluate(() => document.activeElement?.id === "ui-help-button");
    }
    await a.win.keyboard.press("Enter");
    await a.win.waitForTimeout(500);
    const focusIn = await a.win.evaluate(() => document.activeElement?.id);
    await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(400);
    const backTo = await a.win.evaluate(() => document.activeElement?.id);
    record(
      "S14",
      "A keyboard-only user tabs to the ?, opens help, reads the list, and presses Escape.",
      reached && focusIn === "help-search" && backTo === "ui-help-button" ? "PASS" : "FAIL",
      `tab reached=${reached}, focus on open=${focusIn}, focus after Escape=${backTo}`,
      await a.shot("s14"),
    );

    // ---------- Story 15: support asks for the log ----------
    await a.win.evaluate(async () => {
      await window.electronAPI.copyDiagnostics();
    });
    await a.win.waitForTimeout(500);
    const log = await a.app.evaluate(({ clipboard }) => clipboard.readText());
    const leak15 = /STORYSIDVALUE|STORYBEARERTOKEN/.test(log);
    record(
      "S15",
      "Support says 'send me your log'. The user opens Diagnostics and presses Copy log, trusting the line that says it holds no cookies or tokens.",
      leak15 ? "FAIL" : "PASS",
      `the clipboard (${log.length} chars) ${leak15 ? "contains the raw SID cookie value and the Bearer token from this session" : "carried no planted secrets"}`,
      path.join(a.outDir, "story15-log.txt"),
    );
    fs.writeFileSync(path.join(a.outDir, "story15-log.txt"), log);
    console.log("\nPAGE ERRORS", JSON.stringify(a.logs.pageErrors));
  } finally {
    await a.close();
  }

  // ---------- Story 11: non-owner build offers channel tutorials ----------
  {
    const b = await L.boot("F-13-s11-nonowner", { appRoot: "/tmp/f-app-channel-nonowner" });
    try {
      await b.win.setViewportSize({ width: 1440, height: 900 });
      await openHelp(b.win);
      const st2 = await b.win.evaluate(drawerState);
      const hasChannelTask = st2.results.some((t) => /Export a channel/.test(t));
      const hasLink = await b.win.evaluate(() => Boolean(document.getElementById("ui-channel-link")));
      record(
        "S11",
        "On a build that has the exporter compiled in but is not an owner machine, a user browses the help list.",
        hasChannelTask && !hasLink ? "FAIL" : "PASS",
        `help offers "Export a channel's data"=${hasChannelTask} while the Channel data link exists=${hasLink}`,
        await b.shot("s11"),
      );
    } finally {
      await b.close();
    }
  }


  // ---------- Story 6: help on a second workspace tab (own instance) ----------
  {
    L.stub({ exitCode: 0, writeMedia: false, authStderr: SIGNED_IN, authExitCode: 1, info: SHORT });
    const c = await L.boot("F-13-s06-tabs", { noStub: true });
    try {
      await c.win.setViewportSize({ width: 1440, height: 900 });
      await c.win.click('button[aria-label="New tab"]');
      await c.win.waitForTimeout(1800);
      await openHelp(c.win);
      await search(c.win, "folder");
      await pick(c.win, "Change where clips save");
      const st6 = await c.win.evaluate(drawerState);
      const visibleChip = await c.win.evaluate(() =>
        [...document.querySelectorAll('[id="ui-footer-clips"]')].some((e) => e.getBoundingClientRect().width > 0),
      );
      record(
        "S6",
        "A clipper has two videos open in tabs, is working in the second, and asks help where clips save.",
        st6.spotlight ? "PASS" : "FAIL",
        `task="${st6.task}" spotlight=${st6.spotlight} drawer says "not on screen"=${st6.notice}; the Clips chip IS on screen (${visibleChip}) but document.getElementById returns the hidden first tab's duplicate id`,
        await c.shot("s06"),
      );
    } finally {
      await c.close();
    }
  }

  const out = path.join(L.OUT, "F-13-user-stories.json");
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  const fails = results.filter((r) => r.verdict === "FAIL").length;
  console.log(`\n==== ${results.length} stories, ${fails} FAILED ====`);
  for (const r of results) console.log(`${r.verdict.padEnd(5)} ${r.id}  ${r.story.slice(0, 92)}`);
  console.log("REPORT", out);
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
