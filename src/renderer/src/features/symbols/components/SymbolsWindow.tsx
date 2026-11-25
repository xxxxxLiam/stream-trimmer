/**
 * File: SymbolsWindow.tsx
 * Path: src/renderer/src/features/symbols/components/SymbolsWindow.tsx
 * Description: The content of the small always-on-top Symbols and phrases window (about 396px,
 *   opened from the Transcript Copy menu). Tabs Symbols, Honorifics and Phrases; click an entry
 *   to copy it, and it reads "Copied" for 2 s. The window has no title bar, so the header is
 *   its drag area. Esc and the close button at the right of the header close it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { SYMBOL_GROUPS, matchesQuery, type SymbolEntry, type SymbolGroupId } from "../../handoff/utils/symbols";
import { writeClipboard } from "../../../shared/utils/handoff";
import { IconClose, IconSearch } from "../../../shared/components/PanelIcons";

const COPIED_MS = 2000;

const TABS: { id: string; label: string; groups: SymbolGroupId[] }[] = [
  { id: "symbols", label: "Symbols", groups: ["symbols", "marks"] },
  { id: "honorifics", label: "Honorifics", groups: ["honorifics"] },
  { id: "phrases", label: "Phrases", groups: ["phrases"] },
];

// Combining signs are invisible alone; seat them on a dotted circle.
const display = (e: SymbolEntry) => (/^\p{Mn}$/u.test(e.text) ? `◌${e.text}` : e.text);

export default function SymbolsWindow() {
  const [tab, setTab] = useState(TABS[0].id);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Esc closes the window from here too, so it works wherever focus sits (main also catches it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") window.close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const entries = useMemo(() => {
    const groups = TABS.find((t) => t.id === tab)!.groups;
    return SYMBOL_GROUPS.filter((g) => groups.includes(g.id))
      .flatMap((g) => g.entries)
      .filter((e) => matchesQuery(e, query.trim()));
  }, [tab, query]);

  const copy = async (e: SymbolEntry) => {
    const res = await writeClipboard(e.text);
    if (!res.ok) {
      setError(res.error);
      setCopied(null);
      return;
    }
    setError(null);
    setCopied(e.id);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), COPIED_MS);
  };

  const phrases = tab === "phrases" || tab === "honorifics";

  return (
    <div className="flex h-screen w-screen flex-col bg-bg text-fg">
      <div
        className="flex h-target flex-none items-center gap-[18px] border-b border-hairline px-[14px]"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div role="tablist" className="flex gap-[18px]" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={
                "inline-flex h-target items-center text-body " +
                (tab === t.id ? "text-fg shadow-[inset_0_-2px_0_var(--ice)]" : "text-fg-dim hover:text-fg")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Close"
          title="Close (Esc)"
          onClick={() => window.close()}
          className="ml-auto inline-flex h-[32px] w-[32px] items-center justify-center rounded-control text-fg-dim hover:text-fg"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <IconClose />
        </button>
      </div>

      <label className="mx-[10px] mb-[6px] mt-[10px] flex h-target flex-none items-center gap-[8px] rounded-[22px] bg-raised px-[14px] text-fg-dim">
        <span className="sr-only">Search</span>
        <IconSearch />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          autoComplete="off"
          spellCheck={false}
          className="min-w-[0px] flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-dim"
        />
      </label>

      {error && <p className="m-[0px] px-[14px] pb-[4px] text-meta text-error">{error}</p>}

      <div
        id="ui-symbol-list"
        tabIndex={0}
        aria-label="Entries"
        className={
          "min-h-[0px] flex-1 overflow-y-auto px-[10px] pb-[10px] outline-none " +
          (phrases ? "flex flex-col gap-[6px]" : "grid grid-cols-6 content-start gap-[6px]")
        }
      >
        {entries.map((e) => (
          <button
            key={e.id}
            type="button"
            title={e.name}
            onClick={() => void copy(e)}
            className={
              "min-h-target rounded-control bg-raised text-body text-fg hover:bg-hover " +
              (phrases ? "px-[10px] py-[8px] text-left" : "px-[4px]") +
              (e.arabic ? " font-arabic" : "")
            }
          >
            {copied === e.id ? <span className="text-meta text-ice">Copied</span> : display(e)}
            {phrases && copied !== e.id && <span className="block text-meta text-fg-dim">{e.name}</span>}
          </button>
        ))}
        {entries.length === 0 && <p className="m-[0px] px-[4px] py-[8px] text-meta text-fg-dim">Nothing matches.</p>}
      </div>
    </div>
  );
}
