/**
 * File: storyboard.ts
 * Path: src/common/types/storyboard.ts
 * Description: One yt-dlp storyboard level, as the engine returns it with a video's info. Each sheet
 *   is a sprite of columns x rows frames, so the timeline filmstrip needs no video download. Shared
 *   because the engine (main) produces it and the timeline (renderer) draws it.
 */
export interface StoryboardLevel {
  id: string;
  /** Size of one frame in pixels. */
  width: number;
  height: number;
  columns: number;
  rows: number;
  /** Frames per second of video, so 1 / fps seconds between frames. */
  fps: number;
  sheets: { url: string; duration: number }[];
}
