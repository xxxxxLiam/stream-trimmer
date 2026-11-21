/**
 * File: YouTubeConnectModal.test.tsx
 * Description: A-1 / H-2. The gate must offer an honest way past it (the
 * trap's focus/inert behaviour is DOM-only and was verified in the real app).
 */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as any).window = {
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};

test("modal offers a labelled signed-out route and hides once it is taken", async () => {
  const lib = await import("../lib/youtubeConnection");
  const { default: Modal } = await import("./YouTubeConnectModal");
  const html = renderToStaticMarkup(<Modal open />);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /tabindex="-1"/, "dialog can take initial focus");
  assert.match(html, /Continue without signing in \(360p\)/);
  lib.continueSignedOut();
  assert.equal(renderToStaticMarkup(<Modal open />), "", "dismissed modal renders nothing");
  lib.resumeSignIn();
  assert.match(renderToStaticMarkup(<Modal open />), /role="dialog"/);
});
