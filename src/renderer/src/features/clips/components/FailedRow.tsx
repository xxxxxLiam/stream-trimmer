/**
 * File: FailedRow.tsx
 * Path: src/renderer/src/features/clips/components/FailedRow.tsx
 * Description: A clip that failed, said on its own Export row where its progress was (boards 03.2.18 and
 *   03.6.3): the reason in error red and, after it on the same line, what Clipr is doing in dim text;
 *   then the pills that fit. The first pill is Ice-outlined, the others quiet. No red anywhere but the
 *   reason. Explicit px because the board's sizes are.
 */
import { CopyFailureDiagnostics } from "../../../shared/components/DiagnosticsDisclosure";
import type { DownloadFailureInfo } from "../../../modules/clipper/utils/clipperTypes";
import { failureActions, failureCopy, type FailureAction } from "../utils/clipFailure";
import type { FailedClip } from "../hooks/useExportState";
import { PILL_HIT, PRIMARY_PILL, QUIET_PILL } from "../utils/pillClasses";

const PRIMARY = PRIMARY_PILL;
const QUIET = QUIET_PILL;
const HIT = PILL_HIT;

const LABEL: Record<Exclude<FailureAction, "copyDetails">, string> = {
  retry: "Retry",
  changeFolder: "Change folder",
  showInBrowser: "Show video in browser",
  saveForLater: "Save for later",
  signIn: "Sign in",
  showFolder: "Show folder",
};

export type FailedRowProps = {
  failed: FailedClip;
  failure: DownloadFailureInfo | null;
  campaignName?: string;
  signedIn?: boolean;
  onAction: (action: Exclude<FailureAction, "copyDetails">) => void;
};

export default function FailedRow({ failed, failure, campaignName, signedIn = true, onAction }: FailedRowProps) {
  const copy = failureCopy(failed.kind, failed.attempts, failed.reason, failed.retrying, failed.room, campaignName);
  const actions = failureActions(failed.kind, failed.attempts, failed.final, signedIn);
  return (
    <div
      role="group"
      aria-label={`${failed.name}: ${copy.reason}`}
      className="relative mx-[10px] mb-[6px] mt-[10px] rounded-control bg-raised px-[10px] pb-[2px] pt-[9px]"
    >
      <div className="text-body font-medium leading-[normal]">{failed.name}</div>
      <div role="alert" className="mt-[3px] text-meta leading-[1.45]">
        <span className="text-error">{copy.reason}</span>
        {copy.detail ? <> <span className="text-fg-dim">{copy.detail}</span></> : null}
      </div>
      <div className="flex gap-[6px]">
        {actions.map((a, i) => {
          if (a === "copyDetails") {
            return failure ? (
              <CopyFailureDiagnostics
                key={a}
                pill={{ name: failed.name, className: `${HIT}`, pillClassName: QUIET }}
                code={failure.code}
                message={failure.message}
                attempt={failure.attempt}
                diagnostics={failure.diagnostics}
              />
            ) : null;
          }
          const label = a === "showInBrowser" || a === "saveForLater" || a === "signIn" || a === "showFolder" ? LABEL[a] : `${LABEL[a]} ${failed.name}`;
          return (
            <button key={a} type="button" aria-label={label} className={HIT} onClick={() => onAction(a)}>
              <span className={i === 0 ? PRIMARY : QUIET}>{LABEL[a]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
