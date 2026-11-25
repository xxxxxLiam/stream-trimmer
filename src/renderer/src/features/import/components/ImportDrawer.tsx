/**
 * File: ImportDrawer.tsx
 * Path: src/renderer/src/features/import/components/ImportDrawer.tsx
 * Description: Import moments (ImportDialog.dc.html 04.2): a 440px right drawer over a dimmed
 *   workspace. Rows grouped by video, a "Needs a look" group with one action each, and one Ice
 *   button whose label is the count. Esc or a click outside closes it, so there is no Cancel.
 */
import { useEffect, useState } from "react";
import { Drawer } from "../../../shared/components/Drawer";
import { DrawerHeader, SectionLabel, drawerBody, outlineButton } from "../../../shared/components/DrawerRows";
import { formatLength, formatTimecode } from "../../../shared/utils/segments";
import { useImportController } from "../hooks/useImportController";
import { COPY_FORMAT } from "../utils/momentRows";

export type ImportDrawerProps = {
  /** The pasted rows; null when the drawer is closed. */
  text: string | null;
  onClose: () => void;
};

function Body({ text, onClose }: { text: string; onClose: () => void }) {
  // The pasted rows can also be typed or pasted here: the drawer opened from "Import moments" has
  // nothing yet. The box stays while the person is using it, and goes once there is a list to review.
  const [draft, setDraft] = useState(text);
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    setDraft(text);
    setTyping(false);
  }, [text]);
  const c = useImportController(draft, onClose);
  const videos = c.groups.length;
  const meta = [
    c.campaignName,
    `${videos} ${videos === 1 ? "video" : "videos"}`,
    ...(c.newCampaigns.length ? [`adds campaign ${c.newCampaigns.join(", ")}`] : []),
  ].filter(Boolean).join(" · ");
  const empty = c.count === 0 && c.flagged.length === 0;
  const showBox = empty || typing;

  return (
    <>
      <DrawerHeader title={`${c.count} ${c.count === 1 ? "moment" : "moments"}`} onClose={onClose} closeName="Import moments" />
      <div className={drawerBody}>
        <div className="flex items-center justify-between gap-[12px]">
          <span className="text-meta text-fg-dim">{empty ? "Paste rows from your sheet" : meta}</span>
          <button type="button" className="text-meta text-fg-dim underline hover:text-fg" onClick={() => void navigator.clipboard?.writeText(COPY_FORMAT)}>
            Copy format
          </button>
        </div>

        {showBox && (
          <textarea
            aria-label="Paste rows from your sheet"
            value={draft}
            onChange={(e) => {
              setTyping(true);
              setDraft(e.target.value);
            }}
            placeholder="Paste the rows your AI made: video, start, end, name, rating, topic, tier, campaign"
            className="h-[120px] w-full resize-none rounded-control border border-hairlineStrong bg-raised p-[12px] text-body leading-[normal] text-fg placeholder:text-fg-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-frost"
          />
        )}

        {c.groups.map((g) => (
          <section key={g.videoId} aria-label={g.videoId}>
            <SectionLabel>{g.videoId === c.openVideoId ? "This video" : g.videoId}</SectionLabel>
            <ul className="m-[0px] flex list-none flex-col p-[0px]">
              {g.rows.map((m) => (
                <li key={m.key} className="flex min-h-target items-center gap-[12px] border-b border-hairline">
                  <span className="min-w-[0px] flex-1 truncate text-body">{m.name || "Unnamed"}</span>
                  <span className="shrink-0 font-mono text-meta text-fg-dim">
                    {formatTimecode(m.start)} · {formatLength(m.end - m.start)}
                  </span>
                  {typeof m.rating === "number" && <span className="w-[24px] shrink-0 text-right text-meta text-fg-dim">{m.rating}</span>}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {c.flagged.length > 0 && (
          <section aria-label="Needs a look">
            <SectionLabel>Needs a look</SectionLabel>
            <ul className="m-[0px] flex list-none flex-col p-[0px]">
              {c.flagged.map((m) => (
                <li key={m.key} className="flex min-h-target items-center gap-[12px] border-b border-hairline">
                  <span className="min-w-[0px] flex-1">
                    <span className="block truncate text-body">{m.name || `Line ${m.key}`}</span>
                    <span className="block text-meta text-error">{m.problem?.reason}</span>
                  </span>
                  {m.problem?.fix === "swap" ? (
                    <button type="button" className="text-meta text-ice hover:underline" onClick={() => c.swap(m.key)}>
                      Swap times
                    </button>
                  ) : (
                    <button type="button" className="text-meta text-fg-dim hover:text-fg" onClick={() => c.skip(m.key)}>
                      Skip
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="pt-[16px]">
          <button
            type="button"
            aria-disabled={!c.canBank}
            onClick={c.bank}
            className={`${c.canBank ? "bg-ice text-bg" : `${outlineButton} text-disabled`} h-target w-full rounded-pill px-[24px] text-body font-medium`}
          >
            {c.count > 0 ? `Bank ${c.count} ${c.count === 1 ? "moment" : "moments"}` : "Nothing to bank"}
          </button>
        </div>
      </div>
    </>
  );
}

export default function ImportDrawer({ text, onClose }: ImportDrawerProps) {
  const open = text !== null;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (text === null) return null;
  return (
    <div id="ui-import-drawer" className="absolute inset-0 z-40">
      <div data-testid="import-backdrop" className="absolute inset-0 bg-bg-overlay-60" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 max-w-full overflow-y-auto">
        <Drawer label="Import moments">
          <Body text={text} onClose={onClose} />
        </Drawer>
      </div>
    </div>
  );
}
