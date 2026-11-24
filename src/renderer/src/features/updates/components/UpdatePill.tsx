/**
 * File: UpdatePill.tsx
 * Path: src/renderer/src/features/updates/components/UpdatePill.tsx
 * Description: The top bar's update pill (Ice outline), left of Panels | Help | Settings.
 */
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useUpdateStatusEffects } from "../hooks/useUpdateStatusEffects";
import { updatePillFor } from "../utils/updatePill";

export default function UpdatePill() {
  const status = useUpdateStatusEffects();
  const { downloading } = useClipperContext();
  const pill = updatePillFor(status, downloading);
  if (!pill) return null;
  const cls =
    "mr-1 inline-flex h-8 items-center rounded-control border border-ice px-3 text-meta text-fg hover:bg-ice-tint-12 aria-disabled:border-hairlineStrong aria-disabled:text-disabled aria-disabled:hover:bg-transparent";
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
      aria-disabled={pill.disabledReason ? true : undefined}
      title={pill.disabledReason}
      onClick={() => {
        if (!pill.disabledReason) window.electronAPI?.quitAndInstall();
      }}
    >
      {pill.label}
    </button>
  );
}
