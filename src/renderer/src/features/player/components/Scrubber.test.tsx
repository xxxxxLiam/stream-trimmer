/**
 * File: Scrubber.test.tsx
 * Path: src/renderer/src/features/player/components/Scrubber.test.tsx
 * Description: The joined clip's track draws every section in solid Ice, as the board does, and the
 *   hover label's key chip is the board's 32 x 22.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import Tooltip from "../../../shared/components/Tooltip";
import Scrubber from "./Scrubber";

test("every section of a joined clip is solid Ice, not dimmed when the playhead is elsewhere", () => {
  const h = renderToStaticMarkup(
    <Scrubber
      duration={8073}
      playhead={80}
      range={null}
      flags={[]}
      view={null}
      onSeek={() => {}}
      joined={[
        { start: 72, end: 90 },
        { start: 604, end: 620 },
      ]}
    />,
  );
  assert.equal(h.match(/bg-ice"/g)?.length, 2);
  assert.doesNotMatch(h, /ice-tint-50/);
});

test("the hover label's key chip is 32 by 22", () => {
  const h = renderToStaticMarkup(<Tooltip keyHint="L">Forward 5 s</Tooltip>);
  assert.match(h, /h-\[22px\]/);
  assert.match(h, /min-w-\[32px\]/);
});
