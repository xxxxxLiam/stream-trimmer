/**
 * File: app.ts
 * Path: src/main/features/engine/app.ts
 * Description: The Express app: origin guard, CORS, JSON body limit and the packaged UI.
 */
import express, { type Request, type Response } from "express";
import cors from "cors";
import fs from "node:fs";
import { PORT } from "./utils/engineConfig";

export const app = express();

// This server is the app's own backend, not a public API. It binds loopback
// only (see app.listen), and on top of that it answers only the app's own
// origin: the packaged window loads from http://127.0.0.1:<PORT>, and the dev
// renderer from the Vite server on :8080. A no-preflight cross-origin POST
// (text/plain) is still SENT by the browser, and CORS headers do not stop it
// being processed, so a foreign Origin is refused outright rather than merely
// left without Access-Control-Allow-Origin. A Host that is not a loopback name
// is refused too, which is what stops DNS rebinding.
const ALLOWED_ORIGINS = new Set(
  [PORT, 8080].flatMap((port) => [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ]),
);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function requestAllowed(
  origin: string | undefined,
  hostHeader: string | undefined,
): boolean {
  if (origin !== undefined && !ALLOWED_ORIGINS.has(origin)) return false;
  const host = String(hostHeader ?? "")
    .toLowerCase()
    .replace(/:\d+$/, "");
  return LOOPBACK_HOSTS.has(host);
}

app.use((req: Request, res: Response, next) => {
  if (!requestAllowed(req.headers.origin, req.headers.host)) {
    return res.status(403).json({ error: "Forbidden origin" });
  }
  next();
});
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.has(origin)),
  }),
);
// Request bodies are small JSON (a URL, a few ranges), so the cap is the
// body-parser default made explicit: 100 KB, measured after any gzip inflation.
// Anything larger, and any body that is not JSON, is answered by the error
// handler registered after the routes, as JSON, never as an HTML stack trace.
export const JSON_BODY_LIMIT = "100kb";
app.use(express.json({ limit: JSON_BODY_LIMIT }));

// When packaged inside Electron, this same server also serves the built UI so
// the window loads over http://127.0.0.1 instead of file://. A real origin is
// required for the YouTube embed to render at all.
export const uiDir = process.env.ELECTRON_UI_DIR;
if (uiDir && fs.existsSync(uiDir)) {
  app.use(express.static(uiDir));
  console.log(`[server] serving UI from ${uiDir}`);
}
