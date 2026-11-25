import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import MakingRow from "./MakingRow";

test("C-7: a clip being made has a Cancel on its row, and the saved row does not", () => {
  const making = renderToStaticMarkup(<MakingRow kind="making" name="Honest Version" percent={40} phase="downloading" onCancel={() => {}} />);
  assert.match(making, /aria-label="Cancel Honest Version"/);
  const noHandler = renderToStaticMarkup(<MakingRow kind="making" name="Honest Version" percent={40} phase="downloading" />);
  assert.doesNotMatch(noHandler, /Cancel/);
});
