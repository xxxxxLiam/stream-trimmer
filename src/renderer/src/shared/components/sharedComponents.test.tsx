/**
 * File: sharedComponents.test.tsx
 * Description: States of the Components-board parts, and the token rule: no shared component holds a
 *   raw hex or rgba value (CLAUDE.md: a component never holds a raw hex or rgba).
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { renderToStaticMarkup as html } from "react-dom/server";
import BrandMark, { BrandLockup } from "./BrandMark";
import Button from "./Button";
import Chip from "./Chip";
import { Drawer, DrawerHeader } from "./Drawer";
import IconButton from "./IconButton";
import { Menu, MenuItem } from "./Menu";
import Row, { StatusDot } from "./Row";
import SearchPill from "./SearchPill";
import SplitButton from "./SplitButton";
import Toggle from "./Toggle";
import Tooltip from "./Tooltip";
import UndoRing from "./UndoRing";

const glyph = <i data-glyph />;

test("primary Button is Ice on bg with the hover glow; disabled drops the fill and keeps focus", () => {
  const on = html(<Button variant="primary">Next video</Button>);
  assert.match(on, /bg-ice/);
  assert.match(on, /hover:shadow-clip-hover/);
  const off = html(<Button variant="primary" disabled>Clip</Button>);
  assert.match(off, /aria-disabled="true"/);
  assert.match(off, /text-disabled/);
  assert.doesNotMatch(off, /bg-ice/);
  assert.doesNotMatch(off, /\bdisabled=""/, "stays focusable so a tooltip can say why");
});

test("tip Button wears the dotted Ice ring", () => {
  assert.match(html(<Button variant="tip">Next video</Button>), /border-dotted border-ice/);
});

test("SplitButton: glow only when asked; disabled dims Clip but the destination arrow stays usable (C-10)", () => {
  const props = { label: "Clip", onPress() {}, onOpenMenu() {}, menuIcon: glyph };
  assert.doesNotMatch(html(<SplitButton {...props} />), /shadow-cut/);
  assert.match(html(<SplitButton {...props} glowing />), /shadow-cut/);
  const off = html(<SplitButton {...props} glowing disabled />);
  assert.equal(off.match(/aria-disabled="true"/g)?.length, 1, "only the Clip half is disabled");
  assert.match(off, /<button[^>]*aria-label="Where clips go"(?![^>]*aria-disabled)/);
  assert.doesNotMatch(off.slice(off.indexOf("aria-haspopup")), /aria-disabled/);
  assert.doesNotMatch(off, /shadow-cut/);
  assert.match(off, /aria-label="Where clips go"/);
});

test("IconButton is named, 44px, and shows pressed as an Ice glyph", () => {
  const h = html(<IconButton label="Clip tool" icon={glyph} pressed />);
  assert.match(h, /aria-label="Clip tool"/);
  assert.match(h, /size-target/);
  assert.match(h, /aria-pressed="true"/);
  assert.match(h, /text-ice/);
  assert.doesNotMatch(html(<IconButton label="Pointer" icon={glyph} pressed={false} />), /text-ice/);
});

test("Chip open state is the Ice border and ring", () => {
  assert.match(html(<Chip open>Acme</Chip>), /border-ice ring-\[3px\] ring-ice-tint-18/);
  assert.match(html(<Chip size="sm">Original + ES</Chip>), /h-row/);
});

test("Menu items: radio items carry aria-checked, plain ones do not", () => {
  const h = html(
    <Menu label="Campaigns">
      <MenuItem checked leading={glyph}>Acme</MenuItem>
      <MenuItem checked={false}>Nova</MenuItem>
      <MenuItem>New campaign</MenuItem>
    </Menu>,
  );
  assert.match(h, /role="menuitemradio" aria-checked="true"/);
  assert.match(h, /role="menuitemradio" aria-checked="false"/);
  assert.match(h, /role="menuitem"[^>]*>(?:(?!aria-checked).)*New campaign/);
});

test("Tooltip shows the action then its key", () => {
  const h = html(<Tooltip keyHint="L">Forward 5 s</Tooltip>);
  assert.ok(h.indexOf("Forward 5 s") < h.indexOf(">L<"));
  assert.match(h, /role="tooltip"/);
});

test("Toggle reports state as a switch", () => {
  assert.match(html(<Toggle label="Tips" checked onChange={() => {}} />), /role="switch" aria-checked="true"/);
  assert.match(html(<Toggle label="Tips" checked={false} onChange={() => {}} />), /aria-checked="false"/);
});

test("SearchPill offers a clear button only once there is text", () => {
  const p = { label: "Videos search", onChange() {}, icon: glyph, clearIcon: glyph };
  assert.doesNotMatch(html(<SearchPill {...p} value="" />), /Clear videos search/);
  assert.match(html(<SearchPill {...p} value="story" />), /aria-label="Clear videos search"/);
});

test("DrawerHeader: back appears on the second view; close always names Settings", () => {
  const top = html(<DrawerHeader title="Settings" onClose={() => {}} closeIcon={glyph} />);
  assert.doesNotMatch(top, /Back to/);
  const second = html(
    <DrawerHeader title="Acme" closeName="Settings" onClose={() => {}} closeIcon={glyph} back={{ label: "Campaigns", onBack() {}, icon: glyph }} />,
  );
  assert.match(second, /aria-label="Back to Campaigns"/);
  assert.match(second, /aria-label="Close Settings"/);
  assert.match(html(<Drawer label="Settings">x</Drawer>), /w-\[440px\]/);
});

test("Row states: open glows Ice, made glows Frost, dimmed fades, idle is flat", () => {
  assert.match(html(<Row state="open" />), /border-ice shadow-open/);
  assert.match(html(<Row state="made" />), /border-frost-tint-45 shadow-made/);
  assert.match(html(<Row state="dimmed" />), /opacity-55/);
  assert.doesNotMatch(html(<Row />), /shadow-/);
});

test("StatusDot differs by shape, not colour alone", () => {
  assert.match(html(<StatusDot kind="saved" />), /bg-fg/);
  assert.match(html(<StatusDot kind="cutting" />), /border-\[1\.5px\] border-ice/);
  assert.match(html(<StatusDot kind="queued" />), /border border-fg-dim/);
});

test("UndoRing drains with the seconds left", () => {
  const offset = (s: number) => Number(html(<UndoRing secondsLeft={s} onUndo={() => {}} icon={glyph} />).match(/stroke-dashoffset="([\d.]+)"/)![1]);
  assert.equal(offset(8), 0);
  assert.ok(offset(4) > 0 && offset(4) < offset(1));
  assert.ok(Math.abs(offset(0) - 2 * Math.PI * 13) < 0.01);
  assert.match(html(<UndoRing secondsLeft={4.2} onUndo={() => {}} icon={glyph} />), /aria-label="Undo, 5 seconds left"/);
});

test("BrandMark is the two-blade mark in Frost over Ice; the lockup adds the name", () => {
  const h = html(<BrandMark />);
  assert.equal(h.match(/<path/g)?.length, 2);
  assert.ok(h.indexOf("var(--frost)") < h.indexOf("var(--ice)"));
  assert.doesNotMatch(h, /drop-shadow/);
  assert.match(html(<BrandMark glow />), /drop-shadow\(var\(--glow-mark\)\)/);
  assert.match(html(<BrandLockup />), />Clipr</);
});

test("no shared component holds a raw hex or rgba value", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const mine = ["Button", "SplitButton", "IconButton", "Chip", "Menu", "Tooltip", "Toggle", "SearchPill", "Drawer", "Row", "UndoRing", "BrandMark"];
  for (const name of mine) {
    const file = readdirSync(dir).find((f) => f === `${name}.tsx`)!;
    const src = readFileSync(join(dir, file), "utf8").replace(/\bd="[^"]*"/g, "").replace(/const (UPPER|LOWER) = "[^"]*"/g, "");
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, `${name} has a raw colour`);
  }
});
