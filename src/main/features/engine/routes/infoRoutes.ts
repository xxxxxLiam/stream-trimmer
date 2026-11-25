/**
 * File: infoRoutes.ts
 * Path: src/main/features/engine/routes/infoRoutes.ts
 * Description: POST /api/info and /api/transcript.
 */
import { type Request, type Response, type Express } from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { binariesOk, childEnv, resolvedFfmpeg, yt } from "../services/binaries";
import { cookieModeFor, resolveCookieOptions, withRunCookies } from "../services/cookies";
import { audioTracksOf } from "../utils/audioTracks";
import { computeBitrates } from "../utils/bitrates";
import { storyboardsOf } from "../utils/storyboards";
import { binaryError, fullErrMessage, logYtError } from "../utils/errors";
import { describeInfoFailure } from "../utils/infoFailure";
import { markToolsReady } from "../services/toolStatus";
import { infoSchema } from "../utils/schemas";
import { parseVttTranscript } from "../utils/vtt";
import {
  describeMissingTranscript,
  pickTranscriptFile,
  TRANSCRIPT_SUB_LANGS,
  UNREADABLE_TRANSCRIPT,
} from "../utils/transcriptFetch";

export function registerInfoRoutes(app: Express): void {
  app.post("/api/info", async (req: Request, res: Response) => {
    const parsed = infoSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.issues[0].message });
    if (!binariesOk) return binaryError(res);

    // Every yt-dlp run gets a private copy of the jar (see withRunCookies):
    // yt-dlp writes its cookie file back, so handing it the canonical path lets
    // a bad run wipe the saved sign-in.
    let options: Record<string, unknown> = {};
    try {
      const info = await withRunCookies(
        cookieModeFor(parsed.data.cookiesFromBrowser),
        resolveCookieOptions(parsed.data.cookiesFromBrowser),
        false,
        (cookies) => {
          options = {
            dumpSingleJson: true,
            noWarnings: true,
            noPlaylist: true,
            ...cookies,
          };
          console.log(
            `[server] /api/info url=${parsed.data.url} options=${JSON.stringify(options)}`,
          );
          return yt!.run(parsed.data.url, options, {
            env: childEnv(),
          } as any);
        },
      );
      markToolsReady();
      res.json({
        id: info.id,
        title: info.title,
        duration: info.duration,
        thumbnail: info.thumbnail,
        bitrates: computeBitrates(info),
        audioTracks: audioTracksOf(info),
        storyboards: storyboardsOf(info),
      });
    } catch (e) {
      logYtError("/api/info", parsed.data.url, options, e);
      // The raw text is in the log above; the person gets one plain sentence and a kind.
      res.status(400).json(describeInfoFailure(fullErrMessage(e)));
    }
  });

  app.post("/api/transcript", async (req: Request, res: Response) => {
    const parsed = infoSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.issues[0].message });
    if (!binariesOk) return binaryError(res);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yttxt-"));
    const cleanup = () => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    };

    let options: Record<string, unknown> = {};
    let stderr = "";
    try {
      await withRunCookies(
        cookieModeFor(parsed.data.cookiesFromBrowser),
        resolveCookieOptions(parsed.data.cookiesFromBrowser),
        false,
        (cookies) => {
          options = {
            skipDownload: true,
            writeAutoSubs: true,
            writeSubs: true,
            subLangs: TRANSCRIPT_SUB_LANGS,
            subFormat: "vtt",
            noPlaylist: true,
            output: path.join(tempDir, "sub"),
            ffmpegLocation: resolvedFfmpeg,
            ...cookies,
          };
          console.log(
            `[server] /api/transcript url=${parsed.data.url} options=${JSON.stringify(options)}`,
          );
          // Warnings stay on: a refused subtitle download (HTTP 429) is only a warning, exit code 0.
          return yt!.run(parsed.data.url, options, {
            env: childEnv(),
            onStderr: (text: string) => {
              stderr = text;
            },
          } as any);
        },
      );

      const files = fs.readdirSync(tempDir);
      console.log("[server] transcript files:", files);

      const vtt = pickTranscriptFile(files);

      if (!vtt) {
        cleanup();
        const failure = describeMissingTranscript(stderr);
        if (failure) {
          console.log(`[server] /api/transcript fetch failed: ${stderr.trim().slice(-400)}`);
          return res.json({ lines: [], available: false, failed: true, ...failure });
        }
        return res.json({ lines: [], available: false });
      }

      const raw = fs.readFileSync(path.join(tempDir, vtt), "utf8");
      cleanup();

      const { lines, wordTimings } = parseVttTranscript(raw);
      if (lines.length === 0) {
        return res.json({ lines: [], available: false, failed: true, ...UNREADABLE_TRANSCRIPT });
      }
      res.json({ lines, available: true, wordTimings });
    } catch (e) {
      logYtError("/api/transcript", parsed.data.url, options, e);
      cleanup();
      const failure = describeMissingTranscript(fullErrMessage(e)) ?? {
        error: "Couldn't load the transcript. Try again in a moment.",
        kind: "unknown",
      };
      res.json({ lines: [], available: false, failed: true, ...failure });
    }
  });
}
