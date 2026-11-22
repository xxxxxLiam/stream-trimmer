/**
 * F-00: smoke. Does the app boot, is the sign-in modal gone, is the help
 * button present, does the drawer open? Also dumps the catalogue parse.
 */
const L = require("./lib.cjs");

(async () => {
  const cat = L.readCatalogue();
  console.log("CATALOGUE tasks =", cat.tasks.length);
  for (const t of cat.tasks) {
    console.log(`  ${t.id}: ${t.steps.length} steps -> ${t.steps.map((s) => s.anchorId).join(", ")}`);
  }

  const a = await L.boot("F-00-smoke");
  try {
    console.log("modalOpen =", await L.modalOpen(a.win));
    console.log("SHOT", await a.shot("booted"));
    const btn = await L.box(a.win, "#ui-help-button");
    console.log("helpButton box =", JSON.stringify(btn));
    if (btn) {
      await L.openHelp(a.win);
      console.log("drawer =", JSON.stringify(await L.box(a.win, "#ui-help-drawer")));
      console.log("SHOT", await a.shot("help-open"));
      const results = await a.win.$$eval("[data-help-result]", (ns) => ns.map((n) => n.textContent.trim()));
      console.log("results:", JSON.stringify(results, null, 1));
    }
    console.log("PAGE ERRORS", JSON.stringify(a.logs.pageErrors));
  } finally {
    await a.close();
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
