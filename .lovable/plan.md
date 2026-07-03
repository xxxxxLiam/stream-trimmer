## Analysis

Confirmed: running the bundled `yt-dlp` with `PATH=<Resources>/bin` succeeds, so binaries are fine. The failure is that the packaged Electron app spawns `yt-dlp` without the bundled `bin/` on the child's PATH, so yt-dlp's `[jsc:deno]` step can't locate `deno`.

Root cause is scope: `electron/main.cjs` mutates `process.env.PATH` in the main process, but the bundled Express server (`electron/dist/server.cjs`) is loaded via `require()` — it inherits main's env at require time, but `youtube-dl-exec` spawns children with its own env plumbing that has historically not always propagated a later-mutated `process.env`. Fix must set `env` explicitly on the exec call itself, not rely on ambient PATH.

Separately, current MP4 selection still resolves to AV1+Opus in `.webm` — need to strictly force `avc1`/`m4a` and merge to mp4.

## Fix

### `server/index.ts`
- Compute `binDir` once from `process.env.ELECTRON_RESOURCES` (fallback `path.join(process.resourcesPath, 'bin')` when running under Electron; dev = `resources/bin` relative to cwd).
- Build a shared `childEnv = { ...process.env, PATH: <binDir><delim><existing PATH> }`.
- Pass `env: childEnv` in every `yt!.run(...)` and `yt!.exec(...)` options object (info probe, transcript, download probe, download exec). This is the authoritative fix — `youtube-dl-exec` forwards the `env` option to `execa`/`spawn`.
- On startup, log: resolved `binDir`, whether `deno`/`yt-dlp`/`ffmpeg` exist there, and the effective `PATH` prefix the child will see. Also log once per `/api/download` request: "child PATH[0]=<binDir>".
- Tighten MP4 format string: `bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a][acodec^=mp4a]/bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/best[ext=mp4]/best`, keep `mergeOutputFormat: "mp4"`, and force `remuxVideo: "mp4"` as a safety net so the final container is truly `.mp4`. Output path stays `clip.mp4`.
- If youtube-dl-exec supports it, also pass `--extractor-args "youtube:player_client=web_safari,web"` only if needed — otherwise rely on PATH+deno.

### `electron/main.cjs`
- Keep the existing defensive PATH prepend (belt & suspenders), but additionally set `process.env.ELECTRON_RESOURCES_BIN` explicitly so the server has a single source of truth without recomputing.
- Log resolved resources dir + bin dir + existence of `deno`/`yt-dlp`/`ffmpeg` at startup.

### `scripts/build-server.cjs`
- No behavioral change required; verify the bundle doesn't tree-shake `execa`'s env handling. (Read-only check — likely no edit.)

## Verification

1. `npm run dist:mac` → open packaged app.
2. Open the log file (Console.app filter on app name, or `~/Library/Logs/<AppName>/`): confirm lines:
   - `[server] binDir=/…/Resources/bin (deno=ok, yt-dlp=ok, ffmpeg=ok)`
   - `[server] child PATH prefix=/…/Resources/bin`
3. Paste a YouTube URL → Search returns metadata (proves info call uses correct PATH).
4. Select MP4, download a 30 s clip → file plays in QuickTime; `ffprobe clip.mp4` shows `h264` video + `aac` audio in an `mp4` container.
5. Trigger a deliberate failure (invalid URL) → real yt-dlp stderr tail surfaces in the UI, not a generic message.
