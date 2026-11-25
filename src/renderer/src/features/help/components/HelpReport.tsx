/**
 * File: HelpReport.tsx
 * Path: src/renderer/src/features/help/components/HelpReport.tsx
 * Description: Help > Report a problem (Help.dc.html 3 and 4): a note box, the privacy line, Send
 *   report and Copy details. After Send works the page itself turns into "Sent. Thank you." with what went,
 *   Back to Help and Copy details (no reference number, no promise of a reply). After Send, when the report service is down, "Saved. Clipr will send it
 *   when it can." and Copy details still works.
 */
import { DrawerHeader, drawerBodyRoomy, outlineButton } from "../../../shared/components/DrawerRows";
import { MAX_NOTE } from "../utils/reports";
import type { ReportState } from "../hooks/useReportMutations";

export type HelpReportProps = {
  note: string;
  onNote: (v: string) => void;
  state: ReportState;
  copied: boolean;
  onSend: () => void;
  onCopy: () => void;
  onBack: () => void;
  onClose: () => void;
};

export default function HelpReport(p: HelpReportProps) {
  const kept = p.state === "kept";
  const sent = p.state === "sent";
  return (
    <>
      <DrawerHeader title="Report a problem" back="Help" onBack={p.onBack} closeName="Help" onClose={p.onClose} />
      <div className={drawerBodyRoomy}>
        {kept || sent ? (
          <>
            <div role="status" className="flex items-center gap-[8px] box-content min-h-[44px] rounded-control border border-hairlineStrong bg-raised px-[12px] text-body">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-frost">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              <span className="leading-[20px]">{sent ? "Sent. Thank you." : "Saved. Clipr will send it when it can."}</span>
            </div>
            {kept && <p className="m-[0px] text-meta text-fg-dim">The report is kept on this computer and sent on a later launch. Copy details still works if you want to pass it on yourself.</p>}
            {sent && <p className="m-[0px] text-meta text-fg-dim">It went with the error, the version numbers and a cleaned log. There&apos;s nothing else to do.</p>}
            <div className="flex gap-[8px]">
              {sent && <button type="button" aria-label="Back to Help questions" onClick={p.onBack} className={outlineButton}>Back to Help</button>}
              <button type="button" aria-label="Copy details" onClick={p.onCopy} className={outlineButton}>{p.copied ? "Copied" : "Copy details"}</button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="report-note" className="text-body leading-[20px]">What happened? A line or two is enough.</label>
            <textarea
              id="report-note"
              rows={3}
              value={p.note}
              maxLength={MAX_NOTE}
              onChange={(e) => p.onNote(e.target.value)}
              className="box-border h-[88px] resize-none rounded-control border border-hairlineStrong bg-raised p-[12px] text-body leading-[20px] text-fg outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-frost"
            />
            <span aria-live="polite" className="self-end text-meta text-fg-dim [font-variant-numeric:tabular-nums]">{p.note.length} / {MAX_NOTE}</span>
            <p className="m-[0px] text-meta text-fg-dim">Clipr adds the error, the version numbers and a cleaned log. Nothing is sent unless you press Send report.</p>
            <div className="flex gap-[8px]">
              <button type="button" aria-label="Send report" disabled={!p.note.trim()} onClick={p.onSend} className="h-target rounded-control bg-ice px-[16px] text-body font-medium text-bg disabled:bg-hover disabled:text-disabled">Send report</button>
              <button type="button" aria-label="Copy details" onClick={p.onCopy} className={outlineButton}>{p.copied ? "Copied" : "Copy details"}</button>
            </div>
            <p className="m-[0px] text-meta text-fg-dim">If the report can&apos;t be sent, Clipr keeps it and tries again later.</p>
          </>
        )}
      </div>
    </>
  );
}
