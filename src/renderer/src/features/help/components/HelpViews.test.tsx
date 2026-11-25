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

test("an opened answer has Back to Help and its paragraphs", () => {
  const a = HELP_ANSWERS[0];
  const h = renderToStaticMarkup(<HelpAnswer answer={a} onBack={noop} onClose={noop} />);
  assert.match(h, /aria-label="Back to Help"/);
  assert.match(h, /Only that part downloads/);
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
  assert.match(app, /onSignIn=\{\(\) => \{\s*setHelpStartAt\("signin"\)/);
  assert.match(app, /<HelpDrawer open=\{helpOpen\} onClose=\{closeHelp\} startAt=\{helpStartAt\}/);
});
