/**
 * File: ErrorBoundary.test.tsx
 * Description: F-10 — a renderer throw must degrade to a visible, recoverable error.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ErrorBoundary, { ErrorFallback } from "./ErrorBoundary";

test("F-10: a thrown value becomes error state, whatever was thrown", () => {
  assert.equal(ErrorBoundary.getDerivedStateFromError(new Error("boom")).error?.message, "boom");
  assert.equal(ErrorBoundary.getDerivedStateFromError(null).error?.message, "null");
});

test("F-10: the fallback shows the message and both recovery actions", () => {
  const html = renderToStaticMarkup(
    <ErrorFallback error={new Error("Maximum update depth")} onRetry={() => {}} onReload={() => {}} />,
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /Something went wrong/);
  assert.match(html, /Maximum update depth/);
  assert.match(html, /Try again/);
  assert.match(html, /Reload window/);
});

test("F-10: a healthy tree renders through untouched", () => {
  const html = renderToStaticMarkup(
    <ErrorBoundary>
      <p>fine</p>
    </ErrorBoundary>,
  );
  assert.equal(html, "<p>fine</p>");
});

test("F-10: App mounts the boundary above every provider", () => {
  const app = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf8");
  const i = app.indexOf("<ErrorBoundary>");
  assert.ok(i > 0 && i < app.indexOf("<WorkspaceProvider>"), "ErrorBoundary wraps WorkspaceProvider");
});
