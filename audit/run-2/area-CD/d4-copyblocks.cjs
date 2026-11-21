/**
 * d4-copyblocks.cjs — D-3 re-verification with a REAL transcript (T3 wired the
 * panel but tested it only against the stub, per audit/run-2/BRIEF.md).
 *
 * The stub serves a real six-cue WebVTT through the product's own
 * /api/transcript, so the lines in the panel are lines the product parsed.
 * Every one of the seven blocks is then clicked, the SYSTEM clipboard is read
 * back, and the text is compared against what the cues and the marked segments
 * say it must be — computed here, not taken from the product.
 *
 * States: nothing loaded / video + transcript / + one segment / + two segments
 * / after a real cut. Keyboard focus on open is checked too.
 *
 * xvfb-run -a --server-args="-screen 0 1440x900x24" node audit/run-2/area-CD/d4-copyblocks.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./cdlib.cjs");

const ROOT = path.join(L.SCRATCH, "d4");
const log = L.mkLogger(path.join(__dirname, "out", "d4-copyblocks.txt"));
const say = log.say;
let pass = 0;
let fail = 0;
function check(name, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  say(`   ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) {
    say(`        got:  ${JSON.stringify(got)}`);
    say(`        want: ${JSON.stringify(want)}`);
  }
}

// The cues the stub serves, and therefore what the blocks must contain.
const CUES = [
  [0, 4, "Welcome back to the show everyone"],
  [4, 8, "today we are talking about the apology"],
  [8, 12, "and what it means for the campaign"],
  [12, 16, "I think the payoff lands right here"],
  [16, 20, "that is the laugh I was waiting for"],
  [20, 24, "and then we move on to the next thing"],
];
const tc = (s) => {
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const q = String(Math.floor(s % 60)).padStart(2, "0");
  return `${h}:${m}:${q}`;
};
const linesIn = (segs) => {
  const seen = new Set();
  const out = [];
  for (const [s, e] of segs) {
    CUES.forEach((c, i) => {
      if (seen.has(i)) return;
      if (c[1] > s && c[0] < e) {
        seen.add(i);
        out.push(c);
      }
    });
  }
  return out;
};

async function openPanel(a) {
  await a.win.click("#ui-copy-blocks");
  await a.win.waitForSelector('[role="dialog"][aria-label="Copy blocks"]', { timeout: 15000 });
  await a.win.waitForTimeout(900);
}
async function closePanel(a) {
  await a.win.click('button[aria-label="Close copy blocks"]').catch(() => {});
  await a.win.waitForTimeout(400);
}
async function dumpBlocks(a) {
  return a.win.evaluate(() => {
    const d = document.querySelector('[role="dialog"][aria-label="Copy blocks"]');
    if (!d) return { missing: true };
    return {
      focus: document.activeElement ? `${document.activeElement.tagName}#${document.activeElement.id || ""}` : null,
      blocks: Array.from(d.querySelectorAll("li")).map((li) => {
        const btn = li.querySelector("button[data-copy]");
        return {
          label: (li.querySelector(".text-body") || {}).textContent?.trim(),
          note: (li.querySelector(".t-meta") || {}).textContent?.trim(),
          disabled: btn ? btn.disabled : null,
          id: btn ? btn.id : null,
        };
      }),
      enabled: Array.from(d.querySelectorAll("button[data-copy]")).filter((b) => !b.disabled).length,
    };
  });
}
async function copyBlock(a, id) {
  await a.win.evaluate((bid) => {
    const b = document.querySelector(`#${bid}`);
    if (b && !b.disabled) b.click();
  }, id);
  await a.win.waitForTimeout(500);
  return a.win.evaluate(() => navigator.clipboard.readText().catch((e) => `<clipboard failed: ${e.message}>`));
}

(async () => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  const stub = L.makeStubRoot(path.join(ROOT, "stub"), { cues: CUES });
  const clips = path.join(ROOT, "Clips");
  const data = path.join(ROOT, "Data");
  fs.mkdirSync(clips, { recursive: true });
  fs.mkdirSync(data, { recursive: true });

  const a = await L.launch({
    label: "d4-copyblocks",
    cwd: stub,
    seed: {
      "clipper.campaigns": [L.slugCampaign("acme-q4", "Acme Q4", clips, data, { prefix: "ACM" })],
      "clipper.activeCampaign": "acme-q4",
      "clipper.clipsDir": clips,
      "clipper.dataDir": data,
      "clipper.dataDirConfirmed": true,
      "clipper.saveDir": clips,
      "clipper.saveDirs": [clips],
    },
  });
  await a.win.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});

  // ---------------------------------------------------- state 1: nothing loaded
  say("================ state 1 — nothing loaded (control)");
  await openPanel(a);
  const s1 = await dumpBlocks(a);
  say("enabled blocks:", s1.enabled, "| focus on open:", s1.focus);
  s1.blocks.forEach((b) => say(`   ${b.label} | ${b.note} | disabled=${b.disabled}`));
  await a.shot("01-nothing-loaded");
  await closePanel(a);

  // ---------------------------------------------------- state 2: video + transcript
  say("");
  say("================ state 2 — a real video and a real transcript, no segment");
  await L.loadVideo(a.win);
  await openPanel(a);
  const s2 = await dumpBlocks(a);
  say("enabled blocks:", s2.enabled, "| focus on open:", s2.focus);
  s2.blocks.forEach((b) => say(`   ${b.label} | ${b.note} | disabled=${b.disabled}`));
  const wholeTranscript = CUES.map((c) => `[${tc(c[0])}] ${c[2]}`).join("\n");
  check("block 1 source link", await copyBlock(a, "ui-copy-block-source"), "https://www.youtube.com/watch?v=stub0000001");
  check("block 2 whole transcript", await copyBlock(a, "ui-copy-block-transcript"), wholeTranscript);
  await a.shot("02-video-transcript");
  await closePanel(a);

  // ---------------------------------------------------- state 3: one segment
  say("");
  say("================ state 3 — one marked segment 00:00:04 to 00:00:12");
  await L.mark(a.win, "00:00:04", "00:00:12");
  await a.win.click("#ui-add-segment");
  await a.win.waitForTimeout(500);
  await openPanel(a);
  const s3 = await dumpBlocks(a);
  say("enabled blocks:", s3.enabled, "| focus on open:", s3.focus);
  s3.blocks.forEach((b) => say(`   ${b.label} | ${b.note} | disabled=${b.disabled}`));
  const seg1 = [[4, 12]];
  const want3 = {
    source: "https://www.youtube.com/watch?v=stub0000001",
    transcript: wholeTranscript,
    "segment-transcript": linesIn(seg1).map((c) => `[${tc(c[0])}] ${c[2]}`).join("\n"),
    script: linesIn(seg1).map((c) => `[SPEAKER, ${tc(c[0])}] ${c[2]}`).join("\n"),
    ranges: "00:00:04 to 00:00:12",
    used: `stub0000001 (video): 00:00:04 to 00:00:12 (ACM-stub0000001-01)`,
    "clip-id": "ACM-stub0000001-01\nACM-stub0000001-01.mp4",
  };
  for (const [id, want] of Object.entries(want3)) {
    check(`block ${id}`, await copyBlock(a, `ui-copy-block-${id}`), want);
  }
  say("   all seven enabled:", s3.enabled === 7);
  await a.shot("03-one-segment");
  await closePanel(a);

  // ---------------------------------------------------- state 4: two segments
  say("");
  say("================ state 4 — a second segment 00:00:18 to 00:00:22");
  await L.mark(a.win, "00:00:18", "00:00:22");
  await a.win.click("#ui-add-segment");
  await a.win.waitForTimeout(500);
  await openPanel(a);
  const s4 = await dumpBlocks(a);
  say("enabled blocks:", s4.enabled);
  const seg2 = [[4, 12], [18, 22]];
  const want4 = {
    "segment-transcript": linesIn(seg2).map((c) => `[${tc(c[0])}] ${c[2]}`).join("\n"),
    script: linesIn(seg2).map((c) => `[SPEAKER, ${tc(c[0])}] ${c[2]}`).join("\n"),
    ranges: "00:00:04 to 00:00:12; 00:00:18 to 00:00:22",
    used: "stub0000001 (video): 00:00:04 to 00:00:12; 00:00:18 to 00:00:22 (ACM-stub0000001-01)",
  };
  for (const [id, want] of Object.entries(want4)) {
    check(`two-segment block ${id}`, await copyBlock(a, `ui-copy-block-${id}`), want);
  }
  await a.shot("04-two-segments");
  await closePanel(a);

  // ---------------------------------------------------- state 5: after a real cut
  say("");
  say("================ state 5 — after a real cut (the clip id must advance)");
  await a.win.click("#ui-cut");
  await a.win
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll('[role="status"],[role="alert"]')).some((n) =>
          /Clip saved|Error|failed/i.test(n.textContent || ""),
        ),
      null,
      { timeout: 120000 },
    )
    .catch(() => {});
  await a.win.waitForTimeout(1500);
  say("clips folder:", fs.readdirSync(clips));
  await L.dismissToast(a.win);
  await L.mark(a.win, "00:00:02", "00:00:06");
  await a.win.click("#ui-add-segment");
  await a.win.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => /use it anyway/i.test(x.textContent || ""));
    if (b) b.click();
  });
  await a.win.waitForTimeout(400);
  await openPanel(a);
  const s5 = await dumpBlocks(a);
  say("enabled blocks:", s5.enabled);
  const idText = await copyBlock(a, "ui-copy-block-clip-id");
  say("   clip id block after one cut:", JSON.stringify(idText));
  check("clip id advanced to -02", idText, "ACM-stub0000001-02\nACM-stub0000001-02.mp4");
  const usedText = await copyBlock(a, "ui-copy-block-used");
  say("   used-material line:", JSON.stringify(usedText));
  await a.shot("05-after-a-cut");

  // keyboard: focus on open must land on a copy button
  await closePanel(a);
  await openPanel(a);
  const focus = (await dumpBlocks(a)).focus;
  say("");
  say("focus when the panel opens with everything available:", focus);
  check("focus lands on a copy button", /^BUTTON#ui-copy-block-/.test(String(focus)), true);
  say("page errors:", a.logs.pageErrors.slice(0, 5));
  await a.close();

  say("");
  say(`ASSERTIONS: ${pass} passed, ${fail} failed`);
  log.flush();
})().catch((e) => {
  say("SCRIPT FAILED: " + String(e.stack || e));
  log.flush();
  process.exit(1);
});
