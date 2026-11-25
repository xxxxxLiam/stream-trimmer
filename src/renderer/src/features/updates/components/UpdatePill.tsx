/**
 * File: UpdatePill.tsx
 * Path: src/renderer/src/features/updates/components/UpdatePill.tsx
 * Description: The top bar's update pill (bright Frost), left of Panels | Help | Settings.
 */
import { useState } from "react";
import { useUpdateStatusEffects } from "../hooks/useUpdateStatusEffects";
import { useMakingName } from "../../../shared/utils/clipNameStore";
import { downloadingLabel, restartRefusal, updatePillFor, waitingLabel } from "../utils/updatePill";

export default function UpdatePill() {
  const { ready, downloading, waiting } = useUpdateStatusEffects();
  const making = useMakingName();
  const [refusal, setRefusal] = useState<string | null>(null);
  const pill = updatePillFor(ready);
  const outer = "mr-[8px] inline-flex h-[44px] items-center group";
  // Liam, 25 Nov: the update pills are bright Frost (the light), so they are noticed; Ice stays for live state elsewhere.
  const frostOutline = "inline-flex h-[32px] items-center whitespace-nowrap rounded-[16px] border border-frost px-[14px] text-body text-frost";
  if (!pill && downloading !== null) {
    return (
      <span id="ui-update-pill" role="status" className="mr-[8px] inline-flex h-[44px] items-center">
        <span className={frostOutline}>{downloadingLabel(downloading)}</span>
      </span>
    );
  }
  if (!pill) return null;
  const face =
    "inline-flex h-[32px] items-center whitespace-nowrap rounded-[16px] border border-frost bg-frost px-[14px] text-body font-medium text-bg group-hover:bg-frost-tint-80";
  if (pill.kind === "download") {
    return (
      <a id="ui-update-pill" className={outer} href={pill.url} target="_blank" rel="noreferrer" aria-label={pill.label}>
        <span className={face}>{pill.label}</span>
      </a>
    );
  }
  if (waiting) {
    const label = waitingLabel(making);
    return (
      <button
        type="button"
        id="ui-update-pill"
        className={outer}
        aria-label={`${label} is made. Press to cancel`}
        onClick={() => void window.electronAPI?.cancelRestartToUpdate?.()}
      >
        <span className={`${frostOutline} font-medium group-hover:bg-frost-tint-35`}>{label}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      id="ui-update-pill"
      className={outer}
      aria-label={pill.label}
      title={refusal ?? undefined}
      onClick={async () => {
        const r = await window.electronAPI?.restartToUpdate();
        setRefusal(r ? restartRefusal(r) : null);
      }}
    >
      <span className={face}>{pill.label}</span>
    </button>
  );
}
