/**
 * File: dumpLayout.cjs
 * Path: scripts/parity/dumpLayout.cjs
 * Description: Element-by-element layout dump for parity. Runs in the page (board or app) and lists every
 *   visible element that has its own text or a visible fill or border, with its box relative to the frame
 *   and the styles that matter, so a board and the app can be compared by element instead of by pixels.
 */
/** Source of the in-page function; pass (rootSelectorOrNull, ox, oy). */
const DUMP_SRC = `(ox, oy, rootEl) => {
  const root = rootEl || document.body;
  const out = [];
  const vis = (cs, r) => cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  const a = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return 0; const p = m[1].split(',').map(Number); return p.length > 3 ? p[3] : 1; };
  for (const e of root.querySelectorAll('*')) {
    if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue;
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    if (!vis(cs, r)) continue;
    const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('').replace(/\\s+/g, ' ').trim();
    const bg = a(cs.backgroundColor) > 0 ? cs.backgroundColor : '';
    const bw = parseFloat(cs.borderTopWidth) || 0;
    const border = bw > 0 && a(cs.borderTopColor) > 0 ? bw + 'px ' + cs.borderTopColor : '';
    const isSvg = e.tagName.toLowerCase() === 'svg';
    if (!own && !bg && !border && !isSvg) continue;
    out.push({
      tag: e.tagName.toLowerCase(), text: own, label: e.getAttribute('aria-label') || '',
      x: Math.round((r.x - ox) * 10) / 10, y: Math.round((r.y - oy) * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
      fs: cs.fontSize, fw: cs.fontWeight, color: own ? cs.color : '', bg, border, radius: cs.borderTopLeftRadius === '0px' ? '' : cs.borderTopLeftRadius,
      shadow: cs.boxShadow === 'none' ? '' : cs.boxShadow,
    });
  }
  return out;
}`;
module.exports = { DUMP_SRC };
