/**
 * File: TranscriptCopyMenu.tsx
 * Path: src/renderer/src/features/transcript/components/TranscriptCopyMenu.tsx
 * Description: The icon-only Copy button beside the Transcript search. Its menu copies the whole
 *   transcript, this clip's words, or the source link, or opens Symbols and phrases. The icon
 *   reads "Copied" for 2 s in place after a copy.
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "../../../shared/components/icons";
import PopoverMenu, { type MenuItem } from "../../../modules/layout/components/PopoverMenu";
import { usePanelHost } from "../../../modules/layout/hooks/PanelHostContext";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useSegmentsState } from "../../../shared/hooks/useSegmentsState";
import { parseTimestamp } from "../../../shared/utils/clip";
import { wholeTranscriptText, wordsInRanges, type Line } from "../utils/transcript";

export const COPIED_MS = 2000;

export default function TranscriptCopyMenu({ lines }: { lines: readonly Line[] }) {
  const { openSymbols } = usePanelHost();
  const { url, startText, endText } = useClipperContext();
  const { segments } = useSegmentsState();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

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
    { key: "link", label: "Source link", disabled: !url, onSelect: () => copy(url) },
    { kind: "separator", key: "sep" },
    { key: "symbols", label: "Symbols and phrases ›", onSelect: openSymbols },
  ];

  return (
    <span className="relative flex-none">
      <PopoverMenu label="Copy" items={items} align="end" triggerClassName="icon-btn h-target w-target" pressedWhenOpen>
        {copied ? (
          <span className="text-meta text-ice">Copied</span>
        ) : (
          <Icon>
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
            <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
          </Icon>
        )}
      </PopoverMenu>
    </span>
  );
}
