#!/usr/bin/env node
/**
 * A-1 verification. Written from the finding's Steps.
 *
 * Both halves have to hold for "blocker":
 *   (1) the connect modal cannot be dismissed by any means a user has
 *       (no close control, Escape inert, backdrop click inert, pointer
 *       clicks on the covered UI blocked), AND
 *   (2) a signed-out download genuinely succeeds, so the product would be
 *       useful to someone with no cookies.txt if only they could reach it.
 *
 * Also actively tried, to disprove: a backdrop click, both Escape and Esc on
 * the dialog itself, window.onbeforeunload-free reload (does the modal come
 * back?), and whether the sweep verdict (inconclusive vs a hard signed_out)
 * changes the outcome.
 *
 * usage: xvfb-run -a --server-args="-screen 0 1440x900x24" node v-a1.cjs [run]
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch, api } = require("./lib.cjs");
const { makeStub, writeCfg, calls, resetCalls } = require("./mkstub.cjs");

const RUN = process.argv[2] || "1";
const STUB = `/tmp/s4-stub-a1-${RUN}`;
const SAVE = `/tmp/s4-a1-save-${RUN}`;

// Two sweep outcomes, both of which a real user with no signed-in browser can
// produce. "quiet" = progress lines only -> classifier says `inconclusive`.
// "signin" = yt-dlp's real signed-out text -> classifier says `signed_out`.
const VERDICTS = {
  quiet: { exitCode: 0, stdout: "[download] 100% of 1.00MiB", stderr: "" },
  signin: {
    exitCode: 1,
    stderr:
      "ERROR: [youtube] jNQXAC9IVRw: Sign in to confirm you're a human. Use --cookies-from-browser or --cookies for the authentication.",
  },
};

(async () => {
  fs.rmSync(SAVE, { recursive: true, force: true });
  fs.mkdirSync(SAVE, { recursive: true });
  const report = { run: RUN, verdicts: {} };

  for (const [name, spec] of Object.entries(VERDICTS)) {
    makeStub(STUB, { auth: { default: spec, browserDefault: spec, app: spec } });
    resetCalls(STUB);
    const a = await launch({
      mirror: "/tmp/s4-public",
      label: `a1-${RUN}-${name}`,
      cwd: STUB,
      // No cookie file at all: a fresh install.
      seed: { "clipper.dataDirConfirmed": true },
    });
    const r = { sweepVerdict: name };
    try {
      await a.win.waitForSelector("header", { timeout: 30000 });
      // Let the automatic sweep finish (6 browsers x up to 3 probe videos).
      await a.win
        .waitForFunction(
          () => {
            const d = document.querySelector('[role="dialog"]');
            if (!d) return false;
            const btn = Array.from(d.querySelectorAll("button")).map((b) => b.textContent || "");
            return btn.some((t) => /Choose cookies\.txt/.test(t));
          },
          { timeout: 60000 },
        )
        .catch(() => {});
      await a.win.waitForTimeout(3000);

      r.modalOpen = await a.win.locator('[role="dialog"][aria-modal="true"]').count();
      r.shotInitial = await a.shot("01-cold-boot");

      // --- (1a) is there any dismissal control inside the dialog? ---
      r.dialog = await a.win.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        if (!d) return null;
        const cs = getComputedStyle(d);
        return {
          className: d.className,
          zIndex: cs.zIndex,
          position: cs.position,
          pointerEvents: cs.pointerEvents,
          heading: d.querySelector("h2")?.textContent ?? null,
          alert: d.querySelector('[role="alert"]')?.textContent ?? null,
          reason: d.querySelector("pre")?.textContent ?? null,
          buttons: Array.from(d.querySelectorAll("button")).map((b) => ({
            text: (b.textContent || "").trim().slice(0, 60),
            ariaLabel: b.getAttribute("aria-label"),
            title: b.getAttribute("title"),
          })),
          anyCloseLike: Array.from(d.querySelectorAll("button,a,[role=button]")).some((e) =>
            /close|skip|not now|later|continue without|dismiss|cancel|×|✕/i.test(
              (e.textContent || "") + (e.getAttribute("aria-label") || "") + (e.getAttribute("title") || ""),
            ),
          ),
        };
      });

      // --- (1b) Escape, twice, on the window and on the dialog ---
      await a.win.keyboard.press("Escape");
      await a.win.waitForTimeout(400);
      r.afterEsc1 = await a.win.locator('[role="dialog"]').count();
      await a.win.keyboard.press("Escape");
      await a.win.waitForTimeout(400);
      r.afterEsc2 = await a.win.locator('[role="dialog"]').count();
      // Escape dispatched at the dialog element itself, bubbling.
      await a.win.evaluate(() => {
        document
          .querySelector('[role="dialog"]')
          ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      await a.win.waitForTimeout(400);
      r.afterEscOnDialog = await a.win.locator('[role="dialog"]').count();
      r.shotAfterEsc = await a.shot("02-after-escape");

      // --- (1c) backdrop click (outside the panel, on the scrim) ---
      const box = await a.win.locator('[role="dialog"]').boundingBox();
      if (box) {
        await a.win.mouse.click(box.x + 8, box.y + 8);
        await a.win.waitForTimeout(500);
      }
      r.afterBackdropClick = await a.win.locator('[role="dialog"]').count();

      // --- (1d) real pointer clicks on the covered UI ---
      const tryClick = async (sel) => {
        try {
          await a.win.click(sel, { timeout: 2500 });
          return "clicked";
        } catch (e) {
          return `BLOCKED: ${String(e).split("\n")[0].slice(0, 90)}`;
        }
      };
      r.clickUrlField = await tryClick("header input");
      r.clickHelpButton = await tryClick("#ui-help-button");
      r.clickSettings = await tryClick("#ui-settings");
      r.hitTest = await a.win.evaluate(() => {
        const out = {};
        for (const sel of ["header input", "#ui-help-button", "#ui-settings"]) {
          const el = document.querySelector(sel);
          if (!el) { out[sel] = "absent"; continue; }
          const rc = el.getBoundingClientRect();
          const top = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
          out[sel] = {
            topMostTag: top ? top.tagName + "." + String(top.className).slice(0, 48) : null,
            isSelfOrInside: Boolean(top && (el.contains(top) || top === el)),
          };
        }
        return out;
      });

      // --- (1e) does a reload get past it? ---
      await a.win.reload();
      await a.win.waitForSelector("header", { timeout: 30000 });
      await a.win.waitForTimeout(4000);
      r.afterReload = await a.win.locator('[role="dialog"]').count();

      // --- (2) does a signed-out download really work? ---
      writeCfg(STUB, {
        auth: { default: spec, browserDefault: spec, app: spec },
        download: { exitCode: 0, writeMedia: true, progress: [0, 50, 100] },
      });
      const best = await api(a.win, "POST", "/api/download", {
        url: "https://www.youtube.com/watch?v=stub0000001",
        segments: [{ start: 1, end: 5 }],
        format: "mp4",
        quality: "best",
        deliver: "path",
      });
      const p360 = await api(a.win, "POST", "/api/download", {
        url: "https://www.youtube.com/watch?v=stub0000001",
        segments: [{ start: 1, end: 5 }],
        format: "mp4",
        quality: "360",
        deliver: "path",
      });
      r.downloadBest = { status: best.status, code: best.json?.code, error: best.json?.error?.slice(0, 120) };
      r.download360 = { status: p360.status, body: p360.json };
      const outPath = p360.json && (p360.json.path || p360.json.file || p360.json.outputPath);
      if (outPath && fs.existsSync(outPath)) {
        const st = fs.statSync(outPath);
        const head = fs.readFileSync(outPath).slice(0, 12).toString("hex");
        r.download360File = { path: outPath, bytes: st.size, head12: head, looksMp4: head.includes("66747970") };
      } else {
        r.download360File = { path: outPath ?? null, exists: false };
      }
      // Could the user even pick 360p? The control is behind the modal.
      r.qualityControlReachable = await tryClick("#ui-footer-format");

      r.info = await api(a.win, "POST", "/api/info", {
        url: "https://www.youtube.com/watch?v=stub0000001",
      }).then((x) => ({ status: x.status, title: x.json?.title }));

      r.ytDlpCalls = calls(STUB).length;
    } catch (e) {
      r.error = String(e);
    }
    await a.close();
    report.verdicts[name] = r;
  }

  const outFile = path.join(__dirname, "out", `a1-run${RUN}.json`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log("\nwrote", outFile);
})().catch((e) => { console.error(e); process.exit(1); });
