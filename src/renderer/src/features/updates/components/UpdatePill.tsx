/**
 * File: UpdatePill.tsx
 * Path: src/renderer/src/features/updates/components/UpdatePill.tsx
 * Description: The top bar's update pill (Ice outline), left of Panels | Help | Settings.
 */
import { useState } from "react";
import { useUpdateStatusEffects } from "../hooks/useUpdateStatusEffects";
import { downloadingLabel, restartRefusal, updatePillFor } from "../utils/updatePill";

export default function UpdatePill() {
  const { ready, downloading } = useUpdateStatusEffects();
  const [refusal, setRefusal] = useState<string | null>(null);
  const pill = updatePillFor(ready);
  if (!pill && downloading !== null) {
    return (
      <span id="ui-update-pill" role="status" className="mr-[8px] inline-flex h-[44px] items-center">
        <span className="inline-flex h-[32px] items-center whitespace-nowrap rounded-[16px] border border-hairlineStrong px-[14px] text-body text-fg-dim">{downloadingLabel(downloading)}</span>
      </span>
    );
  }
  if (!pill) return null;
  const outer = "mr-[8px] inline-flex h-[44px] items-center group";
  const face =
    "inline-flex h-[32px] items-center whitespace-nowrap rounded-[16px] border border-ice px-[14px] text-body font-medium text-ice group-hover:bg-ice-tint-12";
  if (pill.kind === "download") {
    return (
      <a id="ui-update-pill" className={outer} href={pill.url} target="_blank" rel="noreferrer" aria-label={pill.label}>
        <span className={face}>{pill.label}</span>
      </a>
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
