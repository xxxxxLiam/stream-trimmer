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
import { availableDestinations, clipReason, clipSections } from "../utils/clipDestination";
import { usePickedRange } from "./usePickedRange";
import { useClipDestination } from "./useClipDestination";

export function useClipController(opts: { listenForKey?: boolean } = {}) {
  const { downloading } = useClipperContext();
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

  const hasRange = range !== null;
  const reason = clipReason({ hasRange, segments: segments.length, busy: !!downloading });
  const toCut = clipSections(segments, range);

  const clip = () => {
    if (!reason) host.cutSegments(toCut);
  };
  const clipRef = useRef(clip);
  clipRef.current = clip;

  // Cmd/Ctrl+Enter. Only one Clip button owns the key.
  useEffect(() => {
    if (!opts.listenForKey || !tabActive) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        clipRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opts.listenForKey, tabActive]);

  return {
    reason,
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
