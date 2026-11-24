/**
 * File: CampaignStart.tsx
 * Path: src/renderer/src/features/campaigns/components/CampaignStart.tsx
 * Description: What a new tab offers when it has no campaign: pick one you already have, or make
 *   a new one with the wizard. With no campaigns yet it goes straight to the wizard. It is only
 *   ever an offer: "Not now" (or Esc, or the close button) leaves the tab as it was, so someone
 *   who just wants to paste a link is never held up.
 */
import { useState } from "react";
import CentredDialog from "../../../shared/components/CentredDialog";
import CampaignWizard from "./CampaignWizard";
import { useCampaign } from "../hooks/CampaignContext";
import { formatLength } from "../../../shared/utils/segments";

export default function CampaignStart({
  open,
  onClose,
  onChosen,
}: {
  open: boolean;
  onClose: () => void;
  /** Called with the campaign id after one is picked or created. */
  onChosen?: (id: string) => void;
}) {
  const { campaigns, activeId, setActiveId } = useCampaign();
  const [wizard, setWizard] = useState(false);

  if (!open) return null;
  if (wizard || campaigns.length === 0) {
    return (
      <CampaignWizard
        open
        onClose={() => {
          setWizard(false);
          onClose();
        }}
        onCreated={(c) => onChosen?.(c.id)}
      />
    );
  }

  return (
    <CentredDialog open onClose={onClose} title="Which campaign is this tab for?" widthClass="max-w-[480px]" id="ui-campaign-start">
      <p className="m-0 text-meta text-fg-dim">
        Pick the client you are cutting for. Clip names, length, format and save folder all switch
        to match.
      </p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0" role="listbox" aria-label="Campaigns">
        {campaigns.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              role="option"
              aria-selected={c.id === activeId}
              className={`btn w-full min-w-0 justify-start text-left ${c.id === activeId ? "border-accent" : ""}`}
              onClick={() => {
                setActiveId(c.id);
                onChosen?.(c.id);
                onClose();
              }}
            >
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className="shrink-0 font-mono text-meta text-fg-dim">
                {formatLength(c.targetMinSec)} to {formatLength(c.targetMaxSec)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Not now
        </button>
        <button type="button" className="btn" onClick={() => setWizard(true)}>
          Create a new campaign
        </button>
      </div>
    </CentredDialog>
  );
}
