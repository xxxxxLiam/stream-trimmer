/**
 * File: MarkersPanel.tsx
 * Path: src/renderer/src/features/markers/components/MarkersPanel.tsx
 * Description: The Markers panel (left group, closed by default). A review list of the flags
 *   dropped while watching: time and the words said there. Flags with a range sit in one Ice
 *   group with a Join tag; clipped flags fold into "Clipped · N". Trim next flag (N) at the bottom.
 */
import PanelEmptyNote, { KeyChip } from "../../../modules/layout/components/PanelEmptyNote";
import { IconChevronDown } from "../../../shared/components/PanelIcons";
import { useMarkersController } from "../hooks/useMarkersController";
import FlagRowItem from "./FlagRowItem";

export default function MarkersPanel() {
  const m = useMarkersController();
  const { open, ranged, clipped } = m.groups;

  if (m.empty) {
    return (
      <PanelEmptyNote>
        No flags yet. Press <KeyChip>M</KeyChip> while watching to drop one.
      </PanelEmptyNote>
    );
  }

  return (
    <div className="flex min-h-[0px] flex-1 flex-col">
      <div className="min-h-[0px] flex-1 overflow-y-auto" tabIndex={0} aria-label="Flags">
        <div className="h-[9px]" />
        {open.map((r) => (
          <FlagRowItem key={r.at} row={r} onOpen={() => m.open(r)} onRemove={() => m.remove(r)} />
        ))}

        {ranged.length > 0 && (
          <section aria-label="Both have a range" className="mx-[10px] mb-[3px] mt-[9px] overflow-hidden rounded-control border border-ice">
            <div className="flex h-target items-center pl-[10px]">
              <span className="text-meta leading-[normal] text-ice">Both have a range</span>
              <span className="ml-auto">
                <button
                  type="button"
                  aria-label="Join: make one clip from both"
                  onClick={m.join}
                  className="inline-flex h-target items-center px-[6px]"
                >
                  <span className="inline-flex h-[24px] items-center rounded-[12px] bg-ice px-[10px] text-meta leading-[normal] font-semibold text-bg">
                    Join
                  </span>
                </button>
              </span>
            </div>
            {ranged.map((r) => (
              <FlagRowItem key={r.at} row={r} grouped onOpen={() => m.open(r)} onRemove={() => m.remove(r)} />
            ))}
          </section>
        )}

        {clipped.length > 0 && (
          <>
            <button
              type="button"
              aria-expanded={m.clippedOpen}
              onClick={m.toggleClipped}
              className="mx-[10px] flex h-target w-[calc(100%-20px)] items-center justify-between px-[4px] text-meta leading-[normal] text-fg-dim hover:text-fg"
            >
              Clipped · {clipped.length}
              <span className={"inline-flex " + (m.clippedOpen ? "rotate-180" : "")}>
                <IconChevronDown />
              </span>
            </button>
            {m.clippedOpen && clipped.map((r) => <FlagRowItem key={r.at} row={r} onOpen={() => m.open(r)} onRemove={() => m.remove(r)} />)}
          </>
        )}
      </div>

      {m.canTrim && (
        <div className="flex-none px-[10px] pb-[10px] pt-[8px]">
          <button
            type="button"
            aria-label="Trim next flag (N)"
            onClick={m.trimNext}
            className="flex h-target w-full items-center justify-center gap-[8px] rounded-[22px] bg-ice text-body leading-[normal] font-semibold text-bg"
          >
            Trim next flag
            <span className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-chip border border-bg-overlay-60 px-[5px] text-meta leading-[normal] font-semibold text-bg">
              N
            </span>
          </button>
          <p className="m-[0px] mt-[6px] text-center text-meta leading-[normal] text-fg-dim">Opens 30 seconds around it. Trim, then Clip.</p>
        </div>
      )}
    </div>
  );
}
