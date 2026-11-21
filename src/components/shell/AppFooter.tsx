/**
 * File: AppFooter.tsx
 * Path: src/components/shell/AppFooter.tsx
 * Description: 32px footer (BUILD-SPEC sections 3 and 5): campaign uses
 *   [format/quality] [Clips folder] [Data folder], counts readout on the right.
 *   Clips and Data are two DISTINCT folders.
 */
import { useCallback, useRef, useState } from "react";
import { useClipperContext } from "../../context/ClipperContext";
import { useCampaign } from "../../context/CampaignContext";
import FormatQualityFields from "../FormatQualityFields";
import { IconChevronDown, IconFolder } from "./icons";
import { useDismiss } from "./useDismiss";

const QUALITY_LABEL: Record<string, string> = {
  best: "Best",
  "1080": "1080p",
  "720": "720p",
  "480": "480p",
  "360": "360p",
  "320": "320 kbps",
  "192": "192 kbps",
  "128": "128 kbps",
};

function baseName(dir: string): string {
  return dir.split(/[\\/]/).filter(Boolean).pop() ?? dir;
}

function FormatChip() {
  const { format, quality } = useClipperContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        id="ui-footer-format"
        className="chip"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Format and quality"
      >
        <span>{format.toUpperCase()}</span>
        <span className="text-fg-dim">{QUALITY_LABEL[quality] ?? quality}</span>
        <IconChevronDown className="shrink-0 text-fg-dim" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Format and quality"
          className="popover absolute bottom-full left-0 z-40 mb-1 w-[300px]"
        >
          <FormatQualityFields />
        </div>
      )}
    </div>
  );
}

function FolderChip({
  id,
  label,
  dir,
  onPick,
  disabledReason,
}: {
  id: string;
  label: string;
  dir: string | null | undefined;
  onPick?: () => void;
  disabledReason?: string;
}) {
  const disabled = !onPick;
  return (
    <button
      type="button"
      id={id}
      className="chip"
      onClick={onPick}
      disabled={disabled}
      title={
        disabled
          ? disabledReason
          : dir
            ? `${label} folder: ${dir} (click to change)`
            : `Choose the ${label.toLowerCase()} folder`
      }
    >
      <IconFolder className="shrink-0 text-fg-dim" />
      <span className="text-fg-dim">{label}</span>
      <span className="max-w-[160px] truncate">{dir ? baseName(dir) : "Not set"}</span>
    </button>
  );
}

export type AppFooterProps = {
  /** Override the Clips picker. Defaults to the existing saveDir picker. */
  onPickClipsDir?: () => void;
  /** TODO(B4): campaign data-folder picker. Chip is disabled until provided. */
  onPickDataDir?: () => void;
};

export default function AppFooter({ onPickClipsDir, onPickDataDir }: AppFooterProps) {
  const { active } = useCampaign();
  const { isElectron, saveDir, pickSaveDir, downloads } = useClipperContext();

  const clipsDir = active?.clipsDir ?? saveDir;
  const usedCount = active
    ? Object.values(active.usedRanges).reduce((n, r) => n + r.length, 0)
    : 0;
  const pickClips = isElectron ? (onPickClipsDir ?? pickSaveDir) : undefined;

  return (
    <footer className="flex min-h-footer flex-wrap items-center gap-x-2 gap-y-1 border-t border-hairline px-3 py-1">
      <span className="text-meta text-fg-dim">
        {active ? `${active.name} uses` : "Uses"}
      </span>
      <FormatChip />
      <FolderChip
        id="ui-footer-clips"
        label="Clips"
        dir={clipsDir}
        onPick={pickClips}
        disabledReason="Browser downloads go to your Downloads folder. Use the desktop app to choose a folder."
      />
      <FolderChip
        id="ui-footer-data"
        label="Data"
        dir={active?.dataDir}
        onPick={onPickDataDir}
        disabledReason="Create a campaign to set where exported channel data is saved."
      />
      <div className="ml-auto flex items-center gap-3 text-meta text-fg-dim" aria-live="polite">
        <span>
          <span className="font-mono text-fg">{downloads.length}</span> saved
        </span>
        {active && (
          <span>
            <span className="font-mono text-fg">{usedCount}</span> ranges used
          </span>
        )}
      </div>
    </footer>
  );
}
