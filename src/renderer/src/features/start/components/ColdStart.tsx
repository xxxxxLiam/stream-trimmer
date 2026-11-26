/**
 * File: ColdStart.tsx
 * Path: src/renderer/src/features/start/components/ColdStart.tsx
 * Description: The cold start screen (Start.dc.html, approved): logo and name, the promise, the one
 *   link box, the No ads / No account chips and the folder chip. One job: get a link in. Logic-free;
 *   useStartController feeds it. States: empty, link already copied, checking tools, tool cannot be fixed.
 */
import { Check2, Folder } from "react-bootstrap-icons";
import { BrandLockup } from "../../../shared/components/BrandMark";
import PreparingLine from "../../player/components/PreparingLine";
import type { ToolsStatus } from "../utils/startUtils";

export type ColdStartProps = {
  pasteKey: string;
  value: string;
  onChange: (v: string) => void;
  onPasteButton: () => void;
  /** The box got a paste or Enter: text that is not a video link then gets its sentence. */
  onPasteText: () => void;
  onSubmit: () => void;
  /** A YouTube link found on the clipboard, shown as a one-click offer. Never opened by itself. */
  offer: { text: string; short: string } | null;
  onUseOffer: () => void;
  toolsStatus: ToolsStatus;
  onRetryTools: () => void;
  /** Sentence under the box when the link would not open. */
  problem: string;
  /** Opens the same link again (the Try again beside the sentence). */
  onRetryOpen: () => void;
  /** The link is being read: the box says "Opening…" with the Preparing line. */
  opening: boolean;
  /** Return to a video that is already open, when there is one. */
  backTo: { label: string; onBack: () => void } | null;
  folderLabel: string;
  onOpenFolder: () => void;
  /** Said under the chips when Open finds the folder not made yet. */
  folderNote?: string;
};

const NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")";

const Tick = () => (
  <Check2 width={12} height={12} className="text-ice" aria-hidden="true" focusable="false" />
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
  // The box is ready for a link from the first frame, glow included, while the tools update: the link opens when they are.
  const waiting = !broken && !p.offer;
  return (
    <main
      id="ui-cold-start"
      className="relative flex min-h-[0px] flex-1 flex-col items-center gap-[56px] overflow-y-auto bg-bg bg-no-repeat pt-[clamp(48px,33.4vh,300px)]"
      style={{ backgroundImage: "var(--glow-spotlight)", backgroundSize: "1100px 760px", backgroundPosition: "50% 36%" }}
    >
      {/* 5% fractal noise over the window so the long fades never band. */}
      <span aria-hidden="true" className="pointer-events-none fixed inset-[0px] mix-blend-overlay" style={{ opacity: 0.05, backgroundImage: NOISE }} />
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
                className={`relative flex h-[64px] items-center gap-[12px] rounded-control border bg-raised pl-[20px] pr-[12px] ${
                  waiting ? "border-ice-tint-50 shadow-box" : "border-hairlineStrong"
                }`}
              >
                <span aria-hidden="true" className="h-[22px] w-[2px] rounded-[1px] bg-ice" />
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
                  onPaste={p.onPasteText}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      p.onSubmit();
                    }
                  }}
                  placeholder="Paste a YouTube link"
                  className="min-w-[0px] flex-1 bg-transparent text-[15px] text-fg outline-none"
                />
                <button type="button" onClick={p.onPasteButton} className="inline-flex h-[40px] items-center gap-[8px] rounded-control bg-ice px-[14px] text-body font-medium text-bg">
                  Paste
                  <span className="text-meta font-normal text-bg">{p.pasteKey}</span>
                </button>
                {p.opening && <PreparingLine />}
              </div>
            )}
            {p.opening && <div role="status" className="text-meta text-fg-dim">Opening…</div>}
            {checking && <div className="text-meta text-fg-dim">Updating download tools, about 20 s. Your link will open when they are ready.</div>}
            {broken && <Notice text="The download tools could not start. Try again." action="Try again" onAction={p.onRetryTools} />}
            {p.problem && !broken && !p.opening && <Notice text={p.problem} action="Try again" onAction={p.onRetryOpen} />}
            {p.backTo && !p.opening && (
              <button type="button" onClick={p.backTo.onBack} className="self-start text-meta text-fg-dim underline hover:text-fg">
                Back to {p.backTo.label}
              </button>
            )}
          </div>
          <div className="flex items-center gap-[8px]">
            <span className={pill}><Tick />No ads</span>
            <span className={pill}><Tick />No account</span>
            <button
              type="button"
              onClick={p.onOpenFolder}
              className="ml-auto inline-flex h-target items-center gap-[8px] rounded-control border border-hairlineStrong bg-raised px-[16px] text-meta text-fg hover:bg-hover"
            >
              <Folder width={14} height={14} aria-hidden="true" focusable="false" />
              {p.folderLabel}
            </button>
          </div>
          {p.folderNote ? <p role="status" className="m-[0px] text-right text-meta text-fg-dim">{p.folderNote}</p> : null}
        </div>
      </div>
    </main>
  );
}
