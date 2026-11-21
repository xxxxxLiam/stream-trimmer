/**
 * E/T3 — owner-star build, real UI export end to end, then CSV byte checks.
 *
 * Hostile payloads in every text column: comma, double quote, newline, a
 * leading "=" (Excel/Sheets formula injection), emoji, RTL.
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const NASTY_TITLE =
  'Comma, then "quoted", then =SUM(1+1)+cmd|\' /C calc\'!A1 then 🎬 then שלום עולם';
const NASTY_COMMENT = 'line one\nline two, with "quotes" and =HYPERLINK("http://evil.invalid","x") 😀 مرحبا';
const NASTY_VTT = `WEBVTT

1
00:00:00.000 --> 00:00:02.000
=1+1, "quoted" caption 🎬 עברית

2
00:00:02.000 --> 00:00:04.000
second, line with, commas
`;

const VTT_B = NASTY_VTT; // same stub config serves every video

(async () => {
  L.useShape("owner-star");
  const root = L.stubRoot("t3");
  const saveDir = "/tmp/area-E-save/t3";
  fs.rmSync(saveDir, { recursive: true, force: true });
  fs.mkdirSync(saveDir, { recursive: true });

  L.writeStub(root, {
    info: L.channelInfo({
      count: 3,
      channel: "Stub Channel",
      videoTitle: NASTY_TITLE,
      description: "desc with #tagone and a comma, plus =2+2",
      tags: ["tag, with comma", 'tag "quoted"'],
      comments: [
        {
          id: "c1",
          parent: "root",
          text: NASTY_COMMENT,
          author: 'A, "B" 😀',
          author_id: "UCaaa",
          like_count: 5,
          time_text: "2 days ago",
          timestamp: 1700000000,
          is_pinned: true,
          author_is_uploader: false,
        },
        {
          id: "c2",
          parent: "c1",
          text: "=cmd reply",
          author: "Replier",
          author_id: "UCbbb",
          like_count: 0,
        },
      ],
    }),
    vtt: VTT_B,
    exitCode: 0,
    delayMs: 0,
    writeMedia: false,
  });

  const outDir = path.join(L.OUT, "t3-export");
  const a = await L.launchApp({
    label: "t3-export",
    outDir,
    cwd: root,
    seed: {
      "clipper.dataDirConfirmed": true,
      "clipper.dataDir": saveDir,
      "clipper.clipsDir": saveDir,
    },
  });
  const r = { saveDir };
  try {
    await a.win.waitForSelector("header", { timeout: 20000 });
    r.signIn = await L.signIn(a);
    await a.win.waitForSelector("#ui-channel-link", { timeout: 20000 });
    r.shot_header = await a.shot("owner-header");
    await a.win.click("#ui-channel-link");
    await a.win.waitForTimeout(400);
    r.shot_panel = await a.shot("exporter-panel");

    // --- accessibility snapshot of the panel ----------------------------
    r.a11y = await a.win.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input, button, [role]"));
      const described = (el) => {
        const id = el.getAttribute("id");
        const lab = id ? document.querySelector(`label[for="${id}"]`) : null;
        const wrap = el.closest("label");
        return {
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute("type"),
          id: id || null,
          ariaLabel: el.getAttribute("aria-label"),
          ariaLabelledby: el.getAttribute("aria-labelledby"),
          labelFor: lab ? lab.textContent.trim().slice(0, 60) : null,
          wrappingLabel: wrap ? wrap.textContent.trim().slice(0, 60) : null,
          placeholder: el.getAttribute("placeholder"),
          role: el.getAttribute("role"),
          text: (el.textContent || "").trim().slice(0, 40),
        };
      };
      return inputs.map(described);
    });

    // keyboard-only: tab from the top of the panel and record the focus order
    r.tabOrder = await a.win.evaluate(() => null); // filled below via real keys

    const order = [];
    await a.win.evaluate(() => document.body.focus());
    for (let i = 0; i < 22; i++) {
      await a.win.keyboard.press("Tab");
      order.push(
        await a.win.evaluate(() => {
          const e = document.activeElement;
          if (!e) return "none";
          return `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${
            e.getAttribute("type") ? "[" + e.getAttribute("type") + "]" : ""
          }:${(e.getAttribute("aria-label") || e.textContent || e.getAttribute("placeholder") || "").trim().slice(0, 34)}`;
        }),
      );
    }
    r.tabOrder = order;

    // --- fill and export -------------------------------------------------
    const urlInput = a.win.locator('input[placeholder="https://www.youtube.com/@channelhandle"]');
    await urlInput.fill("https://www.youtube.com/@stubchannel");
    await a.win.locator('input[type="number"]').fill("10");
    r.shot_filled = await a.shot("filled");

    const exportBtn = a.win.locator('button:has-text("Export channel")');
    r.exportDisabled = await exportBtn.isDisabled();
    await exportBtn.click();
    // progress panel
    try {
      await a.win.waitForSelector('button:has-text("Stop")', { timeout: 4000 });
      r.shot_progress = await a.shot("in-progress");
      r.progressText = await a.win.evaluate(
        () => document.body.innerText.match(/Reading the channel list|Video details.*|Comments and transcripts.*|Working/g) || [],
      );
      r.progressAria = await a.win.evaluate(() => {
        const bars = Array.from(document.querySelectorAll('[role="progressbar"], [aria-live], [aria-valuenow]'));
        return bars.map((b) => ({
          role: b.getAttribute("role"),
          live: b.getAttribute("aria-live"),
          now: b.getAttribute("aria-valuenow"),
          text: (b.textContent || "").trim().slice(0, 60),
        }));
      });
    } catch {
      r.progressMissed = "progress panel gone before it could be sampled";
    }

    await a.win.waitForSelector('text=/Export saved|Partial export saved/', { timeout: 120000 });
    r.shot_done = await a.shot("done");
    r.resultText = await a.win.evaluate(() => {
      const el = Array.from(document.querySelectorAll("div")).find((d) =>
        /Export saved|Partial export saved/.test(d.textContent || ""),
      );
      return el ? el.innerText : null;
    });
  } catch (e) {
    r.error = String(e);
    r.shot_error = await a.shot("error");
  } finally {
    r.pageErrors = a.logs.pageErrors;
    r.stderrTail = a.logs.stderr.slice(-4).join("");
    await a.close();
  }

  // --- what landed on disk ---------------------------------------------
  const folders = fs.existsSync(saveDir) ? fs.readdirSync(saveDir) : [];
  r.savedFolders = folders;
  r.files = {};
  for (const f of folders) {
    const d = path.join(saveDir, f);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      r.files[name] = { path: p, bytes: fs.statSync(p).size };
    }
  }
  // leftovers in tmp
  r.tmpLeftovers = fs
    .readdirSync("/tmp")
    .filter((n) => n.startsWith("ytchan-"))
    .map((n) => ({ n, entries: (() => { try { return fs.readdirSync(path.join("/tmp", n)); } catch { return "?"; } })() }));

  console.log(JSON.stringify(r, null, 2));
  L.save(outDir, "report.json", r);
})();
