/**
 * File: WaitingRow.test.tsx
 * Description: F-14: a made (dimmed) row and a History row whose file is missing use the disabled
 *   token on their text, never an opacity modifier (CLAUDE.md), so the text stays at AA contrast.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { BankedClip } from "../../../shared/utils/bank";
import WaitingRow from "./WaitingRow";

const clip = { id: "b1", label: "Honest Version", segments: [{ start: 4324, end: 4366 }], status: "cut", category: "Money", tier: "T1" } as unknown as BankedClip;
const noop = () => {};

test("F-14: a made row's name is the disabled token, and nothing on the row uses opacity", () => {
  const html = renderToStaticMarkup(<WaitingRow clip={clip} name="Honest Version" suggested={false} selected={false} made onSelect={noop} onMake={noop} onRemove={noop} />);
  assert.doesNotMatch(html, /opacity-/);
  assert.match(html, /text-disabled[^>]*>Honest Version/);
  // The whole row reads dimmed the board's way: range line, chips and dot too, none of it fg-dim.
  assert.match(html, /text-disabled">0:|text-disabled[^>]*>1:12:04/);
  assert.match(html, /border-hairline px-\[4px\][^>]*text-disabled/);
  assert.match(html, /bg-frost-tint-60/);
  const waiting = renderToStaticMarkup(<WaitingRow clip={clip} name="Honest Version" suggested={false} selected={false} onSelect={noop} onMake={noop} onRemove={noop} />);
  assert.doesNotMatch(waiting, /text-disabled[^>]*>Honest Version/);
});

test("F-14: a History row with a missing file uses the disabled token, not opacity", () => {
  const src = readFileSync("src/renderer/src/features/downloads/components/HistoryPanel.tsx", "utf8");
  assert.doesNotMatch(src, /opacity-/);
  assert.match(src, /h\.missing\[e\.id\] \? "text-disabled"/);
});

test("a clip that ran past the end says where it stops, in one dim line; a made one does not", () => {
  const clip = { id: "B01", label: "Big Deal", segments: [{ start: 8000, end: 8073 }], status: "banked", ranPastEnd: 8073 } as never;
  const html = renderToStaticMarkup(<WaitingRow clip={clip} name="Big Deal" suggested={false} selected={false} onSelect={() => undefined} onMake={() => undefined} onRemove={() => undefined} />);
  assert.match(html, /Ran past the end; stops at 2:14:33/);
  const made = renderToStaticMarkup(<WaitingRow clip={clip} name="Big Deal" suggested={false} selected={false} made onSelect={() => undefined} onMake={() => undefined} onRemove={() => undefined} />);
  assert.doesNotMatch(made, /Ran past the end/);
});

test("C3-5: a moment under the campaign's minimum says so in one dim line", () => {
  const clip = { id: "B02", label: "Short", segments: [{ start: 8072, end: 8073 }], status: "banked" } as never;
  const html = renderToStaticMarkup(<WaitingRow clip={clip} name="Short" suggested={false} selected={false} lengthNote="29 s under Acme’s 0:30" onSelect={() => undefined} onMake={() => undefined} onRemove={() => undefined} />);
  assert.match(html, /29 s under Acme’s 0:30/);
  const none = renderToStaticMarkup(<WaitingRow clip={clip} name="Short" suggested={false} selected={false} onSelect={() => undefined} onMake={() => undefined} onRemove={() => undefined} />);
  assert.doesNotMatch(none, /under/);
});

test("C3-5: only a length under the minimum is flagged, from the campaign's rule", async () => {
  const { readFileSync } = await import("node:fs");
  const panel = readFileSync("src/renderer/src/features/clips/components/ExportPanel.tsx", "utf8");
  assert.match(panel, /lengthNote=\{underMinimum\(clip, c\.lengthRule, c\.campaignName\)\}/);
  assert.match(panel, /v\.state === "out" && \/under\/\.test\(v\.label\)/);
});

test("C3-4 and C3-1: Ctrl+B with nothing marked says so; an undecided sign-in check counts as signed out and never says it ended", async () => {
  const { readFileSync } = await import("node:fs");
  assert.match(readFileSync("src/renderer/src/routes/App.tsx", "utf8"), /showMomentNote\("Mark a part first\."\)/);
  const dl = readFileSync("src/renderer/src/modules/clipper/hooks/useClipDownloadMutations.ts", "utf8");
  assert.match(dl, /signedOut: !hadSession/);
  const eff = readFileSync("src/renderer/src/features/clips/hooks/useExportEffects.ts", "utf8");
  assert.match(eff, /byCode === "expired" && failure\?\.hadSession === false \? "signin" : byCode/);
});
