/**
 * r3-dropped-and-quality.cjs — two more things the identity change sits next to.
 *
 * Part A  a campaign entry the loader drops (no id, or an id already used) is
 *         still on disk after boot — but the first campaign edit writes the
 *         normalised list back. Does that lose the entry for good, and does it
 *         orphan its bank (the one route that can still create an orphan after
 *         T5's fix)?
 * Part B  what merely LOOKING at a campaign writes back: switching to an mp3
 *         campaign whose stored quality is a video quality, and what the New
 *         campaign form stores for quality in the first place.
 *
 * xvfb-run -a --server-args="-screen 0 1440x900x24" node audit/run-2/area-CD/r3-dropped-and-quality.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./cdlib.cjs");

const ROOT = path.join(L.SCRATCH, "r3");
const VID = "stub0000001";
const log = L.mkLogger(path.join(__dirname, "out", "r3-dropped-and-quality.txt"));
const say = log.say;

async function switchTo(a, name) {
  await a.win.click("#ui-campaign-chip");
  await a.win.waitForTimeout(300);
  await a.win.evaluate((n) => {
    const b = Array.from(document.querySelectorAll("button")).find(
      (x) => !/^(Edit|Remove)/.test(x.getAttribute("aria-label") || "") && (x.textContent || "").trim().startsWith(n),
    );
    if (b) b.click();
  }, name);
  await a.win.waitForTimeout(800);
  await a.win.keyboard.press("Escape");
  await a.win.waitForTimeout(300);
}

(async () => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  const stub = L.makeStubRoot(path.join(ROOT, "stub"));
  const clips = path.join(ROOT, "Clips");
  const clips2 = path.join(ROOT, "Clips2");
  [clips, clips2].forEach((d) => fs.mkdirSync(d, { recursive: true }));

  // ============================================ PART A
  say("================ PART A — a campaign entry the loader drops");
  {
    const a = await L.launch({
      label: "r3-A-dropped",
      cwd: stub,
      seed: {
        "clipper.campaigns": [
          L.slugCampaign("keep", "Keeper", clips, path.join(ROOT, "Data")),
          { name: "No Id Client", clipsDir: clips2, dataDir: path.join(ROOT, "Data2"), usedRanges: { [VID]: [{ start: 1, end: 2, clipId: "NID-01" }] } },
          L.slugCampaign("keep", "Duplicate Id Client", clips2, path.join(ROOT, "Data3")),
        ],
        "clipper.activeCampaign": "keep",
        "clipper.bank": {
          keep: { [VID]: [L.bankRow("K01", 60, 90, "keeper", "k", "T1")] },
          "no-id-client": { [VID]: [L.bankRow("N01", 10, 20, "no id client", "n", "T1")] },
        },
        "clipper.clipsDir": clips,
        "clipper.dataDirConfirmed": true,
      },
    });
    await L.loadVideo(a.win);
    const shown = await a.win.evaluate(() => {
      const c = document.querySelector("#ui-campaign-chip");
      if (c) c.click();
      return new Promise((r) =>
        setTimeout(() => {
          r(Array.from(document.querySelectorAll('button[aria-label^="Edit "]')).map((b) => b.getAttribute("aria-label")));
        }, 500),
      );
    });
    say("A. campaigns offered in the popover:", shown);
    say("A. entries still on disk before any edit:", (a.state()["clipper.campaigns"] || []).map((c) => [c.id ?? null, c.name]));
    await a.win.keyboard.press("Escape");
    // now make ONE ordinary campaign edit, which commits the normalised list
    await a.win.click("#ui-campaign-chip");
    await a.win.waitForTimeout(300);
    await a.win.click('button[aria-label="Edit Keeper"]');
    await a.win.waitForTimeout(350);
    await a.win.locator("form input.field").first().fill("Keeper Renamed");
    await a.win.click('form button[type="submit"]');
    await a.win.waitForTimeout(800);
    await a.win.keyboard.press("Escape");
    const st = a.state();
    say("A. entries on disk AFTER one rename:", (st["clipper.campaigns"] || []).map((c) => [c.id ?? null, c.name]));
    say("A. bank keys on disk:", Object.keys(st["clipper.bank"] || {}));
    const gone = !(st["clipper.campaigns"] || []).some((c) => /No Id|Duplicate/.test(c.name));
    say("A. VERDICT:", gone
      ? "the unparsable campaigns (and their folders/used ranges) were written out of existence by an unrelated rename"
      : "they survived on disk");
    say("A. their banks are now unreachable:", Object.keys(st["clipper.bank"] || {}).filter((k) => k === "no-id-client"));
    await a.shot("A-dropped");
    say("A. page errors:", a.logs.pageErrors.slice(0, 4));
    await a.close();
  }

  // ============================================ PART B
  say("");
  say("================ PART B — what looking at a campaign writes back");
  {
    const b = await L.launch({
      label: "r3-B-quality",
      cwd: stub,
      seed: {
        "clipper.campaigns": [
          L.slugCampaign("mp4one", "Video Client", clips, path.join(ROOT, "D1"), { format: "mp4", quality: "best" }),
          L.slugCampaign("mp3one", "Audio Client", clips2, path.join(ROOT, "D2"), { format: "mp3", quality: "best" }),
          L.slugCampaign("mp4two", "Video Client 1080", clips, path.join(ROOT, "D3"), { format: "mp4", quality: "1080" }),
        ],
        "clipper.activeCampaign": "mp4one",
        "clipper.clipsDir": clips,
        "clipper.dataDirConfirmed": true,
      },
    });
    await L.loadVideo(b.win);
    const read = () => (b.state()["clipper.campaigns"] || []).map((c) => [c.name, c.format, c.quality]);
    say("B. as seeded:", read());
    await switchTo(b, "Audio Client");
    say("B. after merely switching to the mp3 campaign:", read());
    await switchTo(b, "Video Client 1080");
    say("B. after switching to the 1080 campaign:", read());
    await switchTo(b, "Video Client");
    say("B. after switching back:", read());
    // and what a NEW mp3 campaign gets for quality
    await b.win.click("#ui-campaign-chip");
    await b.win.waitForTimeout(300);
    await b.win.click('button:has-text("New campaign")');
    await b.win.waitForTimeout(300);
    await b.win.locator("form input.field").first().fill("Fresh Audio");
    await b.win.evaluate(() => {
      const sel = Array.from(document.querySelectorAll("form select")).find((s) =>
        Array.from(s.options).some((o) => o.value === "mp3"),
      );
      if (sel) {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
        setter.call(sel, "mp3");
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await b.win.waitForTimeout(300);
    say("B. is there a Quality field in the New campaign form?",
      await b.win.evaluate(() =>
        Array.from(document.querySelectorAll("form label")).map((l) => ((l.querySelector("span") || l).textContent || "").trim()),
      ));
    await b.win.click('form button[type="submit"]');
    await b.win.waitForTimeout(800);
    await b.win.keyboard.press("Escape");
    say("B. the new mp3 campaign as stored:", read());
    await b.shot("B-quality");
    say("B. page errors:", b.logs.pageErrors.slice(0, 4));
    await b.close();
  }

  log.flush();
})().catch((e) => {
  say("SCRIPT FAILED: " + String(e.stack || e));
  log.flush();
  process.exit(1);
});
