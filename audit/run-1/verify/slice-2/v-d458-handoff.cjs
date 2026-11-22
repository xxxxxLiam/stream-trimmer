/**
 * slice-2 verification of D-5, D-4 and D-8, each from a cold start, written
 * from the findings' Steps.
 *
 *  part 5  two clips -> "Send all to Final Cut Pro" -> record the document's
 *          inode/size/sha256 and its asset/project counts -> switch
 *          "After cutting" to Final Cut -> cut a third clip -> read the same
 *          path again. The replacement is proven on the filesystem.
 *  part 4  seeded afterCutting=finalcut with a library that does not exist,
 *          cut one clip, collect EVERY role=alert / role=status string on
 *          screen and check the folder for a document and the bad path for a
 *          stray library.
 *  part 8  no campaign at all: type into Library, choose Final Cut in
 *          "After cutting", tick "Also create a project", then read the
 *          controls back and read clipper.editorHandoff out of the store.
 *
 * Usage: xvfb-run -a --server-args="-screen 0 1440x900x24" \
 *          node audit/run-1/verify/slice-2/v-d458-handoff.cjs [tag] [part]
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { makeStubRoot } = require("./vlib.cjs");
const vapp = require("./vapp.cjs");

const TAG = process.argv[2] || "a";
const ONLY = process.argv[3] || "";
const OUT = path.join(__dirname, "out", `d458-${TAG}`);
const URL = "https://www.youtube.com/watch?v=stub0000001";

function campaign(clipsDir, dataDir) {
  return {
    id: "camp-audit",
    name: "Audit D",
    targetMinSec: 1,
    targetMaxSec: 600,
    hardMaxSec: 600,
    clipIdPattern: "{prefix}-{videoId}-{nn}",
    prefix: "AUD",
    format: "mp4",
    quality: "360",
    clipsDir,
    dataDir,
    usedRanges: {},
  };
}

function seed(clipsDir, dataDir, extra = {}) {
  return {
    "clipper.campaigns": [campaign(clipsDir, dataDir)],
    "clipper.activeCampaign": "camp-audit",
    "clipper.clipsDir": clipsDir,
    "clipper.saveDir": clipsDir,
    "clipper.dataDir": dataDir,
    "clipper.dataDirConfirmed": true,
    "clipper.downloads": [],
    ...extra,
  };
}

function freshRoot(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `v-d458-${name}-`));
  const clips = path.join(root, "Clips");
  const data = path.join(root, "channel-data");
  fs.mkdirSync(clips, { recursive: true });
  fs.mkdirSync(data, { recursive: true });
  const stub = path.join(root, "stub");
  fs.mkdirSync(stub, { recursive: true });
  makeStubRoot(stub, { argvLog: true });
  return { root, clips, data, stub };
}

const countIn = (xml, tag) => (xml.match(new RegExp(`<${tag}[ >]`, "g")) || []).length;

async function expandPanel(win) {
  await win.click('section[aria-label="Editor handoff"] > button');
  await win.waitForSelector('section[aria-label="Editor handoff"] select', { timeout: 10000 });
}

async function part5() {
  const { root, clips, data, stub } = freshRoot("d5");
  const library = path.join(root, "Client.fcpbundle");
  fs.mkdirSync(library, { recursive: true }); // a real library must exist
  const a = await vapp.launch({ label: `d458-${TAG}-d5`, outDir: path.join(OUT, "d5"), cwd: stub, seed: seed(clips, data) });

  // two clips. Pacing is on the filesystem, not on the toast.
  await vapp.loadVideo(a.win, URL);
  await vapp.mark(a.win, "00:00:01", "00:00:05");
  await a.win.click("#ui-add-segment");
  await a.win.click("#ui-cut");
  const clip1 = await vapp.waitForFile(path.join(clips, "AUD-stub0000001-01.mp4"));
  await vapp.dismissToast(a.win);
  await vapp.mark(a.win, "00:00:06", "00:00:10");
  await a.win.click("#ui-add-segment");
  await a.win.click("#ui-cut");
  const clip2 = await vapp.waitForFile(path.join(clips, "AUD-stub0000001-02.mp4"));
  await vapp.dismissToast(a.win);
  const clipsAfterTwo = fs.readdirSync(clips);
  if (!clip1 || !clip2) {
    const where = await vapp.describeScreen(a, "d5-cut-did-not-finish");
    await a.close();
    return { part: "D-5", aborted: "the two clips did not both save", clip1, clip2, clipsAfterTwo, where };
  }

  await expandPanel(a.win);
  const sel = 'section[aria-label="Editor handoff"]';
  await a.win.fill(`${sel} input[placeholder="/Users/you/Movies/Client.fcpbundle"]`, library);
  await a.win.fill(`${sel} input[placeholder="Audit D"]`, "Raw clips تجربة");
  // tick "Also create a project ..." (the first checkbox in the panel)
  await a.win.evaluate(() => {
    const boxes = Array.from(
      document.querySelectorAll('section[aria-label="Editor handoff"] input[type="checkbox"]'),
    );
    const projectBox = boxes.find((b) => /Also create a project/i.test(b.parentElement?.textContent || ""));
    projectBox?.click();
  });
  await a.win.waitForTimeout(300);
  // "Event for the projects" — through Playwright's own fill, so React sees it
  await a.win
    .locator(`${sel} label`, { hasText: "Event for the projects" })
    .locator("input")
    .fill("Projects تجربة")
    .catch(() => {});
  await a.win.waitForTimeout(300);
  await a.shot("d5-settings");
  await a.win.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => /Send all to Final Cut Pro/i.test(x.textContent || ""));
    b?.click();
  });
  await a.win.waitForTimeout(4000);
  const sendAllMessages = await vapp.visibleMessages(a.win);
  const docPath = path.join(clips, "Raw clips تجربة.fcpxml");
  const beforeSnap = vapp.fsSnapshot(docPath);
  const beforeXml = fs.existsSync(docPath) ? fs.readFileSync(docPath, "utf8") : "";
  if (beforeXml) fs.writeFileSync(path.join(OUT, "d5-BEFORE.fcpxml"), beforeXml);

  // "After cutting" -> Send to Final Cut Pro
  await a.win.selectOption(`${sel} select`, "finalcut");
  await a.win.waitForTimeout(500);
  await a.shot("d5-after-cutting-set");

  // third clip
  await vapp.mark(a.win, "00:00:11", "00:00:15");
  await a.win.click("#ui-add-segment");
  await a.win.click("#ui-cut");
  const clip3 = await vapp.waitForFile(path.join(clips, "AUD-stub0000001-03.mp4"));
  await a.win.waitForTimeout(5000);
  const afterSnap = vapp.fsSnapshot(docPath);
  const afterXml = fs.existsSync(docPath) ? fs.readFileSync(docPath, "utf8") : "";
  if (afterXml) fs.writeFileSync(path.join(OUT, "d5-AFTER.fcpxml"), afterXml);
  const messagesAfterThird = await vapp.visibleMessages(a.win);
  await a.shot("d5-after-third-cut");
  await a.close();

  return {
    part: "D-5",
    clipsAfterTwo,
    thirdClipSaved: clip3,
    sendAllMessages,
    documentPath: docPath,
    before: {
      assets: countIn(beforeXml, "asset"),
      assetClips: countIn(beforeXml, "asset-clip"),
      projects: countIn(beforeXml, "project"),
      snap: beforeSnap,
    },
    after: {
      assets: countIn(afterXml, "asset"),
      assetClips: countIn(afterXml, "asset-clip"),
      projects: countIn(afterXml, "project"),
      snap: afterSnap,
    },
    fileReplaced: beforeSnap.exists && afterSnap.exists && beforeSnap.sha256 !== afterSnap.sha256,
    sameInode: beforeSnap.exists && afterSnap.exists ? beforeSnap.ino === afterSnap.ino : null,
    secondDocumentWritten: fs.readdirSync(clips).filter((f) => f.endsWith(".fcpxml")),
    messagesAfterThird,
    anyMessageAboutReplacing: messagesAfterThird.some((m) => /replac|overwrit|was reduced/i.test(m)),
  };
}

async function part4() {
  const { clips, data, stub } = freshRoot("d4");
  const badLibrary = "/tmp/this-library-does-not-exist-" + Date.now() + ".fcpbundle";
  const a = await vapp.launch({
    label: `d458-${TAG}-d4`,
    outDir: path.join(OUT, "d4"),
    cwd: stub,
    seed: seed(clips, data, {
      "clipper.editorHandoff": {
        "camp-audit": {
          afterCutting: "finalcut",
          eventName: "campaign",
          capcutDropDir: "",
          openCapCut: false,
          fcpLibrary: badLibrary,
          mediaEvent: "",
          projectEvent: "",
          createProject: false,
          projectNamePattern: "{clipId} {label}",
          timelineFormat: { kind: "vertical", width: 1080, height: 1920, fps: "30" },
        },
      },
    }),
  });
  const sawToast = await vapp.cutOne(a.win, { url: URL, inTc: "00:00:02", outTc: "00:00:08" });
  const clipSaved = await vapp.waitForFile(path.join(clips, "AUD-stub0000001-01.mp4"));
  await a.win.waitForTimeout(6000); // give the silent after-cutting path time
  const messages = await vapp.visibleMessages(a.win);
  await a.shot("d4-after-cut");
  const panelStatus = await a.win.evaluate(() => {
    const s = document.querySelector('section[aria-label="Editor handoff"]');
    return s ? (s.textContent || "").replace(/\s+/g, " ").trim().slice(0, 400) : null;
  });
  // Isolation: the same settings, through the panel's own Send button. If that
  // DOES produce a sentence, the message exists and only the automatic path
  // throws it away.
  let manualSendMessage = null;
  try {
    await a.win.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find((x) =>
        /Send all to Final Cut Pro/i.test(x.textContent || ""),
      );
      b?.click();
    });
    await a.win.waitForTimeout(3000);
    const msgs = await vapp.visibleMessages(a.win);
    manualSendMessage = msgs.find((m) => /library|not sent|Final Cut/i.test(m)) || msgs;
    await a.shot("d4-manual-send");
  } catch (e) {
    manualSendMessage = `driver error: ${String(e).slice(0, 150)}`;
  }
  await a.close();
  return {
    part: "D-4",
    badLibrary,
    sawToast,
    clipSaved,
    messages,
    anyMessageMentionsFinalCutOrLibrary: messages.some((m) => /final cut|library|not sent/i.test(m)),
    clipsFolder: fs.readdirSync(clips),
    fcpxmlWritten: fs.readdirSync(clips).filter((f) => f.endsWith(".fcpxml")),
    strayLibraryCreated: fs.existsSync(badLibrary),
    panelStatusText: panelStatus,
    manualSendMessage,
  };
}

async function part8() {
  const { root, clips, data, stub } = freshRoot("d8");
  const a = await vapp.launch({
    label: `d458-${TAG}-d8`,
    outDir: path.join(OUT, "d8"),
    cwd: stub,
    seed: {
      // a clips folder but NO campaign: a fresh install
      "clipper.clipsDir": clips,
      "clipper.saveDir": clips,
      "clipper.dataDir": data,
      "clipper.dataDirConfirmed": true,
      "clipper.campaigns": [],
      "clipper.activeCampaign": null,
    },
  });
  await expandPanel(a.win);
  const sel = 'section[aria-label="Editor handoff"]';
  const libSel = `${sel} input[placeholder="/Users/you/Movies/Client.fcpbundle"]`;
  await a.win.fill(libSel, path.join(root, "Some Library.fcpbundle"));
  await a.win.waitForTimeout(300);
  const libraryValue = await a.win.inputValue(libSel);
  await a.win.selectOption(`${sel} select`, "finalcut").catch(() => {});
  await a.win.waitForTimeout(300);
  const afterCuttingValue = await a.win.evaluate(
    () => document.querySelector('section[aria-label="Editor handoff"] select')?.value,
  );
  const checkboxState = await a.win.evaluate(() => {
    const boxes = Array.from(
      document.querySelectorAll('section[aria-label="Editor handoff"] input[type="checkbox"]'),
    );
    const projectBox = boxes.find((b) => /Also create a project/i.test(b.parentElement?.textContent || ""));
    if (!projectBox) return { found: false };
    projectBox.click();
    return { found: true };
  });
  await a.win.waitForTimeout(400);
  const checkedNow = await a.win.evaluate(() => {
    const boxes = Array.from(
      document.querySelectorAll('section[aria-label="Editor handoff"] input[type="checkbox"]'),
    );
    const projectBox = boxes.find((b) => /Also create a project/i.test(b.parentElement?.textContent || ""));
    return projectBox ? projectBox.checked : null;
  });
  const summary = await a.win.evaluate(() => {
    const b = document.querySelector('section[aria-label="Editor handoff"] > button');
    return b ? (b.textContent || "").replace(/\s+/g, " ").trim() : null;
  });
  const projectEventFieldPresent = await a.win.evaluate(() =>
    Array.from(document.querySelectorAll('section[aria-label="Editor handoff"] label')).some((l) =>
      /Event for the projects/i.test(l.textContent || ""),
    ),
  );
  const messages = await vapp.visibleMessages(a.win);
  await a.shot("d8-no-campaign");
  const state = a.readState();
  await a.close();
  return {
    part: "D-8",
    libraryValueAfterTyping: libraryValue,
    afterCuttingValueAfterChoosing: afterCuttingValue,
    projectCheckbox: checkboxState,
    checkedNow,
    summaryRow: summary,
    projectEventFieldPresent,
    messagesOnScreen: messages,
    persistedEditorHandoff: state ? state["clipper.editorHandoff"] : null,
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const want = (n) => !ONLY || ONLY === String(n);
  const out = [];
  if (want(5)) out.push(await part5());
  if (want(4)) out.push(await part4());
  if (want(8)) out.push(await part8());
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
