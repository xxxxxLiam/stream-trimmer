/**
 * File: useClipController.ts
 * Path: src/renderer/src/features/player/hooks/useClipController.ts
 * Description: The only hook the Clip button calls: whether Clip can run and why not, the click that
 *   makes the clip, Cmd/Ctrl+Enter, and the where-clips-go choice.
 */
import { useEffect, useRef, useState } from "react";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { usePanelHost } from "../../../modules/layout/hooks/PanelHostContext";
import { useSegmentsState } from "../../../shared/hooks/useSegmentsState";
import { useIsTabActive } from "../../workspace/hooks/WorkspaceContext";
import { availableDestinations, clipReason, clipSections, sectionsLength } from "../utils/clipDestination";
import { dialogOpen } from "../../../shared/utils/dialogOpen";
import { usePickedRange } from "./usePickedRange";
import { useClipDestination } from "./useClipDestination";

export function useClipController(opts: { listenForKey?: boolean } = {}) {
  const range = usePickedRange();
  const host = usePanelHost();
  const { segments } = useSegmentsState();
  const tabActive = useIsTabActive();
  const [destination, setDestination] = useClipDestination();
  const [menuOpen, setMenuOpen] = useState(false);

  // Which editors this system offers (Final Cut is not offered on Windows). Until it answers, all.
  const [offered, setOffered] = useState<string[] | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void window.electronAPI?.editor?.installed().then((r) => {
      if (live && r.offered) setOffered(r.offered);
    });
    return () => {
      live = false;
    };
  }, []);

  const { startText, endText } = useClipperContext();
  const hasRange = range !== null;
  const toCut = clipSections(segments, range);
  const reason = clipReason({
    hasRange,
    segments: segments.length,
    totalSeconds: sectionsLength(toCut),
    startSet: startText.trim() !== "",
    endSet: endText.trim() !== "",
  });

  // B2-9: Ctrl+Enter while Clip is blocked shows the same line the dimmed button shows on hover.
  const [reasonShown, setReasonShown] = useState(false);
  useEffect(() => {
    if (!reasonShown) return;
    const id = window.setTimeout(() => setReasonShown(false), 4000);
    return () => window.clearTimeout(id);
  }, [reasonShown]);
  useEffect(() => {
    if (!reason) setReasonShown(false);
  }, [reason]);

  const clip = () => {
    if (reason) return setReasonShown(true);
    host.cutSegments(toCut);
  };
  const clipRef = useRef(clip);
  clipRef.current = clip;

  // Cmd/Ctrl+Enter. Only one Clip button owns the key.
  useEffect(() => {
    if (!opts.listenForKey || !tabActive) return;
    const onKey = (e: KeyboardEvent) => {
      // F3-1: with a drawer or dialog open (Help's search, the report note) the key belongs to it, not to a clip behind it.
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !dialogOpen()) {
        e.preventDefault();
        clipRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opts.listenForKey, tabActive]);

  return {
    reason,
    reasonShown,
    clip,
    hasRange,
    destination,
    setDestination: (d: Parameters<typeof setDestination>[0]) => {
      setDestination(d);
      setMenuOpen(false);
    },
    destinations: availableDestinations(offered),
    menuOpen,
    toggleMenu: () => setMenuOpen((v) => !v),
    closeMenu: () => setMenuOpen(false),
  };
}
