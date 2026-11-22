/**
 * E/T11 — user stories run end to end in one owner-star session.
 * The stories that need a slow run, a second app instance or a second build
 * shape are run by t5/t6/t7/t8 instead; see the area file for the mapping.
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const CHANNEL = "https://www.youtube.com/@stubchannel";

(async () => {
  L.useShape("owner-star");
  const root = L.stubRoot("t11");
  const info = L.channelInfo({
    count: 4,
    comments: [
      { id: "c1", parent: "root", text: "great video!", author: "Fan", author_id: "UC1", like_count: 12, time_text: "1 week ago" },
    ],
  });
  L.writeStub(root, { info, vtt: "WEBVTT\n\n1\n00:00:00.000 --> 00:00:03.000\nhello there\n", exitCode: 0, delayMs: 0, writeMedia: false });

  const saveDir = "/tmp/area-E-save/t11";
  fs.rmSync(saveDir, { recursive: true, force: true });
  fs.mkdirSync(saveDir, { recursive: true });
  const outDir = path.join(L.OUT, "t11-stories");
  const a = await L.launchApp({
    label: "t11-stories", outDir, cwd: root,
    seed: { "clipper.dataDirConfirmed": true, "clipper.dataDir": saveDir, "clipper.clipsDir": saveDir },
  });
  const S = {};
  const alert = () => a.win.evaluate(() => {
    const el = document.querySelector('[role="alert"]');
    return el ? el.textContent.trim() : null;
  });
  const result = () => a.win.evaluate(() => {
    const m = document.body.innerText.match(/(Partial export saved|Export saved)[\s\S]{0,150}/);
    return m ? m[0].replace(/\n+/g, " | ") : null;
  });
  const dismiss = async () => {
    const d = a.win.locator('button[aria-label="Dismiss"]');
    if (await d.count()) await d.first().click();
  };

  try {
    await a.win.waitForSelector("header", { timeout: 20000 });
    await L.signIn(a);

    // S1 — "I sit down at my own machine and want the channel tool."
    S.S1 = {
      story: "Owner opens the app on her own machine and looks for the channel tool",
      navEntry: await a.win.evaluate(() => {
        const b = document.querySelector("#ui-channel-link");
        return b ? b.textContent.trim() : null;
      }),
    };
    S.S1.shot = await a.shot("S1-nav-entry");
    await a.win.click("#ui-channel-link");
    await a.win.waitForSelector('button:has-text("Export channel")', { timeout: 15000 });
    S.S1.panelShot = await a.shot("S1-panel");

    const urlBox = a.win.locator('input[placeholder="https://www.youtube.com/@channelhandle"]');
    const numBox = a.win.locator('input[type="number"]');
    const btn = a.win.locator('button:has-text("Export channel")');
    const everything = a.win.locator('button:has-text("Everything")');
    const part = (label) => a.win.locator(`label:has-text("${label}") input[type="checkbox"]`).first();
    const setCount = async (v) => {
      await numBox.click();
      await a.win.keyboard.press("Control+a");
      if (v) await a.win.keyboard.type(String(v)); else await a.win.keyboard.press("Backspace");
      await a.win.waitForTimeout(150);
    };

    // S2 — "Export my top 100, everything."
    await urlBox.fill(CHANNEL);
    await setCount(100);
    await btn.click();
    await a.win.waitForSelector("text=/Export saved|Partial export saved/", { timeout: 120000 });
    S.S2 = { story: "Exports the top 100 by views with every part on", result: await result() };
    S.S2.folder = fs.readdirSync(saveDir);
    S.S2.files = fs.readdirSync(path.join(saveDir, S.S2.folder[0]));
    S.S2.shot = await a.shot("S2-export-saved");
    await dismiss();

    // S3 — "I pasted the video, not the channel."
    await urlBox.fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await btn.click();
    await a.win.waitForTimeout(400);
    S.S3 = { story: "Pastes a video link instead of a channel link", message: await alert() };
    S.S3.shot = await a.shot("S3-video-link");

    // S4 — "I cleared the count box and pressed Export."
    await urlBox.fill(CHANNEL);
    await setCount(null);
    await btn.click();
    await a.win.waitForTimeout(400);
    S.S4 = { story: "Clears the count box and presses Export", message: await alert() };
    S.S4.shot = await a.shot("S4-count-cleared");

    // S5 — "Just give me five."
    await setCount(5);
    await btn.click();
    await a.win.waitForTimeout(400);
    S.S5 = { story: "Asks for 5 videos", message: await alert() };
    S.S5.shot = await a.shot("S5-five-videos");

    // S6 — "Captions only, for the whole channel."
    await setCount(100);
    await everything.click();
    await part("Video details").uncheck();
    await part("Comments").uncheck();
    await a.win.waitForTimeout(200);
    S.S6 = {
      story: "Wants captions only, for every video on the channel",
      estimate: await a.win.evaluate(() => {
        const m = document.body.innerText.match(/Exporting every video[^.]*\./);
        return m ? m[0] : null;
      }),
      skipNote: await a.win.evaluate(() =>
        document.body.innerText.includes("Without video details the run skips one lookup per video")),
    };
    S.S6.formShot = await a.shot("S6-captions-only-form");
    await btn.click();
    await a.win.waitForSelector("text=/Export saved|Partial export saved/", { timeout: 120000 });
    S.S6.result = await result();
    S.S6.folderFiles = fs.readdirSync(path.join(saveDir, fs.readdirSync(saveDir)[0]));
    S.S6.summary = fs.readFileSync(path.join(saveDir, fs.readdirSync(saveDir)[0], "summary.csv"), "utf8");
    S.S6.shot = await a.shot("S6-captions-only-done");
    await dismiss();

    // S14 — keyboard only, no mouse at all.
    await part("Video details").check();
    await part("Comments").check();
    await everything.click(); // back to a numeric limit
    await urlBox.fill("");
    await a.win.waitForTimeout(150);
    S.S14 = { story: "Runs an export with the keyboard only" };
    // tab from the top of the document to the URL field, type, tab to Export, Enter
    await a.win.evaluate(() => document.body.focus());
    const hops = [];
    for (let i = 0; i < 30; i++) {
      await a.win.keyboard.press("Tab");
      const here = await a.win.evaluate(() => {
        const e = document.activeElement;
        return e.getAttribute("placeholder") || (e.textContent || "").trim().slice(0, 24);
      });
      hops.push(here);
      if (here === "https://www.youtube.com/@channelhandle") break;
    }
    S.S14.hopsToUrlField = hops.length;
    await a.win.keyboard.type(CHANNEL);
    S.S14.typedValue = await urlBox.inputValue();
    // the URL field's accessible name, as a screen reader would get it
    S.S14.urlFieldAccessibleName = await a.win.evaluate(() => {
      const el = document.querySelector('input[placeholder="https://www.youtube.com/@channelhandle"]');
      const id = el.getAttribute("id");
      return {
        ariaLabel: el.getAttribute("aria-label"),
        ariaLabelledby: el.getAttribute("aria-labelledby"),
        labelFor: id ? !!document.querySelector(`label[for="${id}"]`) : false,
        wrappedInLabel: !!el.closest("label"),
        title: el.getAttribute("title"),
      };
    });
    for (let i = 0; i < 20; i++) {
      await a.win.keyboard.press("Tab");
      const here = await a.win.evaluate(() => (document.activeElement.textContent || "").trim());
      if (here.includes("Export channel")) { S.S14.reachedExport = true; break; }
    }
    await a.win.keyboard.press("Enter");
    S.S14.ranByKeyboard = await a.win
      .waitForSelector("text=/Export saved|Partial export saved/", { timeout: 120000 })
      .then(() => true).catch(() => false);
    S.S14.result = await result();
    S.S14.shot = await a.shot("S14-keyboard-only");
    await dismiss();

    // S15 — "That channel does not exist."
    L.writeStub(root, { info, exitCode: 1, stderr: "ERROR: [youtube:tab] @gone: YouTube said: This channel does not exist.", writeMedia: false });
    await a.win.waitForTimeout(150);
    await urlBox.fill("https://www.youtube.com/@gone");
    await btn.click();
    await a.win.waitForTimeout(5000);
    S.S15 = {
      story: "Types a channel that does not exist",
      message: await alert(),
      urlStillInTheBox: await urlBox.inputValue(),
      canTryAgain: await a.win.evaluate(() => document.body.innerText.includes("Export channel")),
    };
    S.S15.shot = await a.shot("S15-channel-gone");
  } catch (e) {
    S.error = String(e).slice(0, 700);
    S.shotError = await a.shot("stories-error");
  } finally {
    S.pageErrors = a.logs.pageErrors;
    await a.close();
  }
  console.log(JSON.stringify(S, null, 2));
  L.save(outDir, "report.json", S);
})();
