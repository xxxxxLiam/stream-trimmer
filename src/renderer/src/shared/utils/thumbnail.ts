/**
 * File: thumbnail.ts
 * Path: src/renderer/src/shared/utils/thumbnail.ts
 * Description: Where a video's thumbnail comes from. YouTube serves one at i.ytimg.com for every video id,
 *   so a row can show it without loading the video's info first. Sizes are tried smallest first: the
 *   big ones (maxresdefault, sddefault) 404 for many videos, which is what left the Videos rows empty.
 */
export function thumbnailSources(videoId: string | null | undefined): string[] {
  const id = (videoId ?? "").trim();
  if (!/^[\w-]{6,}$/.test(id)) return [];
  return ["mqdefault", "hqdefault", "default"].map((n) => `https://i.ytimg.com/vi/${id}/${n}.jpg`);
}
