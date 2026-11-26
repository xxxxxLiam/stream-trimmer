/**
 * File: ClipButton.tsx
 * Path: src/renderer/src/features/player/components/ClipButton.tsx
 * Description: The split Clip button. The label always says Clip; the arrow opens where clips go
 *   (Save to folder or one editor, ticked, sticky). When Clip can't run it is dimmed but still
 *   focusable, and the reason shows on hover and on keyboard focus.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import SplitButton from "../../../shared/components/SplitButton";
import Tooltip from "../../../shared/components/Tooltip";
import { Menu, MenuItem, MenuLabel } from "../../../shared/components/Menu";
import { useClipController } from "../hooks/useClipController";
import { menuTarget } from "../utils/menuKeys";
import { CaretIcon } from "./TransportIcons";
import { Check2, ChevronLeft, ChevronRight, Folder } from "react-bootstrap-icons";
import { useNextClipName } from "../../../modules/layout/hooks/useNextClipName";
import { audioButtonLabel, makesText, nameForLanguage, planLanguages, shortenPath, toggleLanguage, type AudioTrackInfo } from "../../../shared/utils/audioLanguages";
import { destinationLabel } from "../utils/clipDestination";

/** What the Clip arrow's second pages need: the clips folder and the video's audio languages. Absent = the plain list. */
export type ClipOptions = {
  folder: string;
  /** Opens the folder picker; absent in the browser. Resolves to a problem sentence, or nothing. */
  onPickFolder?: () => void | Promise<unknown>;
  tracks?: AudioTrackInfo[];
  selectedLanguages?: string[];
  onSelectLanguages: (next: string[]) => void;
};

export default function ClipButton({ openUp = false, listenForKey = false, options }: { openUp?: boolean; listenForKey?: boolean; options?: ClipOptions }) {
  const c = useClipController({ listenForKey });
  const tipId = useId();
  const arrowRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const wasOpen = useRef(false);
  const [page, setPage] = useState<"root" | "where" | "audio">("root");
  const [problem, setProblem] = useState("");
  const clipName = useNextClipName();
  const hasDubs = !!options?.tracks?.some((t) => t.kind !== "original");
  const paged = !!options;

  // The menu always opens on its first page.
  useEffect(() => {
    if (c.menuOpen) setPage("root");
    else setProblem("");
  }, [c.menuOpen]);

  // Opening, or turning a page, moves focus to the ticked item (else the first row); closing returns it to the arrow.
  useEffect(() => {
    if (c.menuOpen) {
      const rows = menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]');
      const ticked = menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
      (ticked ?? rows?.[0])?.focus();
    } else if (wasOpen.current && (!document.activeElement || document.activeElement === document.body)) {
      arrowRef.current?.focus();
    }
    wasOpen.current = c.menuOpen;
  }, [c.menuOpen, page]);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!c.menuOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      c.closeMenu();
      arrowRef.current?.focus();
      return;
    }
    const rows = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    const to = menuTarget(rows.indexOf(document.activeElement as HTMLElement), rows.length, e.key);
    if (to !== null) {
      e.preventDefault();
      rows[to]?.focus();
    }
  };

  return (
    <span id="ui-cut" className="group relative inline-flex" onKeyDown={onKeyDown}>
      <SplitButton
        label="Clip"
        onPress={c.clip}
        onOpenMenu={c.toggleMenu}
        menuIcon={<CaretIcon />}
        disabled={!!c.reason}
        glowing={c.hasRange && !c.reason}
        menuExpanded={c.menuOpen}
        menuRef={arrowRef}
        describedBy={c.reason ? tipId : undefined}
      />
      {c.reason ? (
        <Tooltip
          id={tipId}
          className={`pointer-events-none absolute right-[0px] z-20 ${c.reasonShown ? "inline-flex" : "hidden group-focus-within:inline-flex group-hover:inline-flex"} ${openUp ? "bottom-full mb-[10px]" : "top-full mt-[4px]"}`}
        >
          {c.reason}
        </Tooltip>
      ) : null}
      {c.menuOpen ? (
        <Menu
          ref={menuRef}
          label="Where clips go"
          className={`absolute right-[0px] z-30 ${openUp ? "bottom-full mb-[8px]" : "top-full mt-[8px]"}`}
        >
          {paged && page === "root" ? (
            <>
              {c.savesTo ? (
                <SavesRow where={c.savesTo} />
              ) : (
                <MenuItem trailing={<RowValue value={c.destination === "folder" ? shortenPath(options.folder) || "Choose a folder" : destinationLabel(c.destination)} />} onClick={() => setPage("where")}>
                  Where clips go
                </MenuItem>
              )}
              {hasDubs ? (
                <MenuItem trailing={<RowValue value={audioButtonLabel(options.tracks!, options.selectedLanguages)} />} onClick={() => setPage("audio")}>
                  Audio
                </MenuItem>
              ) : null}
            </>
          ) : null}
          {paged && page !== "root" ? (
            <MenuItem leading={<ChevronLeft width={14} height={14} aria-hidden="true" focusable="false" />} onClick={() => setPage("root")}>
              {page === "where" ? "Where clips go" : "Audio"}
            </MenuItem>
          ) : null}
          {!paged && c.savesTo ? <SavesRow where={c.savesTo} /> : null}
          {(!paged && !c.savesTo) || (paged && page === "where") ? (
            <div className="max-h-[320px] overflow-y-auto">
              {!paged ? <MenuLabel>Where clips go</MenuLabel> : null}
              {c.destinations.map((d) => (
                <MenuItem
                  key={d.id}
                  checked={c.destination === d.id}
                  leading={<Check2 width={14} height={14} aria-hidden="true" focusable="false" />}
                  disabled={d.soon}
                  aria-disabled={d.soon || undefined}
                  trailing={d.soon ? "Coming soon" : d.id === "folder" && options ? shortenPath(options.folder) || undefined : undefined}
                  className={d.soon ? "text-disabled hover:bg-transparent" : undefined}
                  onClick={async () => {
                    c.setDestination(d.id);
                    if (d.id === "folder" && options?.onPickFolder) {
                      const r = await options.onPickFolder();
                      setProblem(typeof r === "string" ? r : "");
                    }
                  }}
                >
                  {d.id === "folder" && paged ? "Folder on this computer" : d.label}
                </MenuItem>
              ))}
              {problem ? (
                <div role="alert" className="px-2.5 py-1.5 text-meta text-error">
                  {problem}
                </div>
              ) : null}
            </div>
          ) : null}
          {paged && page === "audio" ? (
            <div className="max-h-[320px] overflow-y-auto">
              {(options.tracks ?? []).map((t) => {
                const sel = options.selectedLanguages ?? [];
                const ticked = t.kind === "original" ? !sel.includes(`-${t.language}`) : sel.includes(t.language);
                return (
                  <MenuItem
                    key={t.language}
                    checked={ticked}
                    leading={<Check2 width={14} height={14} aria-hidden="true" focusable="false" />}
                    trailing={t.kind === "original" ? t.label : t.kind === "auto-dubbed" ? "Auto-dubbed" : "Creator dub"}
                    onClick={() => options.onSelectLanguages(toggleLanguage(options.tracks ?? [], options.selectedLanguages, t.language))}
                  >
                    {t.kind === "original" ? "Original" : t.label}
                  </MenuItem>
                );
              })}
              {clipName ? (
                <div className="px-2.5 py-1.5 text-meta text-fg-dim">
                  {(() => {
                    const plans = planLanguages(options.tracks, options.selectedLanguages);
                    return `${makesText(plans.length)}: ${plans.map((p) => nameForLanguage(clipName, p)).join(", ")}`;
                  })()}
                </div>
              ) : null}
            </div>
          ) : null}
        </Menu>
      ) : null}
    </span>
  );
}

/** Where this location saves (board: folder icon in fg-dim, the words in fg, one 44px line, not a button). */
function SavesRow({ where }: { where: string }) {
  return (
    <div className="flex h-target items-center gap-2.5 px-2.5 text-body text-fg">
      <Folder width={14} height={14} className="text-fg-dim" aria-hidden="true" focusable="false" />
      Saves to {where}
    </div>
  );
}

function RowValue({ value }: { value: string }) {
  return (
    <span className="inline-flex max-w-[150px] items-center gap-[4px]">
      <span className="truncate">{value}</span>
      <ChevronRight width={12} height={12} aria-hidden="true" focusable="false" />
    </span>
  );
}
