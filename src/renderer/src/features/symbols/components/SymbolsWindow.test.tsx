import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SymbolsWindow from "./SymbolsWindow";
import { SYMBOL_GROUPS } from "../../handoff/utils/symbols";

test("the Symbols window has three tabs and opens on Symbols with its glyphs", () => {
  const html = renderToStaticMarkup(createElement(SymbolsWindow));
  for (const t of ["Symbols", "Honorifics", "Phrases"]) assert.ok(html.includes(`>${t}<`), `tab ${t}`);
  assert.ok(html.includes('aria-selected="true"') && html.indexOf('aria-selected="true"') < html.indexOf(">Honorifics<"));
  const first = SYMBOL_GROUPS.find((g) => g.id === "symbols")!.entries[0];
  assert.ok(html.includes(`title="${first.name}"`));
  const phrase = SYMBOL_GROUPS.find((g) => g.id === "phrases")!.entries[0];
  assert.ok(!html.includes(`title="${phrase.name}"`), "phrases are on their own tab");
});
