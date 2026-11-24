/**
 * File: commentsRoutes.ts
 * Path: src/main/features/engine/routes/commentsRoutes.ts
 * Description: POST /api/comments.
 */
import { type Request, type Response, type Express } from "express";
import { binariesOk, childEnv, yt } from "../services/binaries";
import { cookieModeFor, resolveCookieOptions, withRunCookies } from "../services/cookies";
import { binaryError, fullErrMessage, logYtError } from "../utils/errors";
import { infoSchema } from "../utils/schemas";

// Fetch all comments (top-level + replies) via yt-dlp's --write-comments.
// Returned as a normalized JSON array so the client can build a CSV.
interface RawComment {
  id?: string;
  parent?: string; // 'root' for top-level, otherwise parent comment id
  text?: string;
  author?: string;
  author_id?: string;
  author_is_uploader?: boolean;
  is_favorited?: boolean;
  is_pinned?: boolean;
  like_count?: number | null;
  dislike_count?: number | null;
  timestamp?: number | null;
  time_text?: string;
  reply_count?: number | null;
}

export function registerCommentsRoutes(app: Express): void {
  app.post("/api/comments", async (req: Request, res: Response) => {
    const parsed = infoSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.issues[0].message });
    if (!binariesOk) return binaryError(res);

    let options: Record<string, unknown> = {};
    try {
      const info = await withRunCookies(
        cookieModeFor(parsed.data.cookiesFromBrowser),
        resolveCookieOptions(parsed.data.cookiesFromBrowser),
        false,
        (cookies) => {
          options = {
            dumpSingleJson: true,
            writeComments: true,
            noPlaylist: true,
            noWarnings: true,
            // Fetch every top-level comment and every reply. `all` avoids
            // yt-dlp's default cap so nothing is truncated on large videos.
            extractorArgs:
              "youtube:comment_sort=top;max_comments=all,all,all,all",
            ...cookies,
          };
          console.log(
            `[server] /api/comments url=${parsed.data.url} options=${JSON.stringify(options)}`,
          );
          return yt!.run(parsed.data.url, options, {
            env: childEnv(),
          } as any);
        },
      );
      const raw: RawComment[] = Array.isArray(info?.comments) ? info.comments : [];
      if (raw.length === 0 && info?.comment_count === 0) {
        return res.json({
          title: info?.title ?? "",
          commentsDisabled: true,
          comments: [],
        });
      }
      // Determine top-level parents so we can compute reply_count.
      const replyCounts = new Map<string, number>();
      for (const c of raw) {
        if (c.parent && c.parent !== "root") {
          replyCounts.set(c.parent, (replyCounts.get(c.parent) ?? 0) + 1);
        }
      }
      const comments = raw.map((c) => {
        const isReply = Boolean(c.parent && c.parent !== "root");
        return {
          comment_id: c.id ?? "",
          parent_id: isReply ? c.parent ?? "" : "",
          is_reply: isReply,
          author: c.author ?? "",
          author_channel_id: c.author_id ?? "",
          text: c.text ?? "",
          like_count: typeof c.like_count === "number" ? c.like_count : "",
          dislike_count:
            typeof c.dislike_count === "number" ? c.dislike_count : "",
          is_favorited: Boolean(c.is_favorited),
          is_pinned: Boolean(c.is_pinned),
          is_uploader: Boolean(c.author_is_uploader),
          published_time: c.time_text ?? "",
          timestamp: typeof c.timestamp === "number" ? c.timestamp : "",
          reply_count: isReply ? "" : replyCounts.get(c.id ?? "") ?? 0,
        };
      });
      res.json({
        title: info?.title ?? "",
        commentsDisabled: false,
        comments,
      });
    } catch (e) {
      logYtError("/api/comments", parsed.data.url, options, e);
      const msg = fullErrMessage(e);
      // yt-dlp signals disabled comments in the stderr text.
      if (/comments are disabled/i.test(msg)) {
        return res.json({
          title: "",
          commentsDisabled: true,
          comments: [],
        });
      }
      res.status(500).json({ error: msg });
    }
  });
}
