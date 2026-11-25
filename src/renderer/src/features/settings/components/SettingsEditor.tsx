/**
 * File: SettingsEditor.tsx
 * Path: src/renderer/src/features/settings/components/SettingsEditor.tsx
 * Description: One editor's page in the Settings sidebar, reached from the editor button at the bottom of a
 *   campaign's settings ("‹ Acme" / "Final Cut Pro"). Final Cut holds Library, Event, Layout (with its tree)
 *   and Your look. Premiere and Resolve have nothing to set per campaign yet, so their page says what Clip
 *   does. All of it is per campaign.
 */
import { DrawerHeader, drawerBody } from "../../../shared/components/DrawerRows";
import FinalCutLayout, { type FinalCutLayoutProps } from "./FinalCutLayout";
import FinalCutLook, { type FinalCutLookProps } from "./FinalCutLook";

export type FinalCutFields = {
  library: string;
  event: string;
  /** False for the layouts that name their own events (per video, per day): the Event field would do nothing. */
  showEvent?: boolean;
  onChoose: () => void;
  onEvent: (v: string) => void;
  /** The "Your look" block; shown when the look files can be read (needs the Engine look reader). */
  look?: FinalCutLookProps;
  /** The "Layout" row (how clips are laid out in Final Cut, with a preview). */
  layout?: FinalCutLayoutProps;
};

export type SettingsEditorProps = {
  campaignName: string;
  /** "Final Cut Pro", "Premiere Pro" or "DaVinci Resolve". */
  label: string;
  /** Present for Final Cut only. */
  finalCut: FinalCutFields | null;
  onBack: () => void;
  onClose: () => void;
};

const fieldInput = "h-target min-w-0 rounded-control border border-hairlineStrong bg-panel px-[12px] text-body leading-[normal] text-fg outline-none focus:border-ice-tint-50";

export default function SettingsEditor(p: SettingsEditorProps) {
  const fc = p.finalCut;
  return (
    <>
      <DrawerHeader closeName="Settings" title={p.label} back={p.campaignName} onBack={p.onBack} onClose={p.onClose} />
      <div className={drawerBody}>
        {fc ? (
          <div className="flex flex-col gap-[8px] py-[12px]">
            <label htmlFor="fcp-lib" className="text-meta text-fg-dim">Library</label>
            <div className="flex gap-[8px]">
              <input id="fcp-lib" type="text" readOnly value={fc.library} className={`${fieldInput} flex-1`} />
              <button type="button" aria-label={`Choose the Final Cut library for ${p.campaignName}`} onClick={fc.onChoose} className="h-target rounded-control border border-hairlineStrong bg-hover px-[16px] text-body leading-[normal] text-fg">
                Choose
              </button>
            </div>
            {fc.showEvent !== false && (
              <>
                <label htmlFor="fcp-event" className="text-meta text-fg-dim">Event</label>
                <input id="fcp-event" type="text" value={fc.event} placeholder="Export" onChange={(e) => fc.onEvent(e.target.value)} className={fieldInput} />
              </>
            )}
            {fc.layout && <FinalCutLayout {...fc.layout} />}
            {fc.look && <FinalCutLook {...fc.look} />}
          </div>
        ) : (
          <p className="m-[0px] py-[12px] text-body text-fg-dim">
            Nothing to set for {p.label} yet. Clip saves the clip and opens it in {p.label}.
          </p>
        )}
      </div>
    </>
  );
}
