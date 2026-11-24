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
        className="chip"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Campaign this clip will be cut for"
      >
        <span className="text-fg-dim">Campaign</span>
        <span className="max-w-[160px] truncate">
          {active ? active.name : "None yet"}
        </span>
        <IconChevronDown className="shrink-0 text-fg-dim" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Campaign"
          className="popover absolute left-0 top-full z-40 mt-1 w-[min(360px,calc(100vw-24px))]"
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
