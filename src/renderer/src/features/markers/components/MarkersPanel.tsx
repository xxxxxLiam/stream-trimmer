/**
 * File: MarkersPanel.tsx
 * Path: src/renderer/src/features/markers/components/MarkersPanel.tsx
 * Description: The Markers panel (left group, closed by default). A review list of the flags
 *   dropped while watching: time and the words said there. Flags with a range sit in one Ice
 *   group with a Join tag; clipped flags fold into "Clipped · N". Trim next flag (N) at the bottom.
 */
import { IconChevronDown } from "../../../shared/components/PanelIcons";
import { formatTimestamp } from "../../../shared/utils/clip";
import { useMarkersController } from "../hooks/useMarkersController";
import type { FlagRow } from "../utils/markers";

function Row({ row, onOpen, grouped }: { row: FlagRow; onOpen: () => void; grouped?: boolean }) {
  const time = formatTimestamp(row.at);
  return (
    <button
      type="button"
      aria-label={`Flag at ${time}${row.words ? `: ${row.words}` : ""}`}
      onClick={onOpen}
      className={
        "flex min-h-target items-baseline gap-[10px] px-[10px] py-2 text-left text-body text-fg " +
        (grouped
          ? "w-full border-t border-hairline"
          : "mx-[10px] my-[3px] w-[calc(100%-20px)] rounded-control bg-raised")
      }
    >
      <span className="flex-none text-meta tabular-nums text-fg-dim">{time}</span>
      <span>{row.words}</span>
    </button>
  );
}

export default function MarkersPanel() {
  const m = useMarkersController();
  const { open, ranged, clipped } = m.groups;

  if (m.empty) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
        <p className="m-0 text-body text-fg-dim">No flags yet. Press M while watching to drop one.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto" tabIndex={0} aria-label="Flags">
        <div className="h-[6px]" />
        {open.map((r) => (
          <Row key={r.at} row={r} onOpen={() => m.open(r)} />
        ))}

        {ranged.length > 0 && (
          <section aria-label="Both have a range" className="mx-[10px] mb-[3px] mt-[6px] overflow-hidden rounded-control border border-ice">
            <div className="flex h-target items-center pl-[10px]">
              <span className="text-meta text-ice">Both have a range</span>
              <span className="ml-auto">
                <button
                  type="button"
                  aria-label="Join: make one clip from both"
                  onClick={m.join}
                  className="inline-flex h-target items-center px-[6px]"
                >
                  <span className="inline-flex h-6 items-center rounded-[12px] bg-ice px-[10px] text-meta font-semibold text-bg">
                    Join
                  </span>
                </button>
              </span>
            </div>
            {ranged.map((r) => (
              <Row key={r.at} row={r} grouped onOpen={() => m.open(r)} />
            ))}
          </section>
        )}

        {clipped.length > 0 && (
          <>
            <button
              type="button"
              aria-expanded={m.clippedOpen}
              onClick={m.toggleClipped}
              className="mx-[10px] flex h-target w-[calc(100%-20px)] items-center justify-between px-1 text-meta text-fg-dim hover:text-fg"
            >
              Clipped · {clipped.length}
              <span className={"inline-flex " + (m.clippedOpen ? "rotate-180" : "")}>
                <IconChevronDown />
              </span>
            </button>
            {m.clippedOpen && clipped.map((r) => <Row key={r.at} row={r} onOpen={() => m.open(r)} />)}
          </>
        )}
      </div>

      {m.canTrim && (
        <div className="flex-none px-[10px] pb-[10px] pt-2">
          <button
            type="button"
            aria-label="Trim next flag (N)"
            onClick={m.trimNext}
            className="flex h-target w-full items-center justify-center gap-2 rounded-[22px] bg-ice text-body font-semibold text-bg"
          >
            Trim next flag
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-chip border border-bg-overlay-60 px-[5px] text-meta font-semibold text-bg">
              N
            </span>
          </button>
          <p className="m-0 mt-[6px] text-center text-meta text-fg-dim">Opens 30 seconds around it. Trim, then Clip.</p>
        </div>
      )}
    </div>
  );
}
