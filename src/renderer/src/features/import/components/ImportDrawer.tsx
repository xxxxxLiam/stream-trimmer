/**
 * File: ImportDrawer.tsx
 * Path: src/renderer/src/features/import/components/ImportDrawer.tsx
 * Description: Import moments (ImportDialog.dc.html 04.2, ImportEmpty.dc.html 04.2.1): a 440px right drawer over a dimmed
 *   workspace. Rows grouped by video, a "Needs a look" group with one action each, and one Ice
 *   button whose label is the count. Esc or a click outside closes it, so there is no Cancel.
 */
import { useEffect, useRef, useState } from "react";
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

const KEY_CAP = "inline-flex h-[22px] items-center rounded-chip border border-hairlineStrong bg-raised px-[6px] text-meta leading-[normal] text-fg";

function DropArea({ onRows }: { onRows: (text: string) => void }) {
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []); // so ⌘V works the moment it opens
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label="Paste your rows here, or drop a .csv or .txt file"
      onPaste={(e) => {
        const text = e.clipboardData.getData("text");
        if (text) {
          e.preventDefault();
          onRows(text);
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file && /\.(csv|txt)$/i.test(file.name)) void file.text().then(onRows);
      }}
      className={`flex h-[190px] flex-col items-center justify-center gap-[10px] rounded-control border-[1.5px] border-dashed bg-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-frost ${over ? "border-ice" : "border-hairlineStrong"}`}
    >
      <span className="text-[15px] font-medium leading-[normal]">Paste your rows here</span>
      <span className="inline-flex gap-[6px]">
        <span className={KEY_CAP}>⌘V</span>
        <span className={KEY_CAP}>Ctrl V</span>
      </span>
      <span className="text-meta leading-[normal] text-fg-dim">or drop a .csv or .txt file</span>
    </div>
  );
}

function Body({ text, onClose }: { text: string; onClose: () => void }) {
  // Opened from "Import moments" with nothing pasted (board 04.2.1): a drop area takes ⌘V / Ctrl V or a
  // .csv / .txt file. It turns into the checked list as soon as rows arrive.
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  const c = useImportController(draft, onClose);
  const [renaming, setRenaming] = useState<string | null>(null);
  const videos = c.groups.length;
  const meta = [
    c.campaignName,
    `${videos} ${videos === 1 ? "video" : "videos"}`,
    ...(c.newCampaigns.length ? [`adds campaign ${c.newCampaigns.join(", ")}`] : []),
  ].filter(Boolean).join(" · ");
  const empty = c.count === 0 && c.flagged.length === 0;

  return (
    <>
      <DrawerHeader title={empty ? "Import moments" : `${c.count} ${c.count === 1 ? "moment" : "moments"}`} onClose={onClose} closeName="Import moments" />
      <div className={drawerBody}>
        {empty ? (
          <>
            <p className="mx-[0px] mb-[11px] mt-[-2px] text-body leading-[1.5] text-fg-dim">
              Rows from your AI or a sheet: name, start, end, and a rating if you have one. Clipr checks them before anything goes into Export.
            </p>
            <DropArea onRows={setDraft} />
            <div className="mt-[5px] flex items-center justify-between">
              <button type="button" className="h-target text-meta text-fg-dim underline underline-offset-[3px] hover:text-fg" onClick={() => void navigator.clipboard?.writeText(COPY_FORMAT)}>
                Copy format
              </button>
              <span className="text-meta text-fg-dim">Pasting anywhere in Clipr works too</span>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-[12px]">
            <span className="text-meta text-fg-dim">{meta}</span>
            <button type="button" className="text-meta text-fg-dim underline hover:text-fg" onClick={() => void navigator.clipboard?.writeText(COPY_FORMAT)}>
              Copy format
            </button>
          </div>
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

        {c.flagged.some((m) => m.problem?.duplicate) && (
          <section aria-label="Duplicates">
            <SectionLabel>Duplicates</SectionLabel>
            <ul className="m-[0px] flex list-none flex-col p-[0px]">
              {c.flagged.filter((m) => m.problem?.duplicate).map((m) => (
                <li key={m.key} className="flex min-h-[64px] items-center gap-[10px] border-b border-hairline">
                  <span aria-hidden="true" className="size-[6px] flex-none rounded-[50%] bg-frost" />
                  <span className="min-w-[0px] flex-1">
                    <span className="block truncate text-body">{m.name || `Line ${m.key}`}</span>
                    <span className="block text-meta text-fg">{m.problem?.reason}</span>
                  </span>
                  <button type="button" className="h-[32px] rounded-pill border border-hairlineStrong px-[12px] text-meta text-fg hover:bg-hover" onClick={() => c.keep(m.key)}>
                    Keep
                  </button>
                  <button type="button" className="h-[32px] rounded-pill border border-ice px-[12px] text-meta text-ice hover:bg-ice-tint-12" onClick={() => c.skip(m.key)}>
                    Skip
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {c.flagged.some((m) => !m.problem?.duplicate) && (
          <section aria-label="Needs a look">
            <SectionLabel>Needs a look</SectionLabel>
            <ul className="m-[0px] flex list-none flex-col p-[0px]">
              {c.flagged.filter((m) => !m.problem?.duplicate).map((m) => (
                <li key={m.key} className="flex min-h-target items-center gap-[12px] border-b border-hairline">
                  <span className="min-w-[0px] flex-1">
                    {renaming === m.key ? (
                      <input
                        autoFocus
                        aria-label={`New name for line ${m.key}`}
                        defaultValue={m.name}
                        className="h-[28px] w-full rounded-control border border-hairlineStrong bg-bg px-[8px] text-body text-fg"
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            setRenaming(null);
                          } else if (e.key === "Enter") {
                            c.rename(m.key, e.currentTarget.value);
                            setRenaming(null);
                          }
                        }}
                        onBlur={(e) => {
                          c.rename(m.key, e.currentTarget.value);
                          setRenaming(null);
                        }}
                      />
                    ) : (
                      <span className="block truncate text-body">{m.name || `Line ${m.key}`}</span>
                    )}
                    <span className="block text-meta text-error">{m.problem?.reason}</span>
                  </span>
                  {m.problem?.name && (
                    <button type="button" className="text-meta text-ice hover:underline" onClick={() => setRenaming(m.key)}>
                      Rename
                    </button>
                  )}
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

        {!empty && (
          <div className="sticky bottom-[0px] z-10 border-t border-hairline bg-panel pb-[20px] pt-[16px]">
            <button
              type="button"
              aria-disabled={!c.canBank}
              onClick={c.bank}
              className={`${c.canBank ? "bg-ice text-bg" : `${outlineButton} text-disabled`} h-target w-full rounded-pill px-[24px] text-body font-medium`}
            >
              {c.count > 0 ? `Bank ${c.count} ${c.count === 1 ? "moment" : "moments"}` : "Nothing to bank"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/** Back to the + button the drawer was opened from, so the keyboard is not left on the page body. */
function focusAddButton() {
  window.setTimeout(() => {
    const add = document.querySelector<HTMLElement>('button[aria-label="Add a moment"]');
    add?.focus();
  }, 0);
}

export default function ImportDrawer({ text, onClose }: ImportDrawerProps) {
  const open = text !== null;
  const close = () => {
    onClose();
    focusAddButton();
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (text === null) return null;
  return (
    <div id="ui-import-drawer" className="absolute inset-0 z-40">
      <div data-testid="import-backdrop" className="absolute inset-0 bg-bg-overlay-60" onClick={close} />
      <div className="absolute inset-y-0 right-0 max-w-full overflow-y-auto">
        <Drawer label="Import moments" padClass="px-[20px] pb-[20px] pt-[10px]">
          <Body text={text} onClose={close} />
        </Drawer>
      </div>
    </div>
  );
}
