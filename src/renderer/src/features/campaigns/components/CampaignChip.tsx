/**
 * File: CampaignChip.tsx
 * Path: src/renderer/src/features/campaigns/components/CampaignChip.tsx
 * Description: Header chip showing which campaign a clip will be cut for. Opens a
 *   popover whose body is the `menu` slot (App.tsx passes CampaignMenu).
 */
import {
  cloneElement,
  isValidElement,
  useCallback,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useCampaign } from "../hooks/CampaignContext";
import CampaignMenu from "./CampaignMenu";
import { IconChevronDown } from "../../../shared/components/icons";
import { useDismissEffects } from "../../../shared/hooks/useDismissEffects";

export default function CampaignChip({ menu }: { menu?: ReactNode }) {
  const { active } = useCampaign();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissEffects(ref, open, close);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        id="ui-campaign-chip"
        className={`inline-flex h-[44px] max-w-[260px] items-center gap-[8px] rounded-control border bg-raised pl-[12px] pr-[10px] text-body font-medium text-fg hover:bg-hover ${
          open ? "border-ice shadow-[0_0_0_3px_var(--ice-tint-18)]" : "border-hairline"
        }`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Campaign this clip will be cut for"
      >
        <span className="min-w-0 truncate">{active ? active.name : "No campaign"}</span>
        <IconChevronDown className="shrink-0 text-fg-dim" />
      </button>
      {open && (
        // The scrim dims everything under the top bar while the menu is open (board 03.2.7).
        <div aria-hidden className="fixed inset-x-0 bottom-0 top-[53px] z-30 bg-bg/55" />
      )}
      {open && (
        <div
          role="dialog"
          aria-label="Campaign"
          className="absolute left-0 top-full z-40 w-[300px] rounded-panel border border-hairlineStrong bg-raised p-[6px]"
        >
          {isValidElement(menu) ? (
            // The menu closes the popover itself after a switch or save.
            cloneElement(menu as ReactElement<{ onClose?: () => void }>, { onClose: close })
          ) : (
            (menu ?? <CampaignMenu onClose={close} />)
          )}
        </div>
      )}
    </div>
  );
}
