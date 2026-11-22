/**
 * F-12: the two channel-exporter tutorials.
 * HelpDrawer gates them on the BUILD flag (import.meta.env.VITE_ENABLE_CHANNEL_DATA)
 * while the Channel data link is gated on the OWNER check. On a build that has
 * the exporter compiled in but is not running on an owner machine the two
 * gates disagree. Also runs the two tutorials on an owner machine.
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const PROBE = (id) => {
  const el = document.getElementById(id);
  if (!el) return { id, exists: false };
  const r = el.getBoundingClientRect();
  return { id, exists: true, w: Math.round(r.width), h: Math.round(r.height), zero: r.width === 0 || r.height === 0 };
};

async function run(label, appRoot) {
  const a = await L.boot(label, { appRoot });
  const rows = [];
  try {
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await a.win.waitForTimeout(800);
    const gates = await a.win.evaluate(() => ({
      channelLinkPresent: Boolean(document.getElementById("ui-channel-link")),
    }));
    await L.openHelp(a.win);
    const list = await a.win.$$eval("[data-help-result]", (ns) => ns.map((n) => n.textContent.replace(/\d+ steps?$/, "").trim()));
    const channelTasks = list.filter((t) => /channel|Stop a run/i.test(t));
    console.log(`\n== ${label}`);
    console.log("  channel link in header:", gates.channelLinkPresent);
    console.log("  tasks listed:", list.length, " channel tasks listed:", JSON.stringify(channelTasks));
    rows.push({ label, ...gates, taskCount: list.length, channelTasks });
    await a.shot("help-list");

    for (const title of channelTasks) {
      await a.win.evaluate(() => {
        const d = document.getElementById("ui-help-drawer");
        [...d.querySelectorAll("button")].find((x) => x.textContent.trim() === "All tasks")?.click();
      });
      await a.win.waitForTimeout(200);
      await a.win.evaluate((t) => {
        [...document.querySelectorAll("[data-help-result]")].find((n) => n.textContent.startsWith(t))?.click();
      }, title);
      await a.win.waitForTimeout(400);
      for (let step = 0; step < 2; step++) {
        const r = await a.win.evaluate(() => {
          const d = document.getElementById("ui-help-drawer");
          const sp = document.querySelector("[data-help-spotlight]");
          return {
            step: (d.textContent.match(/Step \d+ of \d+/) || [])[0],
            spotlightFor: sp?.getAttribute("data-help-spotlight") ?? null,
            notice: /not on screen right now/i.test(d.textContent),
          };
        });
        rows.push({ label, title, ...r });
        console.log(`   ${title} ${r.step}: spotlight=${r.spotlightFor} notice=${r.notice}`);
        await a.win.evaluate(() => {
          const d = document.getElementById("ui-help-drawer");
          [...d.querySelectorAll("button")].find((x) => x.textContent.trim() === "Next step")?.click();
        });
        await a.win.waitForTimeout(350);
      }
      await a.shot(`task-${title.replace(/\W+/g, "-").toLowerCase()}`);
    }

    // On the owner build, follow step 1 to the channel screen and check the
    // help button and the second step's anchor there.
    if (gates.channelLinkPresent) {
      await a.win.click("#ui-channel-link");
      await a.win.waitForTimeout(1200);
      const onChannel = await a.win.evaluate(() => {
        const h = document.getElementById("ui-help-button")?.getBoundingClientRect();
        const d = document.getElementById("ui-help-drawer");
        return {
          helpPresent: Boolean(h),
          helpFromRight: h ? Math.round(innerWidth - h.right) : null,
          helpFromTop: h ? Math.round(h.top) : null,
          drawerStillOpen: Boolean(d),
          drawerTask: d?.querySelector("h3")?.textContent?.trim() ?? null,
          startAnchor: ((id) => {
            const e = document.getElementById(id);
            return e ? "present" : "absent";
          })("help-anchor-channel-start"),
          stopAnchor: document.getElementById("help-anchor-channel-stop") ? "present" : "absent",
          spotlight: document.querySelector("[data-help-spotlight]")?.getAttribute("data-help-spotlight") ?? null,
          notice: d ? /not on screen right now/i.test(d.textContent) : null,
        };
      });
      rows.push({ label, screen: "channel", ...onChannel });
      console.log("  on the channel screen:", JSON.stringify(onChannel));
      await a.shot("channel-screen");
    }
    return rows;
  } finally {
    await a.close();
  }
}

(async () => {
  const all = [];
  all.push(...(await run("F-12-channel-owner", "/tmp/f-app-channel")));
  all.push(...(await run("F-12-channel-nonowner", "/tmp/f-app-channel-nonowner")));
  const out = path.join(L.OUT, "F-12-channel-help.json");
  fs.writeFileSync(out, JSON.stringify(all, null, 2));
  console.log("\nREPORT", out);
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
