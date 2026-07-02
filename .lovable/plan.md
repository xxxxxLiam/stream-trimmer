## Plan

1. **Replace the placeholder home route**
   - Move the YouTube Clipper UI into the existing main app at `src/routes/index.tsx`.
   - Keep all UI code under `src/` as requested, instead of inside the separate `youtube-clipper/` folder.
   - Add a file header to match your workspace standard.

2. **Move the minimalist styling into the main app**
   - Merge the black/white clipper styles into `src/styles.css`.
   - Preserve the minimal UI shown in your screenshot: black background, white text/borders, no gradients/shadows.

3. **Add a local Node backend at the project root**
   - Move the Express/yt-dlp/ffmpeg backend from `youtube-clipper/server/index.js` to `server/index.js`.
   - Keep it as local-only tooling because it uses `child_process`, `yt-dlp`, and `ffmpeg`, which cannot run inside the hosted preview/serverless runtime.
   - Improve the startup/runtime error message so missing `yt-dlp`/`ffmpeg` is explicit and actionable.

4. **Wire the root package and Vite config**
   - Update the root `package.json` scripts so `npm run dev` starts both the Lovable/Vite client and the local Express backend.
   - Add any missing local-backend dependencies to the root package.
   - Add a dev proxy in the root `vite.config.ts` so `/api/info` and `/api/download` route to the local backend.

5. **Remove the accidental nested project**
   - Delete the separate `youtube-clipper/` directory after its useful code has been moved into the root project.

6. **Update app metadata**
   - Replace the default `Lovable App` title/description in `src/routes/__root.tsx` with YouTube Clipper-specific metadata.

7. **Verify**
   - Run a safe validation/build check after changes.
   - The hosted Lovable preview may still show a missing `yt-dlp` message because native binaries are not installed there, but the app will be structured correctly for local use with `yt-dlp` and `ffmpeg` installed.