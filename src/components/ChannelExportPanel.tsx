/**
 * File: ChannelExportPanel.tsx
 * Path: src/components/ChannelExportPanel.tsx
 * Description: Channel profile exporter — form, live progress, and result summary.
 */
import { motion } from "framer-motion";
import {
  Broadcast,
  CheckCircleFill,
  Download,
  FolderSymlink,
  X,
} from "react-bootstrap-icons";
import { useChannelExportContext } from "../context/ChannelExportContext";
import { useClipperContext } from "../context/ClipperContext";
import DestinationSelector from "./DestinationSelector";
import {
  CHANNEL_LIMIT_MAX,
  CHANNEL_LIMIT_MIN,
  type ChannelContentType,
} from "../lib/channel";

const CONTENT_TYPES: { value: ChannelContentType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "shorts", label: "Shorts" },
  { value: "longform", label: "Long-form" },
];

function ProgressPanel() {
  const { progress, cancelExport } = useChannelExportContext();
  const total = progress?.total ?? 0;
  const current = progress?.current ?? 0;
  const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  const phaseLabel =
    progress?.phase === "listing"
      ? "Reading the channel listing"
      : progress?.phase === "metadata"
        ? `Video details ${current} of ${total}`
        : progress?.phase === "details"
          ? `Comments & transcripts — video ${current + 1} of ${total}`
          : "Working";

  return (
    <div className="flex flex-col gap-2 rounded-row border border-hairline bg-panel-raised px-3 py-3">
      <div className="flex items-center gap-2 text-[12px] text-fg">
        <span className="truncate">{phaseLabel}</span>
        <button
          type="button"
          onClick={cancelExport}
          className="btn ml-auto shrink-0 px-2 py-1 text-[11px]"
          title="Stop and keep what's been collected"
        >
          <X size={12} />
          <span>Stop</span>
        </button>
      </div>
      {progress?.label && (
        <div className="truncate text-[11px] text-fg-faint">
          {progress.label}
        </div>
      )}
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-panel-hover">
        {total > 0 ? (
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-accent"
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          />
        ) : (
          <motion.div
            className="absolute inset-y-0 w-1/3 rounded-full bg-accent/70"
            animate={{ x: ["-100%", "300%"] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </div>
      <p className="text-[11px] text-fg-faint">
        Stopping keeps everything collected so far and still writes the CSVs.
      </p>
    </div>
  );
}

export default function ChannelExportPanel() {
  const {
    channelUrl,
    setChannelUrl,
    contentType,
    setContentType,
    limit,
    setLimit,
    includeComments,
    setIncludeComments,
    includeTranscripts,
    setIncludeTranscripts,
    exporting,
    error,
    result,
    startExport,
    revealResult,
    dismissResult,
  } = useChannelExportContext();
  const { isElectron, saveDir } = useClipperContext();
  const blocked = exporting || (isElectron && !saveDir);

  const minutes = Math.round(
    (limit * (includeComments ? 14 : 4) + (includeTranscripts ? limit * 3 : 0)) /
      60,
  );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center gap-2 text-[12px] text-fg-muted">
        <Broadcast size={13} />
        <span>Channel profile exporter</span>
      </div>

      <input
        value={channelUrl}
        onChange={(e) => setChannelUrl(e.target.value)}
        placeholder="https://www.youtube.com/@channelhandle"
        spellCheck={false}
        className="w-full rounded-row border border-hairline bg-panel-raised px-3 py-2 text-[13px] text-fg outline-none placeholder:text-fg-faint focus:border-accent/60"
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-row border border-hairline bg-panel-raised p-0.5">
          {CONTENT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setContentType(t.value)}
              className={`rounded-chip px-2.5 py-1 text-[12px] transition-colors ${
                contentType === t.value
                  ? "bg-accent text-white"
                  : "text-fg-muted hover:text-fg"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 rounded-row border border-hairline bg-panel-raised px-3 py-1.5 text-[12px] text-fg-muted">
          <span>Top</span>
          <input
            type="number"
            min={CHANNEL_LIMIT_MIN}
            max={CHANNEL_LIMIT_MAX}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="w-16 bg-transparent text-right tabular-nums text-fg outline-none"
          />
          <span>by views</span>
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-[12px] text-fg-muted">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeComments}
            onChange={(e) => setIncludeComments(e.target.checked)}
            className="accent-accent"
          />
          <span>Comments (top 50 per video)</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeTranscripts}
            onChange={(e) => setIncludeTranscripts(e.target.checked)}
            className="accent-accent"
          />
          <span>Transcripts</span>
        </label>
      </div>

      <DestinationSelector />

      {error && (
        <div
          className="rounded-row border border-accent/40 bg-accent/10 px-3 py-2 text-[12px] text-accent"
          role="alert"
        >
          {error}
        </div>
      )}

      {exporting ? (
        <ProgressPanel />
      ) : (
        <button
          type="button"
          onClick={startExport}
          disabled={blocked}
          className="btn-primary self-start text-[12px]"
        >
          <Download size={12} />
          <span>Export channel data</span>
        </button>
      )}

      {result && (
        <div className="flex items-start gap-3 rounded-row border border-hairline bg-panel-raised px-3 py-3">
          <CheckCircleFill size={15} className="mt-0.5 shrink-0 text-accent" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13px] text-fg">
              {result.cancelled ? "Partial export saved" : "Export complete"}
            </span>
            <span className="truncate text-[11px] text-fg-faint">
              {result.folder}
            </span>
            <span className="text-[11px] text-fg-faint">
              {result.videos} videos · {result.comments} comments ·{" "}
              {result.transcripts} transcript lines
            </span>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {result.path && (
              <button
                type="button"
                onClick={revealResult}
                className="btn text-[12px]"
              >
                <FolderSymlink size={12} />
                <span>Open folder</span>
              </button>
            )}
            <button
              type="button"
              onClick={dismissResult}
              className="rounded-chip p-1 text-fg-faint hover:bg-panel-hover hover:text-fg"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-fg-faint">
        Everything here is public data read locally with yt-dlp — views, likes,
        comment counts, comment text, and captions. Dislikes are not published
        by YouTube and can't be exported. A {limit}-video run takes roughly{" "}
        {Math.max(1, minutes)} minutes and can be stopped at any point; videos
        with comments disabled or no captions are noted in video-status.csv.
      </p>
    </div>
  );
}
