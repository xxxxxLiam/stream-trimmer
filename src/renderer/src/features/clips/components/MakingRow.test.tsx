import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import MakingRow from "./MakingRow";
import { readFileSync } from "node:fs";

test("Board 03.2.12: a clip being made has a ✕ Stop making it with the Esc label, and the saved row does not", () => {
  const making = renderToStaticMarkup(<MakingRow kind="making" name="Honest Version" percent={40} phase="downloading" onCancel={() => {}} />);
  assert.match(making, /aria-label="Stop making it"/);
  const noHandler = renderToStaticMarkup(<MakingRow kind="making" name="Honest Version" percent={40} phase="downloading" />);
  assert.doesNotMatch(noHandler, /Stop making it/);
  assert.match(making, /Stop making it<span[^>]*>Esc/);
});

test("Liam 27 Nov: the Undo row and the Making row never shrink inside the scrolling Export list (an overflow-hidden flex child collapses to a sliver and crops its content)", () => {
  const src = readFileSync("src/renderer/src/features/clips/components/MakingRow.tsx", "utf8");
  const finished = src.match(/<div className="relative[^"]*overflow-hidden[^"]*border-hairlineStrong[^"]*">/)![0];
  assert.match(finished, /\bflex-none\b/);
  const making = src.match(/aria-label=\{`\$\{props\.name\}, \$\{preparing[\s\S]*?className="([^"]*)"/)![1];
  assert.match(making, /\bflex-none\b/);
});

test("the waiting-for-connection row has the same protection", () => {
  const src = readFileSync("src/renderer/src/features/clips/components/OfflineRow.tsx", "utf8");
  assert.match(src, /flex-none overflow-hidden/);
});
