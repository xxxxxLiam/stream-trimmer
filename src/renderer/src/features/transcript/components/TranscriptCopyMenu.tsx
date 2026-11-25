/**
 * File: TranscriptCopyMenu.tsx
 * Path: src/renderer/src/features/transcript/components/TranscriptCopyMenu.tsx
 * Description: The icon-only Copy button beside the Transcript search. Its menu copies the whole
 *   transcript, this clip's words, or the source link, or opens Symbols and phrases. The icon
 *   reads "Copied" for 2 s in place after a copy.
 */
import { useEffect, useRef, useState } from "react";
import PopoverMenu, { type MenuItem } from "../../../modules/layout/components/PopoverMenu";
import { usePanelHost } from "../../../modules/layout/hooks/PanelHostContext";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useSegmentsState } from "../../../shared/hooks/useSegmentsState";
import { parseTimestamp } from "../../../shared/utils/clip";
import { wholeTranscriptText, wordsInRanges, type Line } from "../utils/transcript";
import { saveText, transcriptFileName } from "../../../shared/utils/saveText";
import { Copy } from "react-bootstrap-icons";

export const COPIED_MS = 2000;

export default function TranscriptCopyMenu({ lines }: { lines: readonly Line[] }) {
  const { openSymbols } = usePanelHost();
  const { url, startText, endText, info } = useClipperContext();
  const { segments } = useSegmentsState();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const [said, setSaid] = useState("");
  const download = async (text: string, kind: "whole" | "clip") => {
    const res = await saveText(transcriptFileName(info?.title, kind), text);
    setSaid(res.ok ? "Saved" : res.message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaid(""), COPIED_MS);
  };

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  const a = parseTimestamp(startText);
  const b = parseTimestamp(endText);
  const ranges = [
    ...segments.map((s) => ({ start: s.start, end: s.end })),
    ...(a != null && b != null && b > a ? [{ start: a, end: b }] : []),
  ];
  const clipWords = wordsInRanges(lines, ranges);

  const items: MenuItem[] = [
    { key: "whole", label: "Whole transcript", disabled: lines.length === 0, onSelect: () => copy(wholeTranscriptText(lines)) },
    { key: "clip", label: "This clip's words", disabled: !clipWords, onSelect: () => copy(clipWords) },
    { key: "whole-txt", label: "Download whole transcript (.txt)", disabled: lines.length === 0, onSelect: () => void download(wholeTranscriptText(lines), "whole") },
    { key: "clip-txt", label: "Download this clip's words (.txt)", disabled: !clipWords, onSelect: () => void download(clipWords, "clip") },
    { key: "link", label: "Source link", disabled: !url, onSelect: () => copy(url) },
    { kind: "separator", key: "sep" },
    { key: "symbols", label: "Symbols and phrases ›", onSelect: () => (window.electronAPI?.openSymbols ? void window.electronAPI.openSymbols() : openSymbols()) },
  ];

  return (
    <span className="relative flex-none">
      <PopoverMenu label="Copy" items={items} align="end" triggerClassName="icon-btn h-target w-target" pressedWhenOpen>
        {copied ? (
          <span className="text-meta text-ice">Copied</span>
        ) : said ? (
          <span className={`text-meta ${said === "Saved" ? "text-ice" : "text-error"}`}>{said}</span>
        ) : (
          <Copy width={16} height={16} aria-hidden="true" focusable="false" />
        )}
      </PopoverMenu>
    </span>
  );
}
