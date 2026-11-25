/**
 * File: CampaignMenu.tsx
 * Path: src/renderer/src/features/campaigns/components/CampaignMenu.tsx
 * Description: Body of the header campaign popover: switch campaign, open its settings, create one with
 *   the new-campaign form. Switching re-points the folder and the used-ranges record at once. No filled-accent button here: the
 *   screen's one primary action is Cut.
 */
import { useState } from "react";
import CampaignForm from "./CampaignForm";
import { useCampaign } from "../hooks/CampaignContext";
import { todayCount } from "../../../shared/utils/campaigns";

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

  const current = campaigns.find((c) => c.id === activeId);
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
              <li key={c.id}>
                <button
                  type="button"
                  role="menuitem"
                  aria-current={selected}
                  className={`${ROW} ${selected ? "bg-hover" : ""}`}
                  onClick={() => {
                    setActiveId(c.id);
                    onClose?.();
                  }}
                >
                  <span className="flex w-[12px] shrink-0 justify-center">
                    {selected ? (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--ice)" strokeWidth="1.8" aria-hidden="true">
                        <path d="M2 6.5l2.5 2.5L10 3.5" />
                      </svg>
                    ) : null}
                  </span>
                  <span className="min-w-0 truncate">{c.name}</span>
                  <span className="ml-auto shrink-0 text-meta text-fg-dim">{todayCount(c) ?? ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div role="separator" className="mx-[4px] my-[6px] h-px bg-hairline" />
      {current ? (
        <button type="button" id="ui-campaign-settings" role="menuitem" className={ROW} onClick={() => openSettings(current.id)}>
          <span className="inline-flex text-fg-dim">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="8" cy="8" r="2.2" />
              <path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" />
            </svg>
          </span>
          <span className="min-w-0 truncate">{current.name} settings</span>
          <span className="ml-auto inline-flex text-fg-dim">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M3.5 2l3 3-3 3" />
            </svg>
          </span>
        </button>
      ) : null}
      <button type="button" role="menuitem" className={ROW} onClick={() => setWizard(true)}>
        <span className="w-[16px] text-center text-fg-dim">+</span>
        New campaign
      </button>
      <CampaignForm open={wizard} onClose={() => setWizard(false)} onCreated={() => onClose?.()} />
    </div>
  );
}
