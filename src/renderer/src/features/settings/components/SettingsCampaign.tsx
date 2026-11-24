/**
 * File: SettingsCampaign.tsx
 * Path: src/renderer/src/features/settings/components/SettingsCampaign.tsx
 * Description: One campaign (Settings.dc.html view 3): Clips a day, Extra seconds at both ends,
 *   Languages, Folder with Open, the Final Cut library and event while Final Cut Pro is ticked, and
 *   Delete campaign. No clip id fields, no format or quality.
 */
import { DrawerHeader, drawerBody, outlineButton } from "./DrawerParts";
import { EXTRA_SECONDS_CHOICES, stepClipsPerDay, type CampaignPrefs } from "../utils/settingsPrefs";

export type FinalCutFields = { library: string; event: string; onChoose: () => void; onEvent: (v: string) => void };

export type SettingsCampaignProps = {
  name: string;
  prefs: CampaignPrefs;
  /** Clips a day (`Campaign.dailyQuota`); the top bar shows "N of M today" from it. */
  quota: number;
  onQuota: (n: number) => void;
  folderLabel: string;
  /** Dub tracks of the open video. The Languages block shows only when there are some. */
  dubs: { code: string; label: string }[];
  /** Present only while Final Cut Pro is ticked in the Clip menu for this campaign. */
  finalCut: FinalCutFields | null;
  onPatch: (p: Partial<CampaignPrefs>) => void;
  onToggleLanguage: (code: string) => void;
  onOpenFolder: () => void;
  /** True after the first click on Delete; the second click deletes. */
  confirmingDelete: boolean;
  onDelete: () => void;
  onBack: () => void;
  onClose: () => void;
};

const stepButton = "h-target w-target rounded-control border border-hairlineStrong bg-raised text-section text-fg hover:bg-hover disabled:text-disabled";
const fieldInput = "h-target min-w-0 rounded-control border border-hairlineStrong bg-panel px-3 text-body text-fg outline-none focus:border-ice-tint-50";

export default function SettingsCampaign(p: SettingsCampaignProps) {
  const { prefs } = p;
  return (
    <>
      <DrawerHeader title={p.name} back="Campaigns" onBack={p.onBack} onClose={p.onClose} />
      <div className={drawerBody}>
      <div className="flex h-[52px] items-center gap-2 border-b border-hairline">
        <span className="flex-1 text-body">Clips a day</span>
        <button type="button" aria-label="One fewer clip a day" disabled={p.quota <= 1} onClick={() => p.onQuota(stepClipsPerDay(p.quota, -1))} className={stepButton}>−</button>
        <span aria-live="polite" className="w-6 text-center text-body [font-variant-numeric:tabular-nums]">{p.quota}</span>
        <button type="button" aria-label="One more clip a day" onClick={() => p.onQuota(stepClipsPerDay(p.quota, 1))} className={stepButton}>+</button>
      </div>
      <div className="flex flex-col gap-2 border-b border-hairline py-3">
        <span className="text-body">Extra seconds at both ends</span>
        <div role="radiogroup" aria-label="Extra seconds at both ends" className="flex gap-2">
          {EXTRA_SECONDS_CHOICES.map((n) => {
            const on = prefs.extraSeconds === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`${n} seconds`}
                onClick={() => p.onPatch({ extraSeconds: n })}
                className={`h-target min-w-[44px] rounded-[22px] px-3 text-body ${on ? "bg-ice text-bg" : "border border-hairlineStrong bg-raised text-fg"}`}
              >
                {n}s
              </button>
            );
          })}
        </div>
      </div>
      {p.dubs.length > 0 && (
      <div className="flex flex-col gap-2 border-b border-hairline py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-body">Languages</span>
          <span className="text-meta text-fg-dim">Shown only when the video has dubs</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {[{ code: "original", label: "Original" }, ...p.dubs].map((l) => {
            const on = prefs.languages.includes(l.code);
            return (
              <button
                key={l.code}
                type="button"
                aria-pressed={on}
                aria-label={`${l.label} audio, ${on ? "ticked" : "not ticked"}`}
                onClick={() => p.onToggleLanguage(l.code)}
                className={`inline-flex h-target items-center gap-1.5 rounded-[22px] px-4 text-body ${on ? "bg-ice text-bg" : "border border-hairlineStrong bg-raised text-fg"}`}
              >
                {on && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
                {l.label}
              </button>
            );
          })}
        </div>
      </div>
      )}
      <div className="flex items-center gap-3 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-body">Folder</span>
          <span className="truncate text-meta text-fg-dim">{p.folderLabel}</span>
        </div>
        <button type="button" aria-label={`Open the ${p.name} folder`} onClick={p.onOpenFolder} className={outlineButton}>
          Open
        </button>
      </div>
      {p.finalCut && (
        <div role="group" aria-label="Final Cut Pro" className="flex flex-col gap-2 rounded-control border border-hairlineStrong bg-raised p-3">
          <span className="text-body font-medium">Final Cut Pro</span>
          <label htmlFor="fcp-lib" className="text-meta text-fg-dim">Library</label>
          <div className="flex gap-2">
            <input id="fcp-lib" type="text" readOnly value={p.finalCut.library} className={`${fieldInput} flex-1`} />
            <button type="button" aria-label={`Choose the Final Cut library for ${p.name}`} onClick={p.finalCut.onChoose} className="h-target rounded-control border border-hairlineStrong bg-hover px-4 text-body text-fg">
              Choose
            </button>
          </div>
          <label htmlFor="fcp-event" className="text-meta text-fg-dim">Event</label>
          <input id="fcp-event" type="text" value={p.finalCut.event} onChange={(e) => p.finalCut?.onEvent(e.target.value)} className={fieldInput} />
          <p className="m-0 text-meta text-fg-dim">Each video gets its own keyword collection inside the event. Shown only while Final Cut Pro is ticked in the Clip menu.</p>
        </div>
      )}
      <button type="button" aria-label={`Delete campaign ${p.name}`} onClick={p.onDelete} className="mt-2 h-target self-start bg-transparent text-meta text-fg-dim underline underline-offset-[3px]">
        {p.confirmingDelete ? `Click again to delete ${p.name}` : "Delete campaign"}
      </button>
      </div>
    </>
  );
}
