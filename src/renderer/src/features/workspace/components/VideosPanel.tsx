/**
 * File: VideosPanel.tsx
 * Path: src/renderer/src/features/workspace/components/VideosPanel.tsx
 * Description: The Videos panel (left group). One video is open at a time; the rest wait here.
 *   Pick one to open it, ⋯ on a row opens Mark done, Open on YouTube and Remove video, Done videos fold away with an 8 s Undo line. Logic lives in useVideosController.
 */
import VideoThumb from "../../../shared/components/VideoThumb";
import type { KeyboardEvent } from "react";
import ActionRow, { type RowAction } from "../../../shared/components/ActionRow";
import { IconClose, IconSearch } from "../../../shared/components/PanelIcons";
import { IconOpenOnSite, IconRemove, IconUndo } from "../../../shared/components/rowIcons";
import UndoRing, { UNDO_SECONDS } from "../../../shared/components/UndoRing";
import { useCountdown } from "../../../shared/hooks/useCountdown";
import { useVideosController, type VideoRow } from "../hooks/useVideosController";

type VideosController = ReturnType<typeof useVideosController>;

function subline(r: VideoRow): string {
  const status = r.waiting > 0 ? `${r.waiting} waiting` : r.done ? "all made" : "nothing waiting";
  return r.campaign ? `${r.campaign} · ${status}` : status;
}

function Row({ row, v }: { row: VideoRow; v: VideosController }) {
  const actions: RowAction[] = [
    row.done
      ? { key: "done", label: "Move back to open", icon: <IconUndo />, onSelect: () => v.undoneDone(row) }
      : { key: "done", label: "Mark done", icon: <IconClose />, onSelect: () => v.doneVideo(row) },
    {
      key: "youtube",
      label: "Open on YouTube",
      icon: <IconOpenOnSite />,
      onSelect: () => v.openOnYouTube(row),
      disabled: !row.videoId,
    },
    { key: "remove", label: "Remove video", icon: <IconRemove />, onSelect: () => v.removeVideo(row), danger: true },
  ];
  return (
    <ActionRow
      id={`video:${row.id}`}
      name={row.title}
      actions={actions}
      className={"mx-[10px] mb-[6px] border " + (row.isOpen ? "border-ice shadow-row" : "border-transparent")}
    >
      <button
        type="button"
        onClick={() => v.toggleOpen(row)}
        aria-current={row.isOpen ? "true" : undefined}
        className="flex w-full min-w-[0px] items-center gap-[10px] p-[8px] text-left"
      >
        <VideoThumb videoId={row.videoId} />
        <span className="min-w-[0px]">
          <span
            className={
              "block truncate text-body leading-[normal] font-medium " + (row.done ? "text-fg-dim" : "text-fg")
            }
          >
            {row.title}
          </span>
          <span className="mt-[2px] block text-meta leading-[normal] text-fg-dim">{subline(row)}</span>
        </span>
      </button>
    </ActionRow>
  );
}

/** "Removed … " with the 8 s ring, or "Moved … to Done · Undo". */
function UndoLine({ v }: { v: VideosController }) {
  const undo = v.undo;
  const left = useCountdown(undo ? undo.at : null, UNDO_SECONDS);
  if (!undo) return null;
  return (
    <div role="status" className="-mt-[3px] flex items-center gap-[6px] px-[14px] pt-[8px] text-meta leading-[normal] text-fg-dim">
      {undo.kind === "removed" ? `Removed "${undo.title}"` : `Moved "${undo.title}" to Done ·`}
      {undo.kind === "removed" ? (
        <UndoRing secondsLeft={left} onUndo={v.undoDone} icon={<IconUndo />} />
      ) : (
        <button type="button" onClick={v.undoDone} className="h-[32px] text-meta leading-[normal] text-ice">
          Undo
        </button>
      )}
    </div>
  );
}

export default function VideosPanel() {
  const v = useVideosController();
  const doneCount = v.rows.done.length;
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      v.submit();
    } else if (e.key === "Backspace" && !v.text && v.pills.length) {
      v.removePill(v.pills[v.pills.length - 1]);
    }
  };

  return (
    <div className="flex min-h-[0px] flex-1 flex-col">
      <div
        id="ui-source-chip"
        role="search"
        className="mx-[10px] mb-[9px] mt-[10px] flex h-target flex-none items-center gap-[8px] rounded-[22px] bg-raised px-[14px] text-body text-fg-dim"
      >
        <IconSearch />
        {v.pills.map((p) => (
          <button
            key={p}
            type="button"
            aria-label={`Remove filter ${p}`}
            onClick={() => v.removePill(p)}
            className="chip min-w-[0px] max-w-[96px] shrink truncate border-hairlineStrong"
          >
            {p}
            <IconClose width={12} height={12} />
          </button>
        ))}
        <input
          type="text"
          aria-label="Search your videos"
          value={v.text}
          onChange={(e) => v.setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={v.pills.length ? "" : "Search your videos"}
          autoComplete="off"
          spellCheck={false}
          className="min-w-[48px] flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-dim"
        />
        {v.filtered && (
          <button type="button" className="flex-none text-meta text-fg-dim hover:text-fg" onClick={v.clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      <div className="min-h-[0px] flex-1 overflow-y-auto">
        {v.opening && (
          <div
            role="status"
            className="relative mx-[10px] mb-[6px] overflow-hidden rounded-control border border-ice bg-raised p-[8px] shadow-row"
          >
            <div className="flex items-center gap-[10px]">
              <span aria-hidden="true" className="h-[26px] w-[44px] flex-none rounded-chip bg-hover" />
              <span className="min-w-[0px]">
                <span className="block text-body font-medium text-fg">Opening…</span>
                <span className="mt-[2px] block text-meta leading-[normal] text-fg-dim">Preparing</span>
              </span>
            </div>
            <span aria-hidden="true" className="absolute bottom-[0px] left-[0px] h-[2px] w-1/3 animate-pulse bg-ice" />
          </div>
        )}
        {v.rows.open
          .filter((r) => !(v.opening && r.isOpen))
          .map((r) => (
            <Row key={r.id} row={r} v={v} />
          ))}
        {v.filtered && v.rows.open.length + doneCount === 0 && (
          <p className="m-[0px] px-[14px] py-[8px] text-meta text-fg-dim">No video matches.</p>
        )}

        <UndoLine v={v} />

        {doneCount > 0 && (
          <button
            type="button"
            aria-expanded={v.doneOpen}
            onClick={v.toggleDone}
            className={`mx-[10px] mb-[3px] ${v.undo ? "mt-[6px]" : "mt-[9px]"} flex h-[32px] w-[calc(100%-20px)] items-center justify-between px-[4px] text-meta leading-[normal] text-fg-dim hover:text-fg`}
          >
            Done · {doneCount}
            <span className={"inline-flex " + (v.doneOpen ? "rotate-90" : "")}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M3.5 2l3 3-3 3" />
              </svg>
            </span>
          </button>
        )}
        {/* Closed, the fold still shows its first video (boards 03.2.1 and 03.2.6); open shows them all. */}
        {(v.doneOpen ? v.rows.done : v.rows.done.slice(0, 1)).map((r) => (
          <Row key={r.id} row={r} v={v} />
        ))}
      </div>
    </div>
  );
}
