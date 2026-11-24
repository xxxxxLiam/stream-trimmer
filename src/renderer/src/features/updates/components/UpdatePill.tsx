/**
 * File: UpdatePill.tsx
 * Path: src/renderer/src/features/updates/components/UpdatePill.tsx
 * Description: The top bar's update pill (Ice outline), left of Panels | Help | Settings.
 */
import { useState } from "react";
import { useUpdateStatusEffects } from "../hooks/useUpdateStatusEffects";
import { restartRefusal, updatePillFor } from "../utils/updatePill";

export default function UpdatePill() {
  const ready = useUpdateStatusEffects();
  const [refusal, setRefusal] = useState<string | null>(null);
  const pill = updatePillFor(ready);
  if (!pill) return null;
  const cls =
    "mr-1 inline-flex h-8 items-center rounded-control border border-ice px-3 text-meta text-fg hover:bg-ice-tint-12";
  if (pill.kind === "download") {
    return (
      <a id="ui-update-pill" className={cls} href={pill.url} target="_blank" rel="noreferrer">
        {pill.label}
      </a>
    );
  }
  return (
    <button
      type="button"
      id="ui-update-pill"
      className={cls}
      title={refusal ?? undefined}
      onClick={async () => {
        const r = await window.electronAPI?.restartToUpdate();
        setRefusal(r ? restartRefusal(r) : null);
      }}
    >
      {pill.label}
    </button>
  );
}
