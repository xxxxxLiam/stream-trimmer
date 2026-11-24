/**
 * File: FailedRow.tsx
 * Path: src/renderer/src/features/clips/components/FailedRow.tsx
 * Description: A clip that failed, said on its own Export row where its progress was: the reason in
 *   error red, one plain line about what happens next, and the pills that fit (Retry, Change folder,
 *   Show video in browser, Save for later, and Copy details after a second failure).
 */
import { CopyFailureDiagnostics } from "../../../shared/components/DiagnosticsDisclosure";
import type { DownloadFailureInfo } from "../../../modules/clipper/utils/clipperTypes";
import { failureActions, failureCopy, type FailureAction } from "../utils/clipFailure";
import type { FailedClip } from "../hooks/useExportState";

const PILL = "h-btn rounded-full border border-ice px-3 text-meta text-ice hover:bg-ice-tint-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-frost";
const LABEL: Record<Exclude<FailureAction, "copyDetails">, string> = {
  retry: "Retry",
  changeFolder: "Change folder",
  showInBrowser: "Show video in browser",
  saveForLater: "Save for later",
};

export type FailedRowProps = {
  failed: FailedClip;
  failure: DownloadFailureInfo | null;
  onAction: (action: Exclude<FailureAction, "copyDetails">) => void;
};

export default function FailedRow({ failed, failure, onAction }: FailedRowProps) {
  const copy = failureCopy(failed.kind, failed.attempts, failed.reason);
  return (
    <div className="mx-[10px] mb-[6px] mt-[10px] rounded-control border border-error bg-raised px-[10px] py-[9px]" role="group" aria-label={`${failed.name} failed`}>
      <div className="text-body font-medium">{failed.name}</div>
      <div className="mt-[2px] text-meta text-error" role="alert">
        {copy.reason}
      </div>
      <div className="mt-[2px] text-meta text-fg-dim">{copy.detail}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {failureActions(failed.kind, failed.attempts).map((a) =>
          a === "copyDetails" ? (
            failure ? (
              <CopyFailureDiagnostics
                key={a}
                label="Copy details"
                code={failure.code}
                message={failure.message}
                attempt={failure.attempt}
                diagnostics={failure.diagnostics}
              />
            ) : null
          ) : (
            <button key={a} type="button" className={PILL} onClick={() => onAction(a)}>
              {LABEL[a]}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
