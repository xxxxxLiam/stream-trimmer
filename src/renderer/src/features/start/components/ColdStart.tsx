/**
 * File: ColdStart.tsx
 * Path: src/renderer/src/features/start/components/ColdStart.tsx
 * Description: The cold start screen (Start.dc.html, approved): logo and name, the promise, the one
 *   link box, the No ads / No account chips and the folder chip. One job: get a link in. Logic-free;
 *   useStartController feeds it. States: empty, link already copied, checking tools, tool cannot be fixed.
 */
import { BrandLockup } from "../../../shared/components/BrandMark";
import type { ToolsStatus } from "../utils/startUtils";

export type ColdStartProps = {
  pasteKey: string;
  value: string;
  onChange: (v: string) => void;
  onPasteButton: () => void;
  /** A YouTube link found on the clipboard, shown as a one-click offer. Never opened by itself. */
  offer: { text: string; short: string } | null;
  onUseOffer: () => void;
  toolsStatus: ToolsStatus;
  onRetryTools: () => void;
  /** Sentence under the box when the pasted link is not a video. */
  problem: string;
  folderLabel: string;
  onOpenFolder: () => void;
};

const Tick = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-ice" aria-hidden="true">
    <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
  </svg>
);

const pill =
  "inline-flex h-target items-center gap-[8px] rounded-[22px] border border-hairline bg-raised px-[16px] text-meta text-fg";

function Notice({ text, action, onAction }: { text: string; action: string; onAction: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-[12px] rounded-control border border-error bg-raised py-[8px] pl-[16px] pr-[8px]">
      <span className="flex-1 text-body">{text}</span>
      <button type="button" onClick={onAction} className="h-target rounded-control border border-hairlineStrong bg-raised px-[16px] text-body text-fg hover:bg-hover">
        {action}
      </button>
    </div>
  );
}

export default function ColdStart(p: ColdStartProps) {
  const checking = p.toolsStatus === "checking";
  const broken = p.toolsStatus === "broken";
  const waiting = !checking && !broken && !p.offer;
  return (
    <main
      id="ui-cold-start"
      className="flex min-h-[0px] flex-1 flex-col items-center gap-[56px] overflow-y-auto bg-bg bg-no-repeat pt-[clamp(48px,33.4vh,300px)]"
      style={{ backgroundImage: "var(--glow-spotlight)", backgroundSize: "640px 420px", backgroundPosition: "50% 36%" }}
    >
      <div className="flex w-[680px] max-w-full flex-col items-center gap-[32px]">
        <BrandLockup size={56} glow />
        <h1 className="m-[0px] text-center text-[36px] font-medium leading-[1.1] tracking-[-0.02em]">Only the seconds you need</h1>
        <div className="mt-[16px] flex w-full flex-col gap-[48px]">
          <div className="flex flex-col gap-[8px]">
            {p.offer ? (
              <div className="flex items-center gap-[12px] rounded-control border border-ice-tint-50 bg-raised py-[8px] pl-[16px] pr-[8px]">
                <span className="min-w-[0px] flex-1 truncate text-body">
                  Use the link you copied? <span className="text-fg-dim">{p.offer.short}</span>
                </span>
                <button type="button" onClick={p.onUseOffer} className="inline-flex h-target items-center gap-[8px] whitespace-nowrap rounded-control bg-ice px-[16px] text-body font-medium text-bg">
                  Use it
                  <kbd className="rounded-chip border border-hairlineStrong bg-bg px-[8px] py-[3px] font-sans text-meta text-fg-dim">{p.pasteKey}</kbd>
                </button>
              </div>
            ) : (
              <div
                className={`flex h-[64px] items-center gap-[12px] rounded-control border bg-raised pl-[20px] pr-[12px] ${
                  waiting ? "border-ice-tint-50 shadow-box" : "border-hairlineStrong"
                }`}
              >
                <span aria-hidden="true" className={`h-[22px] w-[2px] rounded-[1px] bg-ice ${checking ? "opacity-0" : ""}`} />
                <label className="sr-only" htmlFor="ui-cold-start-link">Video link</label>
                <input
                  id="ui-cold-start-link"
                  type="text"
                  inputMode="url"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  value={p.value}
                  onChange={(e) => p.onChange(e.target.value)}
                  placeholder="Paste a YouTube link"
                  className="min-w-[0px] flex-1 bg-transparent text-[15px] text-fg outline-none"
                />
                <button type="button" onClick={p.onPasteButton} className="inline-flex h-[40px] items-center gap-[8px] rounded-control bg-ice px-[14px] text-body font-medium text-bg">
                  Paste
                  <span className="text-meta opacity-70">{p.pasteKey}</span>
                </button>
              </div>
            )}
            {checking && <div className="text-meta text-fg-dim">Updating download tools, about 20 s. Your link will open when they are ready.</div>}
            {broken && <Notice text="The download tools could not start. Try again." action="Try again" onAction={p.onRetryTools} />}
            {p.problem && !broken && <div role="alert" className="rounded-control border border-error bg-raised px-[16px] py-[12px] text-body">{p.problem}</div>}
          </div>
          <div className="flex items-center gap-[8px]">
            <span className={pill}><Tick />No ads</span>
            <span className={pill}><Tick />No account</span>
            <button
              type="button"
              onClick={p.onOpenFolder}
              className="ml-auto inline-flex h-target items-center gap-[8px] rounded-control border border-hairlineStrong bg-raised px-[16px] text-meta text-fg hover:bg-hover"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M2 6V3.5h4L7.5 5H14v7.5H2z" />
              </svg>
              {p.folderLabel}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
