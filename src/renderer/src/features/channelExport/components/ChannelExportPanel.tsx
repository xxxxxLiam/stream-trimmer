/**
 * File: ChannelExportPanel.tsx
 * Path: src/renderer/src/features/channelExport/components/ChannelExportPanel.tsx
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
import { useChannelExportContext } from "../hooks/ChannelExportContext";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { redact } from "../../../shared/utils/diagnostics";
import DestinationSelector from "./DestinationSelector";
import {
  CHANNEL_LIMIT_MAX,
  CHANNEL_LIMIT_MIN,
  PART_INFO,
  anyPartSelected,
  describeChannelLimit,
  type ChannelContentType,
} from "../utils/channel";

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
      ? "Reading the channel list"
      : progress?.phase === "metadata"
        ? `Video details ${current} of ${total}`
        : progress?.phase === "details"
          ? `Comments and transcripts, video ${current + 1} of ${total}`
          : "Working";

  return (
    <div className="flex flex-col gap-2 rounded-control border border-hairline bg-panel-raised px-3 py-3">
      <div className="flex items-center gap-2 text-[12px] text-fg">
        <span className="truncate">{phaseLabel}</span>
        <button
          id="ui-channel-stop"
          type="button"
          onClick={cancelExport}
          className="btn ml-auto shrink-0 px-2 py-1 text-meta"
          title="Stop and keep what is collected so far"
        >
          <X size={12} />
          <span>Stop</span>
        </button>
      </div>
      {progress?.label && (
        <div className="truncate text-meta text-fg-dim">
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
      <p className="text-meta text-fg-dim">
        Stop keeps everything collected so far and still writes the CSVs.
      </p>
    </div>
  );
}

/** The export's failure line. Server and yt-dlp text can carry cookies, tokens, signed URLs, the
 *  user's email and home path, so it is redacted exactly like the download failure (F-7). */
export function ExportErrorAlert({ error }: { error: string }) {
  return (
    <div
      className="rounded-control border border-accent/40 bg-accent/10 px-3 py-2 text-[12px] text-accent"
      role="alert"
    >
      {redact(error)}
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
    limitText,
    setLimitText,
    exportAll,
    setExportAll,
    parts,
    togglePart,
    fresh,
    setFresh,
    exporting,
    error,
    result,
    startExport,
    revealResult,
    dismissResult,
  } = useChannelExportContext();
  const { isElectron, saveDir } = useClipperContext();
  const blocked =
    exporting || (isElectron && !saveDir) || !anyPartSelected(parts);

  // Rough per-video cost of each pass, in seconds. The details pass still
  // runs for a numeric limit even when its CSV is not wanted, because that is
  // where the view counts a "Top N by views" run ranks on come from.
  const detailsPass = parts.videoDetails || limit !== "all";
  const perVideoSeconds =
    (detailsPass ? 4 : 0) + (parts.comments ? 10 : 0) + (parts.transcripts ? 3 : 0);
  const minutes =
    typeof limit === "number"
      ? Math.max(1, Math.round((limit * perVideoSeconds) / 60))
      : null;
  // A whole-channel run, or a few hundred videos, is a very different thing
  // from the old 500-video ceiling — say so before it starts.
  const heavy = limit === "all" || (typeof limit === "number" && limit > 500);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center gap-2 text-[12px] text-fg-dim">
        <Broadcast size={13} />
        <span>Channel profile exporter</span>
      </div>

      <input
        value={channelUrl}
        onChange={(e) => setChannelUrl(e.target.value)}
        placeholder="https://www.youtube.com/@channelhandle"
        spellCheck={false}
        className="w-full rounded-control border border-hairline bg-panel-raised px-3 py-2 text-[13px] text-fg outline-none placeholder:text-fg-dim focus:border-accent/60"
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-control border border-hairline bg-panel-raised p-0.5">
          {CONTENT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setContentType(t.value)}
              className={`rounded-chip px-2.5 py-1 text-[12px] transition-colors ${
                contentType === t.value
                  ? "bg-accent text-white"
                  : "text-fg-dim hover:text-fg"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label
          className="flex items-center gap-2 rounded-control border border-hairline bg-panel-raised px-3 py-1.5 text-[12px] text-fg-dim"
        >
          <span>Top</span>
          <input
            type="number"
            min={CHANNEL_LIMIT_MIN}
            max={CHANNEL_LIMIT_MAX}
            value={limitText}
            disabled={exportAll}
            onChange={(e) => setLimitText(e.target.value)}
            className="w-20 bg-transparent text-right tabular-nums text-fg outline-none disabled:text-disabled"
          />
          <span>by views</span>
        </label>
        <button
          type="button"
          onClick={() => setExportAll(!exportAll)}
          aria-pressed={exportAll}
          title="Export every video on the channel, not just the top N"
          className={`rounded-control border px-2.5 py-1.5 text-[12px] transition-colors ${
            exportAll
              ? "border-accent bg-accent text-white"
              : "border-hairline bg-panel-raised text-fg-dim hover:text-fg"
          }`}
        >
          Everything
        </button>
      </div>

      <div className="flex flex-col gap-2 rounded-control border border-hairline bg-panel-raised px-3 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[12px] text-fg">What to export</span>
          <span className="text-meta text-fg-dim">
            one CSV each. Untick what you don't need.
          </span>
        </div>
        {PART_INFO.map((part) => (
          <label
            key={part.key}
            className="flex items-start gap-2 text-[12px] text-fg-dim"
          >
            <input
              type="checkbox"
              checked={parts[part.key]}
              onChange={(e) => togglePart(part.key, e.target.checked)}
              className="mt-0.5 accent-accent"
            />
            <span className="min-w-0">
              <span className={parts[part.key] ? "text-fg" : undefined}>
                {part.label}
              </span>
              <span className="text-fg-dim">, {part.hint}</span>
            </span>
          </label>
        ))}
        {!anyPartSelected(parts) && (
          <p className="text-meta text-accent">
            Nothing selected. Tick at least one.
          </p>
        )}
        {!parts.videoDetails && limit === "all" && (
          <p className="text-meta leading-relaxed text-fg-dim">
            Without video details the run skips one lookup per video and
            finishes much faster.
          </p>
        )}
        {!parts.videoDetails && limit !== "all" && (
          <p className="text-meta leading-relaxed text-fg-dim">
            A "Top {limit === null ? "N" : limit} by views" run still reads view
            counts to rank the videos. They are not written to a CSV. Choose
            Everything to skip that too.
          </p>
        )}
        <p className="text-meta leading-relaxed text-fg-dim">
          summary.csv and video-status.csv are always written. They are a few
          kilobytes and show what the run did.
        </p>
      </div>

      <label
        className="flex items-center gap-2 text-[12px] text-fg-dim"
        title="A stopped export picks up where it left off. Tick this to collect every video again."
      >
        <input
          type="checkbox"
          checked={fresh}
          onChange={(e) => setFresh(e.target.checked)}
          className="accent-accent"
        />
        <span>Start over (ignore saved progress)</span>
      </label>

      {heavy && (
        <div className="rounded-control border border-hairline bg-panel-raised px-3 py-2 text-meta leading-relaxed text-fg-dim">
          {isElectron ? (
            <>
              A run this size takes hours. Rows are written to disk as they are
              collected and progress is saved per video. Stop any time and the
              next run carries on from where it left off.
            </>
          ) : (
            <>
              The browser holds the whole export in memory before it downloads,
              so a few thousand videos with transcripts can run it out. Use the
              desktop app for a whole channel.
            </>
          )}
        </div>
      )}

      <DestinationSelector />

      {error && <ExportErrorAlert error={error} />}

      {exporting ? (
        <ProgressPanel />
      ) : (
        <button
          id="ui-channel-start"
          type="button"
          onClick={startExport}
          disabled={blocked}
          className="btn-primary self-start text-[12px]"
        >
          <Download size={12} />
          <span>Export channel</span>
        </button>
      )}

      {result && (
        <div className="flex items-start gap-3 rounded-control border border-hairline bg-panel-raised px-3 py-3">
          <CheckCircleFill size={15} className="mt-0.5 shrink-0 text-accent" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13px] text-fg">
              {result.cancelled ? "Partial export saved" : "Export saved"}
            </span>
            <span className="truncate text-meta text-fg-dim">
              {result.folder}
            </span>
            <span className="text-meta text-fg-dim">
              {[
                `${result.videos} videos`,
                result.parts.comments && `${result.comments} comments`,
                result.parts.transcripts &&
                  `${result.transcripts} transcript lines`,
              ]
                .filter(Boolean)
                .join(" · ")}
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
                <span>Show folder</span>
              </button>
            )}
            <button
              type="button"
              onClick={dismissResult}
              className="rounded-chip p-1 text-fg-dim hover:bg-panel-hover hover:text-fg"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <p className="text-meta leading-relaxed text-fg-dim">
        Reads public data on this computer: views, likes, comment counts,
        comment text and captions. YouTube does not publish dislikes.{" "}
        {limit === null
          ? "Set how many videos to export above."
          : limit === "all"
            ? `Exporting ${describeChannelLimit(limit)} takes about ${perVideoSeconds} seconds per video. A few thousand videos is several hours.`
            : `A run of ${describeChannelLimit(limit)} takes about ${minutes} minutes.`}{" "}
        Stop any time. Videos with comments off or no captions are listed in
        video-status.csv.
      </p>
    </div>
  );
}
