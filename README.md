# Clipr

A desktop downloader for clippers. Paste a link, read the transcript to find
the moment, mark in and out, and download just that section. Several moments
from across one video can come down as one joined file. Then open it in Final
Cut Pro, Premiere Pro, DaVinci Resolve or CapCut. Clipr downloads; it does not
edit and it does not reframe.

Everything runs on your machine. No account, no ads, nothing uploaded. The
public downloads and landing page live in
[xxxxxLiam/clipr](https://github.com/xxxxxLiam/clipr); this repository is the
private source.

## Download the app

These links always point at the newest release:

| Your computer | Download |
| --- | --- |
| **Windows 10/11** (64-bit) | [Clipr-Windows-x64-Setup.exe](https://github.com/xxxxxLiam/clipr/releases/latest/download/Clipr-Windows-x64-Setup.exe) |
| **macOS** (Apple Silicon, M1 and newer; not Intel) | [Clipr-macOS-AppleSilicon.dmg](https://github.com/xxxxxLiam/clipr/releases/latest/download/Clipr-macOS-AppleSilicon.dmg) |
| **Linux** (64-bit) | [Clipr-Linux-x64.AppImage](https://github.com/xxxxxLiam/clipr/releases/latest/download/Clipr-Linux-x64.AppImage) |

yt-dlp and ffmpeg are bundled inside the app. There is nothing else to install.

**The app is not code-signed yet**, so Windows and macOS interrupt you once.
The page at https://xxxxxliam.github.io/clipr/ has the exact steps with copy
buttons; the short version follows.

### Windows

1. If the browser blocks the download, press **Ctrl+J**, click **⋯** next to
   the file and choose **Keep** (then **Keep anyway** if asked).
2. Right-click the file → **Properties** → tick **Unblock** → **OK**. If there
   is no tick box, run this in PowerShell (the `*` also catches a renamed copy
   such as `Setup (1).exe`; change `Downloads` if you saved it elsewhere):

   ```powershell
   Get-ChildItem "$env:USERPROFILE\Downloads\Clipr-Windows-x64-Setup*.exe" | Unblock-File
   ```

3. Double-click it. If "Windows protected your PC" appears, click **More info**
   then **Run anyway**.

If there is no **Run anyway** button at all, Smart App Control is on and
blocks unsigned apps outright. Check **Windows Security → App & browser
control → Smart App Control**. Turning it off lowers your machine's protection;
on Windows 11 24H2/25H2 with build 26100.8116 / 26200.8116 or newer it can be
switched back on, on anything older treat it as permanent (`winver` shows your
build). If you are not comfortable with that, wait until the app is signed.

### macOS

1. Open the `.dmg` and drag **Clipr** to Applications.
2. Clear the download flag and open it, from Terminal:

   ```bash
   xattr -dr com.apple.quarantine /Applications/Clipr.app && open /Applications/Clipr.app
   ```

Right-click → **Open** no longer works for unsigned apps since macOS Sequoia
(15). Without Terminal: let macOS refuse the app once, then **System Settings →
Privacy & Security → Open Anyway**. The Mac app cannot update itself while it
is unsigned, so it tells you when there is a new version and links the
download; repeat the steps after each update.

### Linux

```bash
chmod +x Clipr-Linux-x64.AppImage && ./Clipr-Linux-x64.AppImage
```

## What it does

- **Transcript-first.** Read the transcript to find the moment and jump to it.
- **Mark a range, press Clip.** Drag on the timeline or set in and out with the
  keyboard. Only that section downloads, so a 1-minute clip from a 3-hour
  podcast comes down in seconds. There is no length cap.
- **One file, several moments.** Add more sections and they come down joined,
  in order, as one file.
- **Campaigns.** Each client has its own folder, daily count and clip bank.
- **Clip bank and history.** Import moments for a video, work down the list;
  History shows what was already exported.
- **Editor handoff.** The Clip menu picks the editor: Final Cut Pro (Mac only;
  library and event named per campaign), Premiere Pro, DaVinci Resolve or
  CapCut. The editors without project import open with the file shown in
  Finder or File Explorer.
- **No format or quality settings.** MP4 at 1080p, or the highest the video
  has. The footer says "Makes N clips to [folder]".

## Getting 1080p

YouTube serves 360p to anyone who is not signed in. The footer says "at 360p"
while that is the case, and its **Sign in for 1080p** button opens Help with
the steps: export a `cookies.txt` from your own browser and drop it in. The
file stays on your computer.

## Reporting a problem

In the app: **Help** → **Report a problem**, write a note, press **Send
report**. Nothing is sent unless you press it. After a crash the same button
is on the crash screen, with **Copy details** as an alternative. There is no
public issue route.

## Building from source

Only needed if you want to develop or build the app yourself.

### Run in dev (browser)

```sh
git clone <your-fork-or-this-repo> clipr
cd clipr
npm install
npm run dev
```

Then open **http://localhost:8080**. A single `npm run dev` starts the Vite front-end and the local worker together.

### Build the desktop app

```sh
npm run dist:mac     # macOS .dmg (run on a Mac)
npm run dist:win     # Windows .exe (run on Windows)
npm run dist:linux   # Linux AppImage
```

Installers are written to `dist-electron/`. Each OS's installer must be built on that OS (or via CI) — you can't cross-build a Windows `.exe` from macOS.

### Prerequisites (source builds only)

- **Node.js 18+** (see `.nvmrc`).
- **ffmpeg**, **yt-dlp**, and **deno** are downloaded and bundled automatically during the build (`scripts/bundle-binaries.cjs`). The packaged app ships them inside `Resources/bin`, so end users install nothing.

## How it works

A React single-page app (Vite + TypeScript) talks to a local Express worker. The worker runs **yt-dlp** to fetch just your selected section and **ffmpeg** to trim it, then delivers the file. In dev, both run via `npm run dev` on localhost. In the packaged desktop app, Electron serves the built front-end and runs the worker in-process on a private local port; yt-dlp, ffmpeg, and deno are bundled in the app and invoked directly (spaces in the install path are handled).

## Scripts

| Command                                        | What it does                                            |
| ---------------------------------------------- | ------------------------------------------------------- |
| `npm install`                                  | Installs dependencies and runs the setup check.         |
| `npm run setup`                                | Re-checks that yt-dlp and ffmpeg are available.         |
| `npm run dev`                                  | Dev mode (front-end + worker) at http://localhost:8080. |
| `npm run build`                                | Builds the front-end.                                   |
| `npm run dist:mac` / `dist:win` / `dist:linux` | Builds the packaged desktop installer for that OS.      |

## Troubleshooting

**Using the app:**

- **Can't find the installer on the Releases page** — GitHub collapses the file
  list under an **Assets** heading. Click it, or use the direct links at the top
  of this page, which always point at the newest build.
- **Windows: no "Run anyway" option appears** — that is Smart App Control, not
  SmartScreen. See [Windows](#windows) above; SmartScreen can be clicked
  through, Smart App Control cannot.
- **"Preview unavailable"** — the video owner disabled embedding. Downloading still works; ignore it.
- **"No transcript available"** — that video has no captions (or none in a supported language). A YouTube limitation, not a bug.
- **"yt-dlp failed" with details** — if YouTube changed something and the bundled yt-dlp is behind, grab the newest release build, which bundles an updated yt-dlp.
- **"Sign in to confirm you're not a bot"** — YouTube is challenging an
  unauthenticated request. Import a cookies.txt (below). If you already have,
  the session may have been rotated out — re-export it from a private window,
  which is the step that makes it last.
- **"Chrome is running and holding its cookie database open"** — Windows gives
  the running browser an exclusive lock. Quit it fully, including tray
  processes, or use **Import cookies.txt**.
- **"Chrome encrypts its cookies so other apps can't read them"** — Chrome 127+
  App-Bound Encryption. There is no way around it from outside the browser;
  **Import cookies.txt** is the answer, because the browser decrypts on export.

### Import cookies.txt

This is how the app signs in. There is no in-app Google sign-in: Google
blocks Google Account sign-in from inside other applications as policy, and
has since January 2021, so no amount of work in this app can make it succeed.

**Export from a private window.** YouTube rotates account cookies on open
YouTube tabs as a security measure, so a file exported from your normal
browsing is invalidated within hours — that is why a plain export seems to
"stop working" and need redoing. A private session you close and never reopen
is never rotated.

1. Open a new private browsing/incognito window and log into YouTube.
2. In the same window and same tab, go to `https://www.youtube.com/robots.txt`.
   This should be the only private/incognito tab open.
3. Export youtube.com cookies with a "Get cookies.txt LOCALLY" style extension.
4. Close the private window, so that session is never opened in the browser
   again.
5. In the app: the footer's **Sign in for 1080p** (or **Help → Sign in for 1080p**), then drop that file or choose it.

The procedure is yt-dlp's own; see its
[Exporting YouTube cookies](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies)
wiki page. The browser decrypts on export, so this works regardless of whether
the browser is running or how it encrypts its cookie store. The file is
validated (it must contain a real YouTube sign-in cookie), stored in the app's
own data folder, and read only by the local yt-dlp process — which also
refreshes it after each run, so one good import lasts.

Reading a browser's cookies directly (**Find my YouTube session**) is offered
as a secondary route. Firefox works reliably; Chrome and Chromium on Windows
cannot be read at all, because Chrome 127+ encrypts the cookie database
against other programs. Cookies obtained that way are the rotating kind, so
expect to redo them.

Note that 1080p does not itself require a sign-in. Cookies are needed for
age-restricted, members-only and private content, and to clear bot checks.

**Building from source:**

- **`✗ yt-dlp not found` in dev** — install it for your OS (macOS `brew install yt-dlp`, Windows `winget install yt-dlp.yt-dlp`, Linux `sudo apt install yt-dlp`), then `npm run setup`. The app auto-uses a system yt-dlp if the bundled one is missing.
- **`EADDRINUSE` (port in use)** — a previous dev run is still holding the port. Free it: `lsof -ti :5174 | xargs kill` (macOS/Linux), then `npm run dev`.
- **A binary silently failed to download during build** — run `npm install --foreground-scripts` to see the output.

## Legal & responsible use

This is a neutral, general-purpose tool. Use it only for content you own or have the rights to download — your own uploads, public-domain material, Creative Commons works, or clips you have permission to save. Respect [YouTube's Terms of Service](https://www.youtube.com/t/terms) and applicable copyright law. Built on the excellent [yt-dlp](https://github.com/yt-dlp/yt-dlp) — please read their notes on responsible use.

## Maintenance

Provided as-is and **unmaintained**. If yt-dlp/ffmpeg change behaviour or YouTube breaks things, fork the repo and update at your own discretion. Issues and PRs may not receive a response.

## Releasing new versions (auto-update)

The desktop app auto-updates via `electron-updater`, reading from this repo's
GitHub Releases. Each release must contain the platform installer **plus** the
matching metadata file that `electron-builder` uploads:

- Windows: `latest.yml`
- macOS: `latest-mac.yml`
- Linux: `latest-linux.yml`

Without those `.yml` files the app cannot detect a new version.

### Releases are automatic

`.github/workflows/release.yml` runs on every push to `main` — so **merging a
pull request cuts a release**. There is nothing to do by hand.

The workflow, in order:

1. **verify** — `npm ci`, `tsc --noEmit`, `npm test`. Nothing is tagged unless
   these pass.
2. **version** — works out the bump (below), runs `npm version`, pushes the
   `Release vX.Y.Z` commit and its tag.
3. **build** — native installers, in parallel on their own OS runners:
   - `macos-latest` → `Clipr-macOS-AppleSilicon.dmg` (arm64)
   - `windows-latest` → `Clipr-Windows-x64-Setup.exe`
   - `ubuntu-latest` → `Clipr-Linux-x64.AppImage`
4. **publish** — flips the release public, marks it latest, and writes notes
   from the commits since the previous tag.

Steps 3 and 4 are separate on purpose. `electron-builder` uploads into a
*draft* release, so a half-finished one — macOS uploaded, Windows still
building — is never visible. If any platform fails, the draft stays a draft
and nothing is published.

Authentication uses the built-in `GITHUB_TOKEN`; no personal access token is
needed.

#### How the version bump is chosen

Read from the commit messages since the last release tag. First match wins:

| Bump      | Triggered by                                              |
| --------- | --------------------------------------------------------- |
| **major** | `[major]` in a commit **subject**, a `BREAKING CHANGE:` footer, or `feat!:` / `fix!:` (any type with `!`) |
| **minor** | `[minor]` in a commit **subject**, or `feat:` / `feat(scope):` |
| **patch** | anything else — the default                               |

Plain-English commit messages therefore get a **patch**. To ask for something
else, put `[minor]` / `[major]` in a commit's first line, or use the
Conventional-Commits prefix.

Markers are read from commit **subjects** only — never bodies. Bodies are
prose, and anything matched there gets matched by accident eventually: the
first version of this read bodies, and a commit whose body merely *described*
the markers released v3.0.0 for a bugfix. `BREAKING CHANGE:` is the one
body-level signal, and must start a line, case-sensitively, with its colon —
so "this is not a breaking change" cannot trigger a major.

The logic is in `scripts/detectBump.cjs` and covered by
`scripts/detectBump.test.ts`, so it can be changed without guessing.

#### Overrides

- **Force a bump:** Actions → Release → *Run workflow*, and pick
  `patch` / `minor` / `major` instead of `auto`.
- **Skip the release for one merge:** put `[skip release]` in the merge
  commit message.

The release's own `Release vX.Y.Z` commit never re-triggers the workflow —
GitHub does not fire workflows for pushes made with `GITHUB_TOKEN`, and the
job additionally skips any commit whose message starts with `Release v`.

### Optional fallback: build locally

Only needed if CI is unavailable. Build the installer for **the OS you're
on** — you cannot cross-build (that's the bug this workflow exists to
prevent). Requires a GitHub PAT with `repo` scope as `GH_TOKEN`:

```sh
export GH_TOKEN=ghp_your_token_here
npm run release:mac     # on macOS (arm64 only)
npm run release:win     # on Windows (x64)
npm run release:linux   # on Linux (x64)
```

### Platform notes

- **Windows (NSIS)** — auto-update works unsigned; users see a one-time
  SmartScreen prompt on first install.
- **Linux (AppImage)** — auto-update works unsigned. The app must have been
  launched from an AppImage file.
- **macOS (DMG)** — auto-update requires the app to be **signed AND
  notarized**. Until an Apple Developer certificate is configured, mac users
  will see an update notification but the install will fail; they need to
  download the new DMG manually from the Releases page. The app handles this
  gracefully — it does not crash.

## License

Source-available, not open source. See [LICENSE](./LICENSE).

Free to download and use, including for paid client work — the clips you make
are yours. Copying, redistributing, forking or reselling the application is
not permitted. Versions up to and including 4.0.1 were released under the MIT
Licence and stay MIT; this applies from 4.0.2 onward.

The bundled ffmpeg is GPL-3.0 and carries its own terms, which this licence
does not override. See [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) for
the full component list and for how to obtain corresponding source.

## Channel data tool (private builds only)

The channel profile exporter is not part of the public app. There is no
passcode. It is compiled in only when you build with a flag, so the downloads
other people get contain no exporter screen and no exporter endpoint.

| Variable | Purpose |
| --- | --- |
| `VITE_ENABLE_CHANNEL_DATA` | Off by default. Set to `1` to build the tool in. |
| `VITE_OWNER_SALT` | Any long random string, used to salt device hashes. |
| `VITE_OWNER_MACHINES` | Comma-separated device hashes allowed to see the tool. `*` means any machine. |

1. Put the variables in a local `.env` (gitignored, see `.env.example`).
2. Add a device: run `npm run machine-id` on that computer and append the hash it
   prints to `VITE_OWNER_MACHINES`.
3. Build your private copy by hand, for example
   `VITE_ENABLE_CHANNEL_DATA=1 npm run dist:mac`.

The public release workflow leaves `VITE_ENABLE_CHANNEL_DATA` empty on purpose.
Your private build is separate from the auto-updating public release: rebuild it
by hand when you want a newer one.

Honest limit: in a build that has the tool, the code is present and the device
list is in the bundle, so someone with developer tools could find it. This is
obscurity plus a device check, not a security boundary. Leaving the flag off is
what removes the feature entirely.
