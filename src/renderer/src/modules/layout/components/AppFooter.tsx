/**
 * File: AppFooter.tsx
 * Path: src/renderer/src/modules/layout/components/AppFooter.tsx
 * Description: 32px footer (BUILD-SPEC sections 3 and 5): campaign uses
 *   [format/quality] [Clips folder] [Data folder], counts readout on the right.
 *   Clips and Data are two DISTINCT folders.
 */
import { useCallback, useRef, useState } from "react";
import { useClipperContext } from "../../clipper/hooks/ClipperContext";
import { useCampaign } from "../../../features/campaigns/hooks/CampaignContext";
import FormatQualityFields from "../../clipper/components/FormatQualityFields";
import { QUALITY_LABELS } from "../../clipper/utils/clipperTypes";
import { IconChevronDown, IconFolder } from "../../../shared/components/icons";
import { useDismissEffects } from "../../../shared/hooks/useDismissEffects";
import { CHANNEL_DATA_BUILT } from "../../../shared/utils/ownerGate";
import { useDataFolderVisibleState } from "../../../shared/hooks/useDataFolderVisibleState";

function baseName(dir: string): string {
  return dir.split(/[\\/]/).filter(Boolean).pop() ?? dir;
}

function FormatChip() {
  const { format, quality } = useClipperContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissEffects(ref, open, close);
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
        <span className="text-fg-dim">{QUALITY_LABELS[quality] ?? quality}</span>
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

type Pick = () => Promise<string | null | void> | void;

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
  onPick?: Pick;
  disabledReason?: string;
}) {
  const disabled = !onPick;
  return (
    <button
      type="button"
      id={id}
      className="chip"
      onClick={() => void onPick?.()}
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

/**
 * The data folder starts as a suggestion (a sibling "channel-data" next to Clips). Until the
 * user accepts or replaces it, the chip says so and opens a confirm step instead of picking.
 */
function DataChip({
  dir,
  confirmed,
  onPick,
  onConfirm,
  disabledReason,
}: {
  dir: string;
  confirmed: boolean;
  onPick?: Pick;
  onConfirm: () => void;
  disabledReason: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissEffects(ref, open, close);

  if (confirmed || !dir) {
    return (
      <FolderChip
        id="ui-footer-data"
        label="Data"
        dir={dir}
        onPick={onPick}
        disabledReason={disabledReason}
      />
    );
  }
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        id="ui-footer-data"
        className="chip"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={`Data folder: ${dir}. Confirm or choose another.`}
      >
        <IconFolder className="shrink-0 text-fg-dim" />
        <span className="text-fg-dim">Data</span>
        <span className="max-w-[160px] truncate">{baseName(dir)}</span>
        <span className="text-accent">Confirm</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Confirm the data folder"
          className="popover absolute bottom-full left-0 z-40 mb-1 flex w-[320px] flex-col gap-3"
        >
          <p className="m-0 text-body">
            {CHANNEL_DATA_BUILT
              ? "Exported channel data will save to this folder, kept apart from your clips."
              : "Data will save to this folder, kept apart from your clips."}
          </p>
          <p className="m-0 break-all font-mono text-meta text-fg-dim">{dir}</p>
          <div className="flex justify-end gap-2">
            {onPick && (
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  await onPick();
                  close();
                }}
              >
                Choose another
              </button>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => {
                onConfirm();
                close();
              }}
            >
              Use folder
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export type AppFooterProps = {
  /** Opens the clips-folder picker. Resolves to a problem to show, or null. */
  onPickClipsDir?: Pick;
  /** Opens the data-folder picker. Resolves to a problem to show, or null. */
  onPickDataDir?: Pick;
};

export default function AppFooter({ onPickClipsDir, onPickDataDir }: AppFooterProps) {
  const { active, folders, confirmDataDir, usedCount } = useCampaign();
  const { saveDir, downloads } = useClipperContext();
  const [problem, setProblem] = useState("");
  // Only the channel exporter uses the Data folder; without it the chip would ask for nothing.
  const showData = useDataFolderVisibleState();

  const wrap = (pick?: Pick): Pick | undefined =>
    pick
      ? async () => {
          const r = await pick();
          setProblem(typeof r === "string" ? r : "");
          return r;
        }
      : undefined;

  return (
    <footer className="flex min-h-footer flex-wrap items-center gap-x-2 gap-y-1 border-t border-hairline px-3 py-1">
      <span className="text-meta text-fg-dim">
        {active ? `${active.name} uses` : "Uses"}
      </span>
      <FormatChip />
      <FolderChip
        id="ui-footer-clips"
        label="Clips"
        dir={folders.clipsDir || saveDir}
        onPick={wrap(onPickClipsDir)}
        disabledReason="Browser downloads go to your Downloads folder. Use the desktop app to choose a folder."
      />
      {showData && (
        <DataChip
          dir={folders.dataDir}
          confirmed={folders.dataDirConfirmed}
          onPick={wrap(onPickDataDir)}
          onConfirm={confirmDataDir}
          disabledReason={
            CHANNEL_DATA_BUILT
              ? "Exported channel data saves to your Downloads folder in the browser. Use the desktop app to choose a folder."
              : "Data saves to your Downloads folder in the browser. Use the desktop app to choose a folder."
          }
        />
      )}
      {problem && (
        <span role="alert" className="text-meta text-accent">
          {problem}
        </span>
      )}
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
