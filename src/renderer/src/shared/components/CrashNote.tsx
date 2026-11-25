/**
 * File: CrashNote.tsx
 * Path: src/renderer/src/shared/components/CrashNote.tsx
 * Description: The status block at the top of Export after the window closed unexpectedly (board 03.6.3):
 *   one line, then Send report (Ice outline) and Copy details. Pressing Send report is the consent. Logic-free.
 */
import { PILL_HIT, PRIMARY_PILL, QUIET_PILL } from "../../features/clips/utils/pillClasses";

export type CrashNoteProps = {
  text: string;
  state: "idle" | "sent" | "kept";
  copied: boolean;
  onSend: () => void;
  onCopy: () => void;
  onDismiss: () => void;
};

export default function CrashNote({ text, state, copied, onSend, onCopy, onDismiss }: CrashNoteProps) {
  return (
    <div role="status" data-testid="crash-note" className="mx-[10px] mt-[10px] rounded-control border border-hairlineStrong relative bg-raised px-[10px] pb-[2px] pt-[9px]">
      <button type="button" aria-label="Dismiss" data-testid="crash-note-dismiss" className="absolute right-[2px] top-[2px] flex h-[44px] w-[44px] items-center justify-center rounded-control text-fg-dim hover:bg-hover" onClick={onDismiss}>
        ✕
      </button>
      <div className="pr-[40px] text-meta leading-[1.45] text-fg">{state === "idle" ? text : state === "sent" ? `${text} Report sent. Thank you.` : `${text} Saved. Clipr will send the report when it can.`}</div>
      <div className="flex gap-[6px]">
        {state === "idle" && (
          <button type="button" aria-label="Send report: files the crash details" className={PILL_HIT} onClick={onSend}>
            <span className={PRIMARY_PILL}>Send report</span>
          </button>
        )}
        <button type="button" aria-label="Copy crash details" className={PILL_HIT} onClick={onCopy}>
          <span className={QUIET_PILL}>{copied ? "Copied" : "Copy details"}</span>
        </button>
      </div>
    </div>
  );
}
