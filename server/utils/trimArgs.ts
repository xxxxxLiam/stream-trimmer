/**
 * File: trimArgs.ts
 * Path: server/utils/trimArgs.ts
 * Description: Builds the ffmpeg arguments for a local trim.
 */


/**
 * ffmpeg arguments for cutting one range out of a whole downloaded video.
 *
 * Not `-c copy`: with `-ss` before `-i` a stream copy cannot start on a
 * non-keyframe, so ffmpeg keeps the packets back to the previous keyframe and
 * hides them behind an mp4 edit list. Players honour that list, but the concat
 * demuxer that joins the pieces ignores it, and the pre-roll comes back: a
 * clip marked at 4.00 s arrived with 14 frames from before an in-point. The
 * video is therefore decoded and re-encoded from the exact in-point (seek is
 * frame-accurate when transcoding), so the frames before it are discarded, not
 * hidden. The length is `-t`, an output limit, so nothing after the out point
 * leaks either; `passthrough` stops ffmpeg duplicating or dropping frames to
 * pad the cut onto a constant frame rate. yuv420p keeps the result playable
 * everywhere whatever the source was.
 */
export function localTrimArgs(
  source: string,
  seg: { start: number; end: number },
  out: string,
): string[] {
  return [
    "-hide_banner",
    "-y",
    "-ss",
    String(seg.start),
    "-i",
    source,
    "-t",
    String(seg.end - seg.start),
    "-fps_mode",
    "passthrough",
    "-c:v",
    "libx264",
    "-crf",
    "18",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    out,
  ];
}
