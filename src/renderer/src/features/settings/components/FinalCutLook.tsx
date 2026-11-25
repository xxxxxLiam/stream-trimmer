/**
 * File: FinalCutLook.tsx
 * Path: src/renderer/src/features/settings/components/FinalCutLook.tsx
 * Description: The "Your look" row in a campaign's Final Cut fields. With no saved look it is a drop
 *   zone ("Drop your Final Cut export, or choose a file"). With saved looks it is a row that opens a
 *   list: every saved look (this campaign's ticked), "No look", and "Upload a new look...". Says what
 *   was found in plain words, shows one sentence in error red when a file is no good, and opens the
 *   three steps for making the file in place. Logic-free.
 */
import { useState } from "react";

export type SavedLookRow = { id: string; name: string };

export type FinalCutLookProps = {
  saved: SavedLookRow[];
  currentId: string | null;
  /** Plain words for what the current look carries, e.g. "Scale 120%, Colour Board". */
  found: string;
  problem: string;
  /** One sentence when an old pasted look could not be moved; empty otherwise. */
  unreadNote?: string;
  open: boolean;
  guide: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onToggleOpen: () => void;
  onToggleGuide: () => void;
  onChoose: () => void;
  onFile: (file: File) => void;
  onPick: (id: string | null) => void;
  onRemove: (id: string) => void;
  /** Look id -> names of the campaigns that use it; those looks cannot be deleted. */
  usedBy: Record<string, string[]>;
};

const STEPS = [
  "In Final Cut, make a project with one clip. Add your usual colour, zoom and volume to that clip. Don't cut it.",
  "Choose File, then Export XML, and save it.",
  "Drop the saved file here, or click Choose file.",
];

const pill = "h-target rounded-[22px] border border-ice px-[16px] text-body leading-[normal] text-fg hover:bg-hover";

export default function FinalCutLook(p: FinalCutLookProps) {
  const [over, setOver] = useState(false);
  const current = p.saved.find((l) => l.id === p.currentId);
  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      const f = e.dataTransfer.files[0];
      if (f) p.onFile(f);
    },
  };
  return (
    <div className="flex flex-col gap-[8px]">
      <input
        ref={p.inputRef}
        type="file"
        accept=".fcpxml,.xml,.txt,.rtf"
        className="sr-only"
        tabIndex={-1}
        aria-label="Final Cut export file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) p.onFile(f);
          e.target.value = "";
        }}
      />
      <div className="flex items-center justify-between gap-[8px]">
        <span className="text-meta text-fg-dim">Your look</span>
        <button type="button" aria-expanded={p.guide} onClick={p.onToggleGuide} className="h-target bg-transparent text-meta text-fg-dim underline underline-offset-[3px]">
          How to make this file
        </button>
      </div>

      {p.guide && (
        <ol className="m-[0px] flex list-none flex-col gap-[8px] p-[0px]" aria-label="How to make your look file">
          {STEPS.map((t, i) => (
            <li key={t} className="flex gap-[8px] text-meta text-fg-dim">
              <span className="w-[16px] shrink-0 text-fg">{i + 1}</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
      )}

      {p.saved.length === 0 ? (
        <div
          {...dropProps}
          className={`flex min-h-[88px] flex-col items-center justify-center gap-[8px] rounded-control border border-dashed p-[12px] text-center ${over ? "border-ice bg-ice-tint-08" : "border-hairlineStrong bg-panel"}`}
        >
          <span className="text-body leading-[normal] text-fg">Drop your Final Cut export, or choose a file</span>
          <button type="button" className={pill} onClick={p.onChoose}>
            Choose file
          </button>
        </div>
      ) : (
        <div {...dropProps} className={`flex flex-col gap-[4px] rounded-control ${over ? "bg-ice-tint-08" : ""}`}>
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={p.open}
            onClick={p.onToggleOpen}
            className="flex h-target items-center gap-[8px] rounded-control border border-hairlineStrong bg-panel px-[12px] text-left text-body leading-[normal] text-fg"
          >
            <span className="flex-1 truncate">{current ? current.name : "No look"}</span>
            <span aria-hidden="true" className="text-fg-dim">▾</span>
          </button>
          {p.open && (
            <ul role="listbox" aria-label="Saved looks" className="m-[0px] flex list-none flex-col rounded-control border border-hairlineStrong bg-panel p-[4px]">
              {p.saved.map((l) => (
                <li key={l.id} className="flex items-center">
                  <button
                    type="button"
                    role="option"
                    aria-selected={l.id === p.currentId}
                    onClick={() => p.onPick(l.id)}
                    className="flex h-target flex-1 items-center gap-[8px] rounded-control px-[8px] text-left text-body leading-[normal] text-fg hover:bg-hover"
                  >
                    <span className="w-[14px] text-ice">{l.id === p.currentId ? "✓" : ""}</span>
                    <span className="truncate">{l.name}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${l.name}`}
                    aria-disabled={!!p.usedBy[l.id]}
                    title={p.usedBy[l.id] ? `Used by ${p.usedBy[l.id].join(", ")}` : undefined}
                    onClick={() => p.onRemove(l.id)}
                    className={`h-target px-[8px] text-meta ${p.usedBy[l.id] ? "text-disabled" : "text-fg-dim hover:text-fg"}`}
                  >
                    Delete
                  </button>
                </li>
              ))}
              <li>
                <button type="button" role="option" aria-selected={p.currentId === null} onClick={() => p.onPick(null)} className="flex h-target w-full items-center gap-[8px] rounded-control px-[8px] text-left text-body leading-[normal] text-fg hover:bg-hover">
                  <span className="w-[14px] text-ice">{p.currentId === null ? "✓" : ""}</span>
                  No look
                </button>
              </li>
              <li>
                <button type="button" onClick={p.onChoose} className="flex h-target w-full items-center rounded-control px-[8px] text-left text-body leading-[normal] text-fg hover:bg-hover">
                  <span className="w-[22px]" />
                  Upload a new look…
                </button>
              </li>
            </ul>
          )}
        </div>
      )}

      {p.unreadNote && !p.problem && <p className="m-[0px] text-meta text-fg-dim">{p.unreadNote}</p>}
      {p.found && !p.problem && <p className="m-[0px] text-meta text-fg-dim">Found: {p.found}</p>}
      {p.problem && (
        <p role="alert" className="m-[0px] text-meta text-error">
          {p.problem}
        </p>
      )}
    </div>
  );
}
