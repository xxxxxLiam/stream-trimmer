/**
 * File: useSuggestedName.ts
 * Path: src/renderer/src/features/player/hooks/useSuggestedName.ts
 * Description: The engine's suggested name for the clip being built. Builds the phrase table once per
 *   transcript, then asks for a name when the sections change (after a short pause). Null until a
 *   name arrives or when the engine isn't offered, so the Clips lane keeps its time-based name.
 */
import { useEffect, useState } from "react";
import type { Range } from "../../../shared/utils/segments";

type Line = { start: number; end: number; text: string };

export function useSuggestedName(
  videoId: string | null | undefined,
  videoTitle: string,
  lines: readonly Line[] | null | undefined,
  sections: readonly Range[],
  existing: readonly string[],
): string | null {
  const [ready, setReady] = useState<string | null>(null);
  const [name, setName] = useState<{ key: string; value: string } | null>(null);
  const api = typeof window !== "undefined" ? window.electronAPI?.clipNames : undefined;

  useEffect(() => {
    if (!api || !videoId || !lines?.length) return;
    let live = true;
    api.prepare({ videoId, lines: lines.map(({ start, end, text }) => ({ start, end, text })) })
      .then((r) => { if (live && r?.ok) setReady(videoId); })
      .catch(() => {});
    return () => { live = false; };
  }, [api, videoId, lines]);

  const key = sections.map((s) => `${s.start}-${s.end}`).join(",");
  const existingKey = existing.join("\u0000");
  useEffect(() => {
    if (!api || !videoId || ready !== videoId || !sections.length) return;
    let live = true;
    const timer = setTimeout(() => {
      api.suggest({
        videoId,
        ranges: sections.map(({ start, end }) => ({ start, end })),
        videoTitle,
        existing: [...existing],
      })
        .then((r) => { if (live && r?.ok && r.name) setName({ key, value: r.name }); })
        .catch(() => {});
    }, 300);
    return () => { live = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, videoId, ready, key, videoTitle, existingKey]);

  return name && name.key === key && sections.length ? name.value : null;
}
