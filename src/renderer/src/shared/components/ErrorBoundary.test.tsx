/**
 * File: ErrorBoundary.test.tsx
 * Description: F-10 — a renderer throw must degrade to a visible, recoverable error.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import CrashScreen from "./CrashScreen";
import ErrorBoundary from "./ErrorBoundary";

test("F-10: a thrown value becomes error state, whatever was thrown", () => {
  assert.equal(ErrorBoundary.getDerivedStateFromError(new Error("boom")).error?.message, "boom");
  assert.equal(ErrorBoundary.getDerivedStateFromError(null).error?.message, "null");
});

test("E-2: the crash screen offers Reopen, Send report and Copy details, and shows no raw error text", () => {
  const html = renderToStaticMarkup(
    <CrashScreen state="idle" copied={false} onReopen={() => {}} onSend={() => {}} onCopy={() => {}} />,
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /Clipr hit a problem/);
  assert.match(html, />Reopen Clipr</);
  assert.match(html, />Send report</);
  assert.match(html, />Copy details</);
  assert.match(html, /Nothing is sent unless you press Send report/);
  assert.doesNotMatch(html, /<pre/);
});

test("E-2: after Send report the screen says it was sent, or saved for a later launch", () => {
  const at = (state: "sent" | "kept") => renderToStaticMarkup(<CrashScreen state={state} copied={false} onReopen={() => {}} onSend={() => {}} onCopy={() => {}} />);
  assert.match(at("sent"), /Sent\. Thank you\./);
  assert.match(at("kept"), /Saved\. Clipr will send it when it can\./);
  assert.doesNotMatch(at("kept"), />Send report</);
});

test("E-2: the boundary shows the crash screen it is given, with the error going to it, not to the page", () => {
  const err = ErrorBoundary.getDerivedStateFromError(new Error("secret internal message"));
  const b = new ErrorBoundary({ children: <p>child</p>, fallback: (e) => <p>crash:{e === err.error ? "same" : "other"}</p> });
  b.state = err;
  assert.equal(renderToStaticMarkup(<>{b.render()}</>), "<p>crash:same</p>");
});

test("F-10: a healthy tree renders through untouched", () => {
  const html = renderToStaticMarkup(
    <ErrorBoundary fallback={() => <p>crash</p>}>
      <p>fine</p>
    </ErrorBoundary>,
  );
  assert.equal(html, "<p>fine</p>");
});

test("F-10: App mounts the boundary above every provider", () => {
  const app = readFileSync(join(process.cwd(), "src", "renderer", "src", "routes", "App.tsx"), "utf8");
  const i = app.indexOf("<ErrorBoundary ");
  assert.ok(i > 0 && i < app.indexOf("<WorkspaceProvider>"), "ErrorBoundary wraps WorkspaceProvider");
});

test("E-2: the app's boundary uses the report-sending crash screen", () => {
  const app = readFileSync(join(process.cwd(), "src", "renderer", "src", "routes", "App.tsx"), "utf8");
  assert.match(app, /<ErrorBoundary fallback=\{\(error\) => <CrashScreenHost error=\{error\} \/>\}>/);
  assert.doesNotMatch(app, /useFlushPendingReports/, "main keeps and retries reports now");
});
