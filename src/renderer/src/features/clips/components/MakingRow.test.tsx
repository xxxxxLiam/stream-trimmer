import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import MakingRow from "./MakingRow";

test("Board 03.2.12: a clip being made has a ✕ Stop making it with the Esc label, and the saved row does not", () => {
  const making = renderToStaticMarkup(<MakingRow kind="making" name="Honest Version" percent={40} phase="downloading" onCancel={() => {}} />);
  assert.match(making, /aria-label="Stop making it"/);
  const noHandler = renderToStaticMarkup(<MakingRow kind="making" name="Honest Version" percent={40} phase="downloading" />);
  assert.doesNotMatch(noHandler, /Stop making it/);
  assert.match(making, /Stop making it<span[^>]*>Esc/);
});
