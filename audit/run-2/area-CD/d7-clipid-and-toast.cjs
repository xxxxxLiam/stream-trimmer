/**
 * d7-clipid-and-toast.cjs — two loose ends from the D-2 and D-3 work.
 *
 * Part A  Copy block 7 ("Clip id and filename") must advance after a cut. The
 *         d4 run could not finish this because its driver failed to complete a
 *         cut with the panel in the way; here the cut happens first.
 * Part B  what the app TELLS the user after a name collision. The clip is now
 *         saved as "... 2.mp4" (D-2 held), so the toast, the Downloads row and
 *         the drag handle must name the file that was actually written.
 *
 * xvfb-run -a --server-args="-screen 0 1440x900x24" node audit/run-2/area-CD/d7-clipid-and-toast.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./cdlib.cjs");

const ROOT = path.join(L.SCRATCH, "d7");
const log = L.mkLogger(path.join(__dirname, "out", "d7-clipid-and-toast.txt"));
const say = log.say;

(async () => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  const stub = L.makeStubRoot(path.join(ROOT, "stub"));
  const clips = path.join(ROOT, "Clips");
  fs.mkdirSync(clips, { recursive: true });
  // the name the FIRST clip of this campaign will be given is already taken
  const taken = path.join(clips, "ACM-stub0000001-01.mp4");
  fs.writeFileSync(taken, "the user's own earlier clip\n");
  const before = L.fsSnap(taken);

  const a = await L.launch({
    label: "d7-clipid",
    cwd: stub,
    seed: {
      "clipper.campaigns": [L.slugCampaign("acme-q4", "Acme Q4", clips, path.join(ROOT, "Data"), { prefix: "ACM" })],
      "clipper.activeCampaign": "acme-q4",
      "clipper.clipsDir": clips,
      "clipper.dataDirConfirmed": true,
      "clipper.saveDir": clips,
      "clipper.saveDirs": [clips],
    },
  });
  await a.win.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  await L.loadVideo(a.win);
  say("cut 1:", await L.cutOne(a.win, "00:00:02", "00:00:08"));
  const msgs = await L.messages(a.win);
  say("the toast says:", msgs);
  say("folder now:", fs.readdirSync(clips).sort());
  say("the earlier file survived:", L.fsDiff(before, L.fsSnap(taken)).sameBytes === true);
  const written = fs.readdirSync(clips).find((f) => / 2\.mp4$/.test(f));
  say("file actually written:", written);
  say("does the toast name it?", msgs.join(" ").includes(written || "\u0000") ? "YES" : "NO — it names the name that was asked for");

  const dl = a.state()["clipper.downloads"] || [];
  say("Downloads record:", dl.map((d) => ({ label: d.label, path: path.basename(d.path || "") })));
  say("the Downloads label matches the file on disk:", dl.length ? path.basename(dl[0].path || "") === dl[0].label : "no rows");

  const grip = await a.win.evaluate(() => {
    const g = document.querySelector('[role="button"][aria-label^="Drag "]');
    return g ? { label: g.getAttribute("aria-label"), tabIndex: g.tabIndex } : "no grip";
  });
  say("drag handle:", grip);

  // Part A: the clip id the next cut gets, read out of Copy block 7
  await L.dismissToast(a.win);
  await L.mark(a.win, "00:00:12", "00:00:18");
  await a.win.click("#ui-add-segment");
  await a.win.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => /use it anyway/i.test(x.textContent || ""));
    if (b) b.click();
  });
  await a.win.waitForTimeout(400);
  await a.win.click("#ui-copy-blocks");
  await a.win.waitForSelector('[role="dialog"][aria-label="Copy blocks"]');
  await a.win.waitForTimeout(800);
  const text = await a.win.evaluate(async () => {
    const b = document.querySelector("#ui-copy-block-clip-id");
    if (!b || b.disabled) return "<disabled>";
    b.click();
    await new Promise((r) => setTimeout(r, 400));
    return navigator.clipboard.readText().catch((e) => `<clipboard failed: ${e.message}>`);
  });
  say("block 7 after one completed cut:", JSON.stringify(text));
  say("it advanced to -02:", text.startsWith("ACM-stub0000001-02") ? "YES" : "NO");
  const used = await a.win.evaluate(async () => {
    const b = document.querySelector("#ui-copy-block-used");
    if (!b || b.disabled) return "<disabled>";
    b.click();
    await new Promise((r) => setTimeout(r, 400));
    return navigator.clipboard.readText().catch((e) => `<clipboard failed: ${e.message}>`);
  });
  say("block 6 after one completed cut:", JSON.stringify(used));
  await a.shot("after-cut-blocks");
  say("page errors:", a.logs.pageErrors.slice(0, 4));
  await a.close();
  log.flush();
})().catch((e) => {
  say("SCRIPT FAILED: " + String(e.stack || e));
  log.flush();
  process.exit(1);
});
