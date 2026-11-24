/**
 * File: SettingsCampaigns.tsx
 * Path: src/renderer/src/features/settings/components/SettingsCampaigns.tsx
 * Description: Campaigns list (Settings.dc.html view 2): each campaign with its quota, extra seconds
 *   and languages, an Edit button, and Add campaign.
 */
import { DrawerHeader, drawerBody, outlineButton } from "../../../shared/components/DrawerRows";

export type CampaignRow = { id: string; name: string; summary: string; languages: string | null };

export default function SettingsCampaigns(p: {
  rows: CampaignRow[];
  onEdit: (id: string) => void;
  onAdd: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <DrawerHeader closeName="Settings" title="Campaigns" back="Settings" onBack={p.onBack} onClose={p.onClose} />
      <div className={drawerBody}>
      {p.rows.map((r, i) => (
        <div key={r.id} className={`flex items-center gap-3 py-3 ${i < p.rows.length - 1 ? "border-b border-hairline" : ""}`}>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-body">{r.name}</span>
            <span className="text-meta text-fg-dim">{r.summary}</span>
            {r.languages && <span className="text-meta text-fg-dim">{r.languages}</span>}
          </div>
          <button type="button" aria-label={`Edit ${r.name}`} onClick={() => p.onEdit(r.id)} className={outlineButton}>
            Edit
          </button>
        </div>
      ))}
      <button type="button" aria-label="Add campaign" onClick={p.onAdd} className="mt-3 h-target rounded-control bg-ice text-body font-medium text-bg">
        Add campaign
      </button>
      <p className="m-0 mt-3 text-meta text-fg-dim">Each campaign shows its quota, extra seconds and languages. Edit opens that campaign.</p>
      </div>
    </>
  );
}
