/**
 * File: schemas.ts
 * Path: src/main/features/engine/utils/schemas.ts
 * Description: Request body schemas for the engine's routes.
 */
import { z } from "zod";
import { isYouTubeUrl } from "./youtubeUrl";

export const urlSchema = z
  .string()
  .url()
  .refine(isYouTubeUrl, "URL must be a YouTube link");

// Browsers yt-dlp can read a logged-in YouTube session from. Only the browser
// name ever crosses the API; cookie contents never touch this process.
export const cookieBrowserSchema = z.enum([
  "chrome",
  "safari",
  "edge",
  "firefox",
  "brave",
  "chromium",
]);

// "app" = the session the user signed into inside the app. The cookie file
// path is never accepted from the client; it is resolved here from the path
// Electron hands the server at startup.
export const authSourceSchema = z.union([z.literal("app"), cookieBrowserSchema]);

// Metadata, transcripts and comments all need the signed-in session just as
// much as the download does. Without it YouTube answers "Sign in to confirm
// you're not a bot" for a signed-out IP, which read in the UI as the app
// having lost a sign-in it was actually still holding.
export const infoSchema = z.object({
  url: urlSchema,
  cookiesFromBrowser: authSourceSchema.optional(),
});

export const downloadSchema = z.object({
  url: urlSchema,
  // A clip is a list of ranges, joined in order into one file. The older
  // single `start`/`end` pair is still accepted and means one segment.
  segments: z
    .array(
      z.object({ start: z.number().nonnegative(), end: z.number().positive() }),
    )
    .min(1)
    .optional(),
  start: z.number().nonnegative().optional(),
  end: z.number().positive().optional(),
  format: z.enum(["mp4", "mp3"]).default("mp4"),
  // One audio language per request ("es", "pt-BR"): each language is its own clip, so the caller
  // makes one request per ticked language. Omitted means the original track.
  audioLanguage: z
    .string()
    .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/)
    .optional(),
  quality: z.string().default("best"),
  // How the finished clip is handed back. "stream" sends the media as the
  // response body. "path" returns only its location on disk, for the
  // desktop app, whose main process can move the file itself — the media
  // then never travels through the UI at all.
  deliver: z.enum(["stream", "path"]).default("stream"),
  // Optional sign-in path. "app" uses the session the user signed into
  // inside the app; a browser name lets yt-dlp read that browser's session.
  // Cookie contents never cross the API — only the source label.
  cookiesFromBrowser: authSourceSchema.optional(),
});

export type DownloadInput = z.infer<typeof downloadSchema>;
