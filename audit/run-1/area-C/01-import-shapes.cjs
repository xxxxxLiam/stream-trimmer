/**
 * File: 01-import-shapes.cjs
 * Path: audit/run-1/area-C/01-import-shapes.cjs
 * Description: Area C: drives the real Import timestamps box with every input shape the
 *   brief names and prints what the app says it understood. Audit-only, reads nothing but
 *   the live DOM.
 */
const { boot, campaign, loadVideo, openBankTab, VID } = require("./lib.cjs");

const CASES = [
  ["empty paste", ""],
  ["one line, range", "1:00-1:30"],
  ["bare 1:23 (plain timestamp, no range)", "1:23"],
  ["bare 01:23", "01:23"],
  ["bare 1:23:45", "1:23:45"],
  ["bare 00:01:23.456", "00:01:23.456"],
  ["bare 83s", "83s"],
  ["bare 1m23s", "1m23s"],
  ["chapter list (youtube style)", "0:00 intro\n1:23 the hook\n4:05 the payoff"],
  ["1:23 vs 01:23 as ranges", "1:23-1:30\n01:23-01:30"],
  ["1:23:45 range", "1:23:45-1:24:10"],
  ["fractional range", "00:01:23.456-00:01:25.500"],
  ["83s style range", "83s-90s"],
  ["1m23s style range", "1m23s-1m30s"],
  ["seconds only range", "83-90"],
  ["leading and trailing blank lines", "\n\n1:00-1:30\n\n"],
  ["CRLF", "1:00-1:30\r\n2:00-2:30\r\n"],
  ["tabs between fields", "A01\t1:00-1:30\tthe hook"],
  ["tab separated start/end", "1:00\t1:30\tthe hook"],
  ["description after the time", "1:00-1:30 this is the description"],
  ["description with a comma", "1:00-1:30 one, two and three"],
  ["description with a quote", '1:00-1:30 he said "do it now"'],
  ["description with an emoji", "1:00-1:30 the best bit 🔥🔥"],
  ["RTL description", "1:00-1:30 מה שקרה אחר כך"],
  ["description with a literal \\n escape", "1:00-1:30 first line\\nsecond line"],
  ["duplicate timestamps, no ids", "1:00-1:30 take one\n1:00-1:30 take two"],
  ["duplicate ids", "A01 1:00-1:30\nA01 2:00-2:30"],
  ["out of order", "9:00-9:30\n2:00-2:30\n5:00-5:30"],
  ["beyond the video duration", "1:00-1:30\n59:00-61:30"],
  ["negative", "-5 - 10"],
  ["negative, explicit minus on both", "-0:10 - -0:05"],
  ["0:00", "0:00-0:00"],
  ["0:00 to 0:10", "0:00-0:10"],
  ["nonsense, no timestamps", "the quick brown fox\njumped over\nthe lazy dog"],
  ["prose that ends in a colon", "Notes from the call:\nnothing else here"],
  ["category and tier written out", "A02 4:10-4:50 category: hook tier: 2"],
  ["heading sets category", "Hook moments:\nA06 12:00-12:40\nA07 14:00-14:30"],
  ["semicolon two segments", "1:00-1:30; 2:00-2:10"],
  ["end before start", "2:00-1:00"],
];

(async () => {
  const a = await boot("C01-shapes", {
    "clipper.campaigns": [campaign("acme", "Acme Q4")],
    "clipper.activeCampaign": "acme",
  });
  try {
    await loadVideo(a);
    await openBankTab(a);
    await a.win.click('#ui-col-clips button:has-text("Import timestamps")');
    const ta = a.win.locator('textarea[placeholder="Paste your timestamps here"]');
    await ta.waitFor({ timeout: 10000 });

    for (const [name, text] of CASES) {
      await ta.evaluate((el, v) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
        setter.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }, text);
      await a.win.waitForTimeout(120);
      const out = await a.win.evaluate(() => {
        const u = document.querySelector('[aria-label="What was understood"]');
        const btn = [...document.querySelectorAll("#ui-col-clips button")].find((b) =>
          /^(Import \d|Nothing to import)/.test(b.textContent || ""),
        );
        return {
          understood: u ? u.innerText.replace(/\n+/g, " | ") : "(no preview shown)",
          button: btn ? `${btn.textContent}${btn.disabled ? " [disabled]" : ""}` : "(no button)",
        };
      });
      console.log(`\n### ${name}\n  input:   ${JSON.stringify(text)}\n  button:  ${out.button}\n  says:    ${out.understood}`);
    }
    console.log("\nshot:", await a.shot("last-case"));
    console.log("pageErrors:", JSON.stringify(a.logs.pageErrors));
  } catch (e) {
    console.error("FAIL", e);
    console.log("shot fail:", await a.shot("fail"));
  } finally {
    await a.close();
  }
})();
