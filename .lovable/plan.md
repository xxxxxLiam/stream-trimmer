# Restore the reliable default-browser YouTube connection flow

## Goal
Replace the in-app YouTube login window with the proven version 2.0.0 browser-session method, while removing manual browser selection. YouTube connection becomes a required gate: the rest of the app remains unavailable until a real session is verified.

## User flow
1. On startup, show a non-dismissible **Connect YouTube** window while the app checks the current session.
2. If already connected, close the window automatically and open the app.
3. If disconnected, show two numbered steps:
   - **1. Connect YouTube** opens YouTube sign-in in the device’s default browser. The instructions will say to sign in and leave that browser tab open.
   - **2. Check Connection** becomes the clear follow-up action when the user returns to the app.
4. Check the default browser’s YouTube session first. If that browser cannot be identified or is unsupported, automatically check Chrome, Safari, Edge, Firefox, Brave, and Chromium without exposing a browser selector.
5. On success, close the connection window automatically and use that verified browser session for clip downloads and channel exports.
6. If the session later expires or becomes unreadable, reopen the required connection window automatically.

## Connection enforcement
- Remove the X button and all other dismissal paths; clicking the backdrop or pressing Escape will not close the window.
- Keep the full app visually blocked until verification succeeds.
- Verify on startup, whenever the user returns focus to the app, and on a short periodic interval while the app is open.
- Prevent overlapping checks and avoid reopening/flickering while a check is already running.
- A true browser logout event cannot be observed directly by the desktop app, so focus and periodic verification provide the closest reliable real-time behavior.

## Technical details
- Restore the v2.0.0 external-browser flow: Electron opens `youtube.com/signin` through the operating system, and the local yt-dlp process verifies cookies with `--cookies-from-browser`.
- Add an Electron bridge that identifies the default browser where the operating system exposes it, maps it to the supported browser allowlist, and returns only the browser name—never cookie contents.
- Retire the app-managed `cookies.txt` session as the active connection path; retain only the existing browser-cookie validation endpoint and sanitized errors.
- Store the browser that successfully verifies so subsequent startup, focus, download, and export checks try it first. If it stops working, re-detect the default browser and then sweep the supported list.
- Keep clear errors for locked profiles, unreadable/decryption failures, missing profiles, timeouts, and signed-out sessions.

## Verification
- Add tests for default-browser mapping, preferred-first fallback order, successful/failed connection state transitions, and non-overlapping periodic checks.
- Verify the packaged desktop flow: startup gate, external default-browser launch, return and **Check Connection**, automatic unlock, authenticated 1080p request, and forced re-gating after a failed revalidation.
- Confirm the modal has no close control and cannot be dismissed with Escape or backdrop interaction.
