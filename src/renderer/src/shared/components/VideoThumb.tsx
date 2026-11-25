/**
 * File: VideoThumb.tsx
 * Path: src/renderer/src/shared/components/VideoThumb.tsx
 * Description: A video's thumbnail in a list row (44 by 26, 5px radius). If one size fails to load it
 *   tries the next; with none it stays the hover-coloured block the boards draw.
 */
import { useState } from "react";
import { thumbnailSources } from "../utils/thumbnail";

export default function VideoThumb({ videoId }: { videoId: string | null | undefined }) {
  const sources = thumbnailSources(videoId);
  const [tried, setTried] = useState(0);
  const src = sources[tried];
  return (
    <span aria-hidden="true" className="relative block h-[26px] w-[44px] flex-none overflow-hidden rounded-chip bg-hover">
      {src && (
        <img
          key={src}
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => setTried((n) => n + 1)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </span>
  );
}
