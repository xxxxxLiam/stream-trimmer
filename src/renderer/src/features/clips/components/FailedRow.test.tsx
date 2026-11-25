import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import FailedRow from "./FailedRow";

const failure = { code: "network_dropped", message: "The connection dropped", attempt: undefined, diagnostics: undefined } as never;
const failed = (attempts: number) => ({ name: "Cold Open", segments: [], kind: "offline", attempts, message: "x", code: "network_dropped" }) as never;

test("V18-M-2: after the second failed Retry, an offline row offers Copy details too", () => {
  const html = renderToStaticMarkup(<FailedRow failed={failed(3)} failure={failure} onAction={() => undefined} />);
  assert.match(html, /Copy details for Cold Open/);
  assert.match(html, /Retry Cold Open/);
});

test("the first failure offers Retry alone", () => {
  const html = renderToStaticMarkup(<FailedRow failed={failed(1)} failure={failure} onAction={() => undefined} />);
  assert.doesNotMatch(html, /Copy details/);
});

test("A2-1: a rejected sign-in says so and offers Sign in", () => {
  const f = { name: "Cold Open", segments: [], kind: "expired", attempts: 1, message: "x", code: "YOUTUBE_AUTH_REQUIRED" } as never;
  const html = renderToStaticMarkup(<FailedRow failed={f} failure={null} onAction={() => undefined} />);
  assert.match(html, /YouTube ended your sign-in\./);
  assert.match(html, /aria-label="Sign in"/);
  assert.doesNotMatch(html, /YouTube stopped the download/);
});

test("C3-3: a failed Clip-button cut is kept as a waiting moment when another cut starts, never dropped", async () => {
  const { readFileSync } = await import("node:fs");
  const eff = readFileSync("src/renderer/src/features/clips/hooks/useExportEffects.ts", "utf8");
  assert.match(eff, /!wasDownloading\.current && downloading && s\.failed && !s\.failed\.bankId/);
  assert.match(eff, /bankStore\.importClips\(q\.campaignId, q\.vid, \[\{ line: 1, id: null, label: "", segments: f\.segments \}\]\)/);
});
