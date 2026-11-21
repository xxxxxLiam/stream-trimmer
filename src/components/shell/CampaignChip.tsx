/**
 * File: CampaignChip.tsx
 * Path: src/components/shell/CampaignChip.tsx
 * Description: Header chip showing which campaign a clip will be cut for. Opens a
 *   popover whose body is the `menu` slot (TODO(B4): campaign picker + create UI).
 */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useCampaign } from "../../context/CampaignContext";
import { IconChevronDown } from "./icons";
import { useDismiss } from "./useDismiss";

export default function CampaignChip({ menu }: { menu?: ReactNode }) {
  const { active } = useCampaign();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

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
          className="popover absolute left-0 top-full z-40 mt-1 w-[280px]"
        >
          {menu ?? (
            // TODO(B4): replaced by campaigns agent (picker, create, edit).
            <p className="text-meta text-fg-dim">
              No campaigns yet. Create one to set a clip length band, a clip id
              pattern and two save folders.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
