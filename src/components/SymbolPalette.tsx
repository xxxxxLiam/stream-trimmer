/**
 * File: SymbolPalette.tsx
 * Path: src/components/SymbolPalette.tsx
 * Description: Searchable click-to-copy symbols palette overlay (opened with
 *   Cmd+; by the shell). Data lives in src/lib/symbols.ts. Owns its own Escape.
 * Contract: self-positioned (fixed) panel at z-20, under the header (z-30) and moved left of the
 *   help drawer when that is open (same as CopyBlocks), null when closed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SYMBOL_GROUPS, allEntries, matchesQuery, type SymbolEntry } from "../lib/symbols";
import { writeClipboard } from "../lib/handoff";

import CentredDialog from "./shell/CentredDialog";

export type SymbolPaletteProps = { open: boolean; onClose: () => void };

const RECENT_KEY = "tb.symbols.recent";
const TOP_KEY = "tb.symbols.keepOnTop";
const RECENT_MAX = 8;
const CONFIRM_MS = 1200;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}
function readTop(): boolean {
  try {
    return localStorage.getItem(TOP_KEY) === "1";
  } catch {
    return false;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage is a convenience only
  }
}

// Combining signs (U+0610..0613) are invisible alone; seat them on a dotted circle.
const display = (e: SymbolEntry) => (/^\p{Mn}$/u.test(e.text) ? `\u25CC${e.text}` : e.text);

interface Slot {
  key: string;
  entry: SymbolEntry;
}

export default function SymbolPalette({ open, onClose }: SymbolPaletteProps) {
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(readRecent);
  const [keepOnTop, setKeepOnTop] = useState(readTop);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);

  const byId = useMemo(() => new Map(allEntries().map((e) => [e.id, e])), []);

  const sections = useMemo(() => {
    const out: { id: string; label: string; slots: Slot[] }[] = [];
    const q = query.trim();
    if (!q) {
      const r: SymbolEntry[] = [];
      for (const id of recent) {
        const e = byId.get(id);
        if (e) r.push(e);
      }
      if (r.length) out.push({ id: "recent", label: "Recent", slots: r.map((e) => ({ key: `recent:${e.id}`, entry: e })) });
    }
    for (const g of SYMBOL_GROUPS) {
      const slots = g.entries.filter((e) => matchesQuery(e, q)).map((e) => ({ key: `${g.id}:${e.id}`, entry: e }));
      if (slots.length) out.push({ id: g.id, label: g.label, slots });
    }
    return out;
  }, [query, recent, byId]);

  const flat = useMemo(() => sections.flatMap((s) => s.slots), [sections]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setError(null);
      setRecent(readRecent());
      setKeepOnTop(readTop());
      requestAnimationFrame(() => searchRef.current?.focus());
    }
    return () => window.clearTimeout(timer.current);
  }, [open]);

  // Esc and the outside click belong to CentredDialog; Keep on top turns the dialog
  // non-modal there, which is what lets a click reach the transcript behind it.

  const copy = useCallback(async (slot: Slot) => {
    const res = await writeClipboard(slot.entry.text);
    if (!res.ok) {
      setError(res.error);
      setCopiedKey(null);
      return;
    }
    setError(null);
    setCopiedKey(slot.key);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopiedKey(null), CONFIRM_MS);
    setRecent((prev) => {
      const next = [slot.entry.id, ...prev.filter((id) => id !== slot.entry.id)].slice(0, RECENT_MAX);
      save(RECENT_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const chipEls = () =>
    Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>("button[data-chip]") ?? []);

  const focusChip = (i: number) => chipEls()[i]?.focus();

  // Arrow keys move through the grid by geometry; Enter copies.
  const onChipKey = (e: React.KeyboardEvent, i: number) => {
    const chips = chipEls();
    let next = -1;
    if (e.key === "ArrowRight") next = Math.min(chips.length - 1, i + 1);
    else if (e.key === "ArrowLeft") next = i - 1;
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const cur = chips[i].getBoundingClientRect();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      let best = -1;
      let bestScore = Infinity;
      chips.forEach((c, j) => {
        const r = c.getBoundingClientRect();
        const dy = (r.top - cur.top) * dir;
        if (dy < 4) return;
        const score = dy * 1000 + Math.abs(r.left - cur.left);
        if (score < bestScore) {
          bestScore = score;
          best = j;
        }
      });
      next = best;
    } else return;
    e.preventDefault();
    if (next < 0) searchRef.current?.focus();
    else focusChip(next);
  };

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusChip(0);
    } else if (e.key === "Enter" && flat[0]) {
      e.preventDefault();
      void copy(flat[0]);
    }
  };

  const toggleTop = () => {
    setKeepOnTop((v) => {
      save(TOP_KEY, v ? "0" : "1");
      return !v;
    });
  };

  let idx = -1;
  return (
    <CentredDialog
      open={open}
      onClose={onClose}
      title="Symbols"
      widthClass="max-w-[820px]"
      modal={!keepOnTop}
      aside={
        <div className="flex justify-end">
          <button
            type="button"
            className="link-quiet"
            aria-pressed={keepOnTop}
            onClick={toggleTop}
            title="Stay open while you click elsewhere"
          >
            Keep on top
          </button>
        </div>
      }
    >
      <div ref={panelRef} className="flex min-h-0 flex-col gap-3">
      <input
        ref={searchRef}
        className="field"
        type="search"
        placeholder="Search by name, alias or glyph"
        aria-label="Search symbols"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onSearchKey}
      />

      {error && (
        <div role="alert" className="card-alert px-3 py-2 text-body">
          {error}
        </div>
      )}

      <div id="ui-symbol-list" className="flex min-h-0 flex-col gap-4 overflow-y-auto" onKeyDown={undefined}>
        {sections.length === 0 && <p className="t-meta">Nothing matches "{query}".</p>}
        {sections.map((s) => (
          <section key={s.id} aria-label={s.label} className="flex flex-col gap-2">
            <h3 className="t-meta">{s.label}</h3>
            <div className="flex flex-wrap gap-2">
              {s.slots.map((slot) => {
                idx += 1;
                const i = idx;
                const e = slot.entry;
                const copied = copiedKey === slot.key;
                const glyphOnly = e.arabic || [...e.text].length === 1;
                return (
                  <button
                    key={slot.key}
                    type="button"
                    data-chip
                    title={e.name}
                    aria-label={copied ? `Copied ${e.name}` : `Copy ${e.name}`}
                    onClick={() => void copy(slot)}
                    onKeyDown={(ev) => onChipKey(ev, i)}
                    className={`chip relative min-w-[64px] justify-center ${glyphOnly ? "h-8 !text-section" : "h-row"}`}
                    style={copied ? { borderColor: "var(--accent)" } : undefined}
                  >
                    <span
                      className={e.arabic ? "arabic-glyph" : undefined}
                      style={{
                        visibility: copied ? "hidden" : "visible",
                        unicodeBidi: e.arabic ? "isolate" : undefined,
                        lineHeight: 1.2,
                      }}
                    >
                      {display(e)}
                    </span>
                    {copied && (
                      <span className="absolute inset-0 flex items-center justify-center text-meta text-fg" aria-hidden="true">
                        Copied
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <p className="t-meta">Arrow keys move, Enter copies, Esc closes.</p>
      </div>
    </CentredDialog>
  );
}
