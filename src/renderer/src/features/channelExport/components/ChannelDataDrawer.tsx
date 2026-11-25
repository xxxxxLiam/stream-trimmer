/**
 * File: ChannelDataDrawer.tsx
 * Path: src/renderer/src/features/channelExport/components/ChannelDataDrawer.tsx
 * Description: Channel data (ChannelExport1Setup.dc.html): a 440px right sidebar opened by pasting a
 *   channel link or from the Videos menu. The channel link, "Top N by views" (long-form only), the two
 *   files you get, a one-line estimate and one Ice Start export. Start closes the sidebar; the run
 *   continues and shows as a row at the top of Videos. Owner-only: it is rendered only in the owner build.
 */
import { useEffect } from "react";
import { FileEarmarkText } from "react-bootstrap-icons";
import { Drawer } from "../../../shared/components/Drawer";
import { DrawerHeader, outlineButton } from "../../../shared/components/DrawerRows";
import { redact } from "../../../shared/utils/diagnostics";
import { useChannelDataController } from "../hooks/useChannelDataController";

/** The failure line. Server and yt-dlp text can carry cookies, tokens, signed URLs, the user's email and
 *  home path, so it is redacted exactly like the download failure (F-7). */
export function ExportErrorAlert({ error }: { error: string }) {
  return (
    <div className="rounded-control border border-error px-[12px] py-[8px] text-meta text-error" role="alert">
      {redact(error)}
    </div>
  );
}

const section = "border-b border-hairline py-[12px]";
const stepBtn = "inline-flex size-target items-center justify-center rounded-control text-fg hover:bg-hover";

const FileIcon = () => (
  <span className="flex size-[30px] flex-none items-center justify-center rounded-control bg-raised text-frost">
    <FileEarmarkText width={14} height={14} aria-hidden="true" focusable="false" />
  </span>
);

function Body({ onClose }: { onClose: () => void }) {
  const c = useChannelDataController(true, onClose);
  return (
    <>
      <DrawerHeader title="Channel data" closeName="Channel data" onClose={onClose} />
      <p className="m-[0px] mb-[4px] mt-[2px] text-body leading-[1.5] text-fg-dim">
        Find which of a channel’s videos are worth clipping. Public data only, collected on this computer.
      </p>

      <div className={section}>
        <div className="mb-[8px] flex min-h-[20px] items-center text-body font-medium leading-[normal]">Channel</div>
        <input
          id="ui-channel-link"
          aria-label="Channel link"
          value={c.channelUrl}
          onChange={(e) => c.setChannelUrl(e.target.value)}
          placeholder="Paste a channel link"
          className="box-border h-target w-full rounded-control border border-hairlineStrong bg-bg px-[12px] text-body leading-[normal] text-fg outline-none"
        />
      </div>

      <div className={section}>
        <div className="mb-[8px] flex min-h-target items-center justify-between gap-[12px]">
          <span className="text-body font-medium leading-[normal]">Which videos</span>
          <span className="inline-flex items-center gap-[8px] text-body leading-[normal]">
            Top
            <span role="group" aria-label="How many videos" className="inline-flex items-center rounded-control border border-hairlineStrong bg-raised">
              <button type="button" aria-label="Fewer videos" onClick={c.fewer} className={stepBtn}>−</button>
              <span className="min-w-[40px] text-center font-medium">{c.count}</span>
              <button type="button" aria-label="More videos" onClick={c.more} className={stepBtn}>+</button>
            </span>
            by views
          </span>
        </div>
        <div className="text-meta leading-[1.45] text-fg-dim">Long-form only. Shorts are already clips.</div>
      </div>

      <div className="py-[12px]">
        <div className="mb-[8px] flex min-h-[20px] items-center text-body font-medium leading-[normal]">You get</div>
        {[
          ["videos.csv", "Title, views, likes, upload date and tags, ranked by views"],
          ["transcripts.csv", "Every caption line with its time, for your AI to find moments"],
        ].map(([name, what]) => (
          <div key={name} className="flex min-h-target items-center gap-[10px]">
            <FileIcon />
            <div>
              <div className="text-body font-medium leading-[normal]">{name}</div>
              <div className="mt-[2px] text-meta leading-[1.35] text-fg-dim">{what}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-[14px] flex items-baseline gap-[8px]">
        <b className="text-section font-medium">{c.estimate}</b>
        <span className="text-meta text-fg-dim">Stop any time and the files keep what’s collected.</span>
      </div>
      {c.problem && (
        <div className="mt-[10px]">
          <ExportErrorAlert error={c.problem} />
        </div>
      )}
      <button
        id="ui-channel-start"
        type="button"
        aria-disabled={c.running}
        onClick={c.start}
        className="mt-[14px] h-target w-full rounded-[22px] bg-ice text-body font-medium leading-[normal] text-bg"
      >
        Start export
      </button>
      <div className="mt-[10px] text-center text-meta text-fg-dim">Saves to {c.savesTo}</div>

      {c.last && (
        <>
          <div className="mb-[6px] mt-[18px] text-meta text-fg-dim">Last export</div>
          <div className="box-border flex min-h-[60px] items-center gap-[10px] rounded-control bg-raised py-[8px] pl-[12px] pr-[8px]">
            <div className="min-w-0 flex-1">
              <div className="truncate text-body font-medium leading-[normal]">{c.last.name}</div>
              <div className="mt-[2px] text-meta leading-[1.35] text-fg-dim">{c.last.detail}</div>
            </div>
            {c.last.canOpen && (
              <button type="button" onClick={c.last.onOpen} className={`${outlineButton} flex-none rounded-[22px] px-[14px]`}>
                Open folder
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}

export default function ChannelDataDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div id="ui-channel-data-drawer" className="absolute inset-y-0 right-0 z-30 max-w-full overflow-y-auto">
      <Drawer label="Channel data" padClass="pl-[20px] pr-[21px] pb-[20px] pt-[12px]">
        <Body onClose={onClose} />
      </Drawer>
    </div>
  );
}
