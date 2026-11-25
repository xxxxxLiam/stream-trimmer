/**
 * File: HelpViews.test.tsx
 * Description: The Help views as drawn: the questions list and More rows, an opened answer, report and
 *   its kept-for-later state, the sign-in page with its drop zone and refusal sentences, and the App
 *   wiring (the footer pill opens the sign-in page).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import HelpAnswer from "./HelpAnswer";
import { tourOf } from "./HelpDrawer";
import HelpReport, { type HelpReportProps } from "./HelpReport";
import HelpShortcuts from "./HelpShortcuts";
import HelpSignIn from "./HelpSignIn";
import HelpTop, { type HelpTopProps } from "./HelpTop";
import { HELP_ANSWERS, HELP_MORE } from "../utils/helpContent";
import { cookieReason } from "../utils/cookieReasons";
import { searchHelp } from "../utils/helpSearch";

const noop = () => {};
const top: HelpTopProps = {
  query: "",
  onQuery: noop,
  results: searchHelp(""),
  version: "1.4.0",
  tipsOn: true,
  onOpenAnswer: noop,
  onOpenMore: noop,
  onReplayTips: noop,
  onClose: noop,
};

test("first view: search, the five common questions, then More", () => {
  const h = renderToStaticMarkup(<HelpTop {...top} />);
  assert.match(h, /placeholder="What do you need help with\?"/);
  for (const a of HELP_ANSWERS.filter((x) => !x.searchOnly)) assert.match(h, new RegExp(`aria-label="${a.question.replace("?", "\\?")}"`));
  assert.match(h, /aria-label="Replay tips for this panel"/);
  assert.match(h, /Show tips on/);
  assert.match(h, /aria-label="Keyboard shortcuts"/);
  assert.match(h, /aria-label="Report a problem"/);
  assert.match(h, /aria-label="About Clipr 1\.4\.0"/);
  assert.match(h, /aria-label="Close Help"/);
  assert.equal(HELP_MORE.length, 4);
});

test("no match says so and offers Report a problem", () => {
  const h = renderToStaticMarkup(<HelpTop {...top} query="zzzzqx" results={searchHelp("zzzzqx")} />);
  assert.match(h, /No answer for that yet/);
  assert.match(h, />Report a problem</);
  assert.doesNotMatch(h, /Common questions/);
});

test("an opened answer: Back to Help, numbered steps, pictures with an Ice ring, one note, Show me pinned", () => {
  const a = HELP_ANSWERS.find((x) => x.id === "where-clip")!;
  const h = renderToStaticMarkup(<HelpAnswer answer={a} onBack={noop} onClose={noop} onShowMe={noop} />);
  assert.match(h, /aria-label="Back to Help"/);
  assert.match(h, /<ol start="1"/);
  assert.match(h, />1<\/span><span>Open History\.</);
  assert.match(h, />2<\/span><span>Click the folder icon on the clip’s row\.</);
  assert.equal((h.match(/outline-ice/g) ?? []).length, 2, "one ringed control in each of the two pictures");
  assert.match(h, /aria-hidden="true"[^>]*class="ml-\[30px\]/, "pictures are decorative");
  assert.match(h, /Change it in Settings › Clips folder\./);
  assert.match(h, /aria-label="Show me in Clipr: closes Help and runs these steps on the real controls"/);
  assert.match(h, /tabindex="0" aria-label="Answer"/, "the steps scroll by keys");
});

test("a long answer groups its steps under plain labels and numbering carries on", () => {
  const a = HELP_ANSWERS.find((x) => x.id === "send-final-cut")!;
  const h = renderToStaticMarkup(<HelpAnswer answer={a} onBack={noop} onClose={noop} onShowMe={noop} />);
  assert.match(h, />Once per campaign</);
  assert.match(h, />Each clip</);
  assert.match(h, /<ol start="4"/, "the second group continues at 4");
  assert.match(h, />5<\/span><span>Final Cut opens with the clip in the Export event\./);
  assert.match(h, /Only on a Mac\. Not tested against a real Final Cut yet\./);
});

test("every answer is steps and at most one short note, never paragraphs", () => {
  for (const a of HELP_ANSWERS) {
    const steps = a.groups.flatMap((g) => g.steps);
    assert.ok(steps.length >= 1 && steps.length <= 6, `${a.id} has ${steps.length} steps`);
    for (const s of steps) assert.ok(s.text.length <= 130, `${a.id}: a step is a sentence, not a paragraph`);
    if (a.note) assert.ok(a.note.length <= 120, `${a.id}'s note is short`);
    assert.ok(!("paras" in a));
  }
  assert.deepEqual(HELP_ANSWERS.filter((a) => !a.searchOnly).map((a) => a.id), ["make-clip", "clip-greyed", "where-clip", "join-parts", "dubbed-audio"]);
});

test("Show me in Clipr: only steps that name a real control become tip cards, in order, with the real action", () => {
  const where = tourOf(HELP_ANSWERS.find((x) => x.id === "where-clip")!);
  assert.deepEqual(where.map((s) => s.text), ["Open History.", "Click the folder icon on the clip’s row."]);
  assert.deepEqual(where[0].advanceOn, { click: "target" });
  assert.equal(where[0].withText, "History");
  const make = tourOf(HELP_ANSWERS.find((x) => x.id === "make-clip")!);
  assert.deepEqual(make[1].advanceOn, { keys: ["o"] });
  const fc = tourOf(HELP_ANSWERS.find((x) => x.id === "send-final-cut")!);
  assert.equal(fc.length, 4, "the last step has no control to ring, so it is left out");
  const view = readFileSync(join(process.cwd(), "src/renderer/src/features/tips/hooks/useTipsController.ts"), "utf8");
  assert.match(view, /endTour/);
  assert.match(view, /#ui-help-button/, "focus returns to Help's button when the walk ends");
  const app = readFileSync(join(process.cwd(), "src/renderer/src/routes/App.tsx"), "utf8");
  assert.match(app, /onShowMe: \(steps\) => \{ closeHelp\(\); tips\.startTour\(steps\); \}/);
});

const report: HelpReportProps = { note: "Clip stopped at 61%.", onNote: noop, state: "writing", copied: false, onSend: noop, onCopy: noop, onBack: noop, onClose: noop };

test("report: note, privacy line, Send report and Copy details; kept state says saved", () => {
  const h = renderToStaticMarkup(<HelpReport {...report} />);
  assert.match(h, /What happened\? A line or two is enough\./);
  assert.match(h, /Nothing is sent unless you press Send report\./);
  assert.match(h, /aria-label="Send report"/);
  const k = renderToStaticMarkup(<HelpReport {...report} state="kept" />);
  assert.match(k, /Saved\. Clipr will send it when it can\./);
  assert.match(k, /aria-label="Copy details"/);
  assert.doesNotMatch(k, /aria-label="Send report"/);
});

test("report sent: the page itself says Sent, what went with it, Back to Help and Copy details, and promises nothing", () => {
  const h = renderToStaticMarkup(<HelpReport {...report} state="sent" />);
  assert.match(h, /role="status"[\s\S]*text-frost[\s\S]*Sent\. Thank you\./);
  assert.match(h, /It went with the error, the version numbers and a cleaned log\. There&#x27;s nothing else to do\./);
  assert.match(h, />Back to Help</);
  // V18-F-7: the header arrow keeps "Back to Help"; the body button has its own name, so the two are told apart.
  assert.equal((h.match(/aria-label="Back to Help"/g) ?? []).length, 1);
  assert.match(h, /aria-label="Back to Help questions"/);
  assert.match(h, /aria-label="Copy details"/);
  assert.doesNotMatch(h, /aria-label="Send report"|reference|reply/i);
  assert.doesNotMatch(renderToStaticMarkup(<HelpReport {...report} state="kept" />), />Back to Help<|cleaned log/);
});

test("shortcuts read Ctrl on Windows", () => {
  assert.match(renderToStaticMarkup(<HelpShortcuts ctrl onBack={noop} onClose={noop} />), />Ctrl Enter</);
  assert.match(renderToStaticMarkup(<HelpShortcuts ctrl={false} onBack={noop} onClose={noop} />), />⌘ Enter</);
});

test("sign-in page: honest line, three steps, drop zone; a refusal shows reason then fix", () => {
  const base = { problem: null, done: false, onFile: noop, onChoose: noop, onBack: noop, onClose: noop };
  const h = renderToStaticMarkup(<HelpSignIn {...base} />);
  assert.match(h, /never posts, likes or changes anything/);
  assert.match(h, /Drop cookies\.txt, or choose a file/);
  assert.match(h, /Get cookies\.txt LOCALLY/);
  assert.doesNotMatch(h, /Try again/);
  const bad = renderToStaticMarkup(<HelpSignIn {...base} problem={cookieReason({ ok: false, reason: "wrong-site" })} />);
  assert.match(bad, /role="alert"/);
  assert.match(bad, /no YouTube cookies/);
  assert.match(bad, /text-error/);
});

test("the engine's own sentences win over the fallback", () => {
  const r = cookieReason({ ok: false, reason: "signed-out", message: "Signed out when exported.", fix: "Sign in, then export." });
  assert.deepEqual(r, { reason: "Signed out when exported.", fix: "Sign in, then export." });
  assert.match(cookieReason({ ok: false }).reason, /isn’t a cookies file/);
  assert.match(cookieReason({ ok: false, kind: "too_old" }).reason, /ended this session/);
  assert.match(cookieReason({ ok: false, kind: "wrong_site" }).reason, /no YouTube cookies/);
  assert.match(cookieReason({ ok: false, kind: "wrong_format" }).reason, /isn’t a cookies file/);
});

test("the footer pill opens Help on its sign-in page", () => {
  const app = readFileSync(join(process.cwd(), "src/renderer/src/routes/App.tsx"), "utf8");
  assert.match(app, /const openSignIn = \(\) => \{\s*setHelpStartAt\("signin"\)/);
  assert.match(app, /onSignIn=\{openSignIn\}/);
  assert.match(app, /<HelpDrawer open=\{helpOpen\} onClose=\{closeHelp\} startAt=\{helpStartAt\}/);
});

test("F-9 and F-16: one report per click, the note goes with the report, Replay tips closes Help first", () => {
  const read = (f: string) => readFileSync(join(process.cwd(), "src/renderer/src/features", f), "utf8");
  const m = read("help/hooks/useReportMutations.ts");
  assert.match(m, /if \(sending\.current\) return;/);
  const c = read("help/hooks/useHelpController.ts");
  assert.match(c, /await report\.send\(note\);\s*setNote\(""\)/);
  assert.match(c, /report\.reset\(\);\s*setNote\(""\)/);
  const app = readFileSync(join(process.cwd(), "src/renderer/src/routes/App.tsx"), "utf8");
  assert.match(app, /onReplay: \(\) => \{ closeHelp\(\); tips\.replay\(\); \}/);
});

test("F2-3: Report a problem shows a counter, stops at 2,000 characters, and Send waits for a note", () => {
  const empty = renderToStaticMarkup(<HelpReport {...report} note="" />);
  assert.match(empty, /0 \/ 2000/);
  assert.match(empty, /maxLength="2000"/);
  assert.match(empty, /<button[^>]*aria-label="Send report"[^>]*disabled=""/);
  const some = renderToStaticMarkup(<HelpReport {...report} note="It stopped." />);
  assert.match(some, /11 \/ 2000/);
  assert.doesNotMatch(some, /<button[^>]*aria-label="Send report"[^>]*disabled=""/);
  assert.match(some, /aria-label="Copy details"/, "Copy details stays available");
});

test("F2-8: the Paste key chip on Start uses a token, not an opacity modifier", () => {
  const src = readFileSync(join(process.cwd(), "src/renderer/src/features/start/components/ColdStart.tsx"), "utf8");
  assert.doesNotMatch(src, /opacity-(?!0")\d+/, "no dimmed text (the blinking caret's opacity-0 is not text)");
  assert.match(src, /<span className="text-meta font-normal text-bg">\{p\.pasteKey\}<\/span>/);
});

test("F3-2 and F3-3: focus goes to the result, a finished report is shown on reopening Help, and an unsent note stays", async () => {
  const { readFileSync } = await import("node:fs");
  const view = readFileSync(new URL("./HelpReport.tsx", import.meta.url), "utf8");
  assert.match(view, /if \(kept \|\| sent\) done\.current\?\.focus\(\)/);
  assert.match(renderToStaticMarkup(<HelpReport {...report} state="sent" />), /tabindex="-1" role="status"/);
  const ctl = readFileSync(new URL("../hooks/useHelpController.ts", import.meta.url), "utf8");
  assert.match(ctl, /reportRef\.current\.unseen && reportRef\.current\.state !== "writing" \? \{ kind: "report" \}/);
  assert.match(ctl, /if \(report\.state !== "writing"\) \{\s*report\.reset\(\);\s*setNote\(""\)/);
  assert.match(readFileSync(new URL("../hooks/useReportMutations.ts", import.meta.url), "utf8"), /setUnseen\(true\)/);
});
