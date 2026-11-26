/**
 * File: CampaignSwitchDialog.tsx
 * Path: src/renderer/src/features/campaigns/components/CampaignSwitchDialog.tsx
 * Description: The campaign-switch dialog (board 03.2.54): 420px, 24px padding, over a scrim. Cancel (outline) stays on the
 *   current video; "Open in <campaign>" (Ice fill) switches and opens. Never red. Logic-free: the host decides when it shows.
 */
import { useRef, useState } from "react";
import Button from "../../../shared/components/Button";
import { useModalFocus } from "../../../shared/hooks/useModalFocus";
import { switchLine, switchTitle } from "../utils/campaignSwitch";

export type CampaignSwitchDialogProps = {
  video: string;
  from: string;
  to: string;
  /** `dontShowAgain` is the tick: ticked, even Cancel stops the question. */
  onCancel: (dontShowAgain: boolean) => void;
  /** An Open stops the question too, ticked or not. */
  onOpen: () => void;
};

export default function CampaignSwitchDialog({ video, from, to, onCancel, onOpen }: CampaignSwitchDialogProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const [tick, setTick] = useState(false);
  // Focus starts on Cancel, the harmless choice; Tab stays inside.
  const onKeyDown = useModalFocus(root, "[data-switch-first]");
  return (
    <div data-covers-app="" className="fixed inset-0 z-[60] flex items-center justify-center bg-bg-overlay-50 p-[32px]">
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ui-campaign-switch-title"
        id="ui-campaign-switch"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel(tick);
            return;
          }
          onKeyDown(e);
        }}
        className="flex w-[420px] max-w-full flex-col gap-[16px] rounded-panel border border-hairlineStrong bg-raised p-[24px]"
      >
        <h2 id="ui-campaign-switch-title" className="m-[0px] text-drawer-title font-medium text-fg">
          {switchTitle(to)}
        </h2>
        <p className="m-[0px] text-body leading-[1.5] text-fg-dim">{switchLine(video, to, from)}</p>
        <label className="flex h-[32px] cursor-pointer items-center gap-[8px] text-meta text-fg-dim">
          <input type="checkbox" checked={tick} onChange={(e) => setTick(e.target.checked)} className="size-[18px] accent-ice" />
          Don&rsquo;t show this again
        </label>
        <div className="flex gap-[12px]">
          <Button variant="secondary" data-switch-first="" className="flex-1" onClick={() => onCancel(tick)}>
            Cancel
          </Button>
          <Button variant="primary" className="min-w-[0px] flex-1" onClick={onOpen}>
            <span className="truncate">Open in {to}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
