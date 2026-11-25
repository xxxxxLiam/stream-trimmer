/**
 * File: CampaignMenu.tsx
 * Path: src/renderer/src/features/campaigns/components/CampaignMenu.tsx
 * Description: Body of the header campaign popover: switch campaign, a gear on each row for its settings, create one with
 *   the new-campaign form. Switching re-points the folder and the used-ranges record at once. No filled-accent button here: the
 *   screen's one primary action is Cut.
 */
import { useState } from "react";
import CampaignForm from "./CampaignForm";
import { useCampaign } from "../hooks/CampaignContext";
import { todayCount } from "../../../shared/utils/campaigns";
import { IconGear } from "../../../shared/components/icons";
import { Check2 } from "react-bootstrap-icons";

export default function CampaignMenu({
  onClose,
  onOpenSettings,
}: {
  onClose?: () => void;
  /** Opens the campaign's own settings view (Settings > the campaign). */
  onOpenSettings?: (campaignId: string) => void;
}) {
  const { campaigns, activeId, setActiveId } = useCampaign();
  const [wizard, setWizard] = useState(false);

  const ROW =
    "flex h-[44px] w-full items-center gap-[10px] rounded-control px-[10px] text-left text-body text-fg hover:bg-hover";
  const openSettings = (id: string) => {
    onOpenSettings?.(id);
    onClose?.();
  };
  return (
    <div role="menu" aria-label="Campaigns" className="flex flex-col">
      <div className="px-[10px] pb-[4px] pt-[6px] text-meta text-fg-dim">Campaigns</div>
      {campaigns.length === 0 ? (
        <p className="m-0 px-[10px] py-[8px] text-meta text-fg-dim">
          No campaigns yet. A campaign remembers, for one client, how long clips should be, how
          they are named, and the folder they are saved in.
        </p>
      ) : (
        <ul id="ui-campaign-list" className="m-0 flex list-none flex-col p-0">
          {campaigns.map((c) => {
            const selected = c.id === activeId;
            return (
              <li key={c.id} className={`flex items-center rounded-control ${selected ? "bg-hover" : ""}`}>
                <button
                  type="button"
                  role="menuitem"
                  aria-current={selected}
                  className={`${ROW} min-w-0 flex-1 hover:bg-hover`}
                  onClick={() => {
                    setActiveId(c.id);
                    onClose?.();
                  }}
                >
                  <span className="flex w-[12px] shrink-0 justify-center">
                    {selected ? (
                      <Check2 width={12} height={12} className="text-ice" aria-hidden="true" focusable="false" />
                    ) : null}
                  </span>
                  <span className="min-w-0 truncate">{c.name}</span>
                  <span className="ml-auto shrink-0 text-meta text-fg-dim">{todayCount(c) ?? ""}</span>
                </button>
                {/* Liam, 25 Nov: a gear at the row's far right opens that campaign's settings; no separate "<Campaign> settings" line. */}
                <button
                  type="button"
                  role="menuitem"
                  aria-label={`${c.name} settings`}
                  id={selected ? "ui-campaign-settings" : undefined}
                  className="inline-flex size-target shrink-0 items-center justify-center rounded-control text-fg-dim hover:bg-hover hover:text-fg"
                  onClick={() => openSettings(c.id)}
                >
                  <IconGear />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div role="separator" className="mx-[4px] my-[6px] h-px bg-hairline" />
      <button type="button" role="menuitem" className={ROW} onClick={() => setWizard(true)}>
        <span className="w-[16px] text-center text-fg-dim">+</span>
        New campaign
      </button>
      {/* A3-1: backing out of the form closes the popover too, so the next click on the chip opens it instead of closing it. */}
      <CampaignForm open={wizard} onClose={() => { setWizard(false); onClose?.(); }} onCreated={() => onClose?.()} />
    </div>
  );
}
