/**
 * File: HelpTop.tsx
 * Path: src/renderer/src/features/help/components/HelpTop.tsx
 * Description: Help, first view (Help.dc.html 1): search, Common questions, then More (Replay tips,
 *   Keyboard shortcuts, Report a problem, About). Focus starts in the search field; arrows move
 *   through the list, Enter opens one. No match says so and offers Report a problem.
 */
import { useRef, type KeyboardEvent } from "react";
import { DrawerHeader, ChevronRow, SectionLabel, drawerBody } from "../../../shared/components/DrawerRows";
import type { HelpResults } from "../utils/helpSearch";
import { HELP_MORE, type HelpMoreId } from "../utils/helpContent";

export type HelpTopProps = {
  query: string;
  onQuery: (q: string) => void;
  results: HelpResults;
  version: string;
  tipsOn: boolean;
  onOpenAnswer: (id: string) => void;
  onOpenMore: (id: HelpMoreId) => void;
  onReplayTips: () => void;
  onClose: () => void;
};

const MORE_LABEL: Record<HelpMoreId, (p: HelpTopProps) => string> = {
  "replay-tips": () => "Replay tips",
  shortcuts: () => "Keyboard shortcuts",
  report: () => "Report a problem",
  about: (p) => (p.version ? `About Clipr ${p.version}` : "About Clipr"),
};

export default function HelpTop(p: HelpTopProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const hasAny = p.results.answers.length + p.results.more.length > 0;

  // Arrows move between the search field and every row; Enter on a row activates it natively.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-help-item]") ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? at + 1 : at - 1;
    if (next >= 0 && next < items.length) {
      e.preventDefault();
      items[next].focus();
    } else if (next < 0) {
      e.preventDefault();
      listRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    }
  };

  return (
    <>
      <DrawerHeader title="Help" closeName="Help" onClose={p.onClose} />
      <div ref={listRef} onKeyDown={onKeyDown} className={drawerBody}>
        <div className="relative mb-[8px] mt-[4px]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true" className="absolute left-[14px] top-[14px] text-fg-dim">
            <circle cx="11" cy="11" r="6" />
            <path d="M16 16l4 4" />
          </svg>
          <label htmlFor="help-q" className="sr-only">Search Help</label>
          <input
            id="help-q"
            type="search"
            autoFocus
            autoComplete="off"
            value={p.query}
            placeholder="What do you need help with?"
            onChange={(e) => p.onQuery(e.target.value)}
            data-help-item
            className="box-border h-target w-full rounded-[22px] border border-hairlineStrong bg-raised pl-[40px] pr-[16px] text-body leading-[normal] text-fg outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-frost"
          />
        </div>
        {!hasAny && (
          <div role="status" className="flex flex-col items-start gap-[4px] py-[8px]">
            <span className="text-body leading-[normal]">No answer for that yet</span>
            <button type="button" data-help-item onClick={() => p.onOpenMore("report")} className="h-target text-meta text-ice underline underline-offset-[3px]">
              Report a problem
            </button>
          </div>
        )}
        {p.results.answers.length > 0 && <SectionLabel first>Common questions</SectionLabel>}
        {p.results.answers.map((a) => (
          <button
            key={a.id}
            type="button"
            data-help-item
            aria-label={a.question}
            onClick={() => p.onOpenAnswer(a.id)}
            className="-mx-[8px] flex h-target items-center gap-[8px] rounded-control bg-transparent px-[8px] text-left text-body leading-[normal] text-fg hover:bg-hover"
          >
            <span className="flex-1">{a.question}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-fg-dim">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        ))}
        {p.results.more.length > 0 && <SectionLabel>More</SectionLabel>}
        {HELP_MORE.filter((m) => p.results.more.includes(m.id)).map((m) =>
          m.id === "replay-tips" ? (
            <div key={m.id} className="flex min-h-target items-center gap-[8px] border-b border-hairline">
              <div className="flex flex-1 flex-col gap-[2px]">
                <span className="text-body leading-[normal]">Replay tips</span>
                <span className="text-meta text-fg-dim">{p.tipsOn ? "Show tips on" : "Show tips off"}</span>
              </div>
              <button type="button" data-help-item aria-label="Replay tips for this panel" onClick={p.onReplayTips} className="h-target bg-transparent px-[4px] text-meta text-ice">
                Replay
              </button>
            </div>
          ) : m.id === "about" ? (
            <button key={m.id} type="button" data-help-item aria-label={MORE_LABEL[m.id](p)} onClick={() => p.onOpenMore(m.id)} className="flex h-target items-center bg-transparent text-left text-body leading-[normal] text-fg">
              {MORE_LABEL[m.id](p)}
            </button>
          ) : (
            <ChevronRow key={m.id} label={MORE_LABEL[m.id](p)} value="" onOpen={() => p.onOpenMore(m.id)} divider listItem />
          ),
        )}
      </div>
    </>
  );
}
