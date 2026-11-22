# Feature inventory

Audit scope: the whole product as shipped in 4.x — one Electron desktop app
(main process + preload bridge + React renderer) and one loopback Express
server that the renderer talks to over HTTP. There is no hosted backend, no
multi-user system and no login of our own: the only "account" is the user's
own YouTube session, held as a cookies file on their machine.

The audit changes no product code.

## 0. How to run it

Dev (what the audit drives):

```
npm run dev:client          # Vite on :8080
npm run dev:server          # Express on :5174
xvfb-run -a --server-args="-screen 0 1440x900x24" \
  node audit/harness/launch.cjs           # Electron, ELECTRON_DEV=1
```

Electron's binary is not fetched by `npm ci` in this container; run
`node node_modules/electron/install.js` once first.

Production shape (`npm run build:electron`) bundles the server with esbuild and
serves the built renderer from `127.0.0.1:<port>`; the owner-only channel
exporter is stubbed out of the public bundle by a resolve plugin.

Test accounts / seed data: none exist. There is no demo mode and no fixture
corpus. The audit creates its own under `audit/fixtures/`.

### What cannot be exercised in this container

Recorded here because it bounds every claim the audit makes.

| Blocked | Why | How the audit compensates |
|---|---|---|
| Real YouTube info / transcript / download | The environment's network policy refuses `youtube.com` and `*.googlevideo.com`; media hosts are per-session subdomains so they cannot be allowlisted without wildcards. Proof: `yt-dlp` returns `Tunnel connection failed: 403 Forbidden (agent proxy: no rule or network setting allows this host)`. | A local HTTP fixture server + a stub `yt-dlp` on PATH for the server's own code paths; real ffmpeg against real local media for the cutting pipeline. |
| Signed-in (1080p) behaviour | No YouTube session exists here and the user's must not be used. | Cookie-file handling is tested with synthetic Netscape cookie files, which is what the code actually parses. |
| Final Cut / Premiere / CapCut handoff | macOS-only; this is Linux. | FCPXML generation and path/probe logic are tested as data; the `open -a` step is marked **not provable here**. |
| Installer / auto-update / code signing | Needs the packaged app on each OS. | Updater logic is unit-level only; marked **not provable here**. |

Anything an area cannot prove gets the label **not provable here** rather than
a pass.

## 1. Surfaces

### Screens

| Screen | Entry | Notes |
|---|---|---|
| Workspace | default | The clipping loop. Three columns: transcript, preview, clips. |
| Channel data | header link, owner machines only | Compiled out of public builds entirely. |

Within the workspace: a tab strip (several videos open at once), a header, a
footer, and five overlays — settings popover, campaign popover, copy blocks,
symbol palette, help drawer. Plus two modals: YouTube sign-in and setup.

### HTTP endpoints (loopback only)

| Method | Path | Owns |
|---|---|---|
| GET | `/api/info` | Video metadata for a pasted URL |
| GET | `/api/transcript` | Subtitle track, windowed by the client |
| GET | `/api/comments` | Top comments |
| POST | `/api/download` | Starts a clip download (one or many segments) |
| GET | `/api/download/progress` | Progress stream for a download |
| POST | `/api/auth/youtube/status` | Whether a usable session is on disk |
| GET | `/api/cache/usage` | Disk used by the temp cache |
| POST | `/api/cache/clear` | Empties the temp cache |
| POST | `/api/channel/export` | Owner only. Whole-channel CSV export |
| GET | `/api/channel/export/progress` | Owner only |
| POST | `/api/channel/export/cancel` | Owner only |

### IPC channels (preload bridge)

Grouped by what they touch. All of them are reachable from renderer code, so
all of them are attack surface for a malformed or hostile argument.

- **Files**: `file:save`, `file:saveFiles`, `file:exists`, `file:showInFolder`,
  `file:startDrag`, `clip:save`, `export:save`, `dialog:pickDirectory`
- **YouTube session**: `youtube:probe`, `youtube:disconnect`,
  `youtube:importCookies`, `youtube:importCookiesText`,
  `shell:openYouTubeSignIn`, `system:defaultBrowser`, `system:browserOrder`
- **Editor handoff**: `editor:installed`, `editor:probe`, `editor:writeFcpxml`,
  `editor:openWith`, `editor:reveal`, `editor:copyFiles`, `editor:pathExists`
- **Diagnostics**: `diagnostics:read`, `diagnostics:reveal`, `diagnostics:copy`
- **Settings**: `settings:all` (sync), `settings:set`
- **Updater**: `updater:check`, `updater:quitAndInstall`
- **Owner gate**: `owner:check`

### Persisted state

`localStorage` in the renderer, mirrored to a settings store in main. Fifteen
keys:

```
clipper.activeCampaign   clipper.authSource     clipper.bank
clipper.campaigns        clipper.clipsDir       clipper.cookieBrowser
clipper.dataDir          clipper.dataDirConfirmed
clipper.downloads        clipper.editorHandoff  clipper.saveDir
clipper.saveDirNames     clipper.saveDirs       clipper.workspaces
```

`clipper.bank`, `clipper.campaigns`, `clipper.workspaces` and
`clipper.downloads` are unbounded and grow with use — a first-class upgrade and
corruption risk, and the main thing step 8 ("state over time") must attack.

## 2. Functions, by area

Each row is a function a real person performs. Areas are the parallel split in
step 2 of the protocol; they do not share files.

### A. Onboarding and sign-in
Who: a clipper on a fresh install.
| Function | Inputs | Outputs | Data touched |
|---|---|---|---|
| Automatic browser sweep | installed browsers | a session or a refusal | cookies file |
| Import cookies.txt by file picker | a Netscape cookie file | session on disk | cookies file |
| Import cookies.txt by drag-and-drop | file text | same | cookies file |
| Session probe / expiry warning | cookies file | connected, expired, absent | — |
| Disconnect | — | file deleted | cookies file |
| Setup checklist | per-step completion | gating of later steps | campaigns, dirs |

### B. Core clipping loop
Who: a clipper, fifty times a session.
| Function | Inputs | Outputs | Data touched |
|---|---|---|---|
| Paste / change a URL | URL text | video info, duration | workspaces |
| Tabs: open, switch, close, reopen | — | per-tab state | workspaces |
| Transcript load and windowing | video id | windowed cues | — |
| Transcript search and follow | query | matches, scroll | — |
| Mark in / out | timestamps, keys | a segment | workspaces |
| Several segments → one file | list of ranges | one clip | workspaces |
| Preview and scrub | — | player position | — |
| Download, progress, cancel | segments, format | a file on disk | downloads, disk |
| Used-ranges record | past clips | marks on the transcript | bank |

### C. Clip bank, campaigns, categories and tiers
| Function | Inputs | Outputs | Data touched |
|---|---|---|---|
| Bulk timestamp import | pasted text block | many bank rows | bank |
| Categorise / set tier | selection | updated rows | bank |
| Filter, sort, search the bank | query | a view | bank |
| Create / rename / delete a campaign | name, folders | campaign record | campaigns |
| Switch campaign mid-task | selection | rebinds folders | activeCampaign |

### D. Output, folders and editor handoff
| Function | Inputs | Outputs | Data touched |
|---|---|---|---|
| Choose clips folder / data folder separately | directory | path | clipsDir, dataDir, saveDirs |
| Save a finished clip | temp path | file in the clips folder | disk |
| Drag a clip out of the window | — | a file drop | disk |
| Build FCPXML | clip + library/event names | an .fcpxml | disk |
| Send to Final Cut (library + event + project) | settings | Final Cut opens | disk |
| Send to CapCut | settings | CapCut opens | disk |
| Copy blocks | clip metadata | clipboard text | — |
| Symbol palette | selection | clipboard text | — |

### E. Channel data exporter (owner only)
| Function | Inputs | Outputs | Data touched |
|---|---|---|---|
| Owner gate | machine id + salt | shown or absent | — |
| Export a channel | channel URL | CSVs | disk |
| Progress, cancel, resume | — | — | cache |

### F. Help, diagnostics and updates
| Function | Inputs | Outputs | Data touched |
|---|---|---|---|
| Help drawer search | query | task list | — |
| Guided tutorial spotlight | task | highlights real controls | — |
| Copy diagnostics | — | log text on clipboard | log file |
| Update check / download / install | — | new version | app |

### G. Server and jobs
| Function | Inputs | Outputs | Data touched |
|---|---|---|---|
| yt-dlp invocation and argument building | options | a process | disk |
| ffmpeg cut and concat | segments | one file | disk |
| Cookie jar write-back and concurrency | cookies file | refreshed file | cookies file |
| Temp cache usage and clearing | — | freed disk | disk |
| Resume a partial download | cache state | continued download | cache |

## 3. Roles

There is one human role (the clipper) and one build-time flag (owner machine)
that reveals the channel exporter. There is no server-side authority: the
owner gate is a client-side check over a salted machine id, and the feature is
additionally compiled out of public bundles. The audit must confirm **both**
layers, because either alone is bypassable by anyone who can open devtools.

## 4. Current automated coverage

446 tests, all unit-level: 16 server suites and 12 renderer `src/lib` suites.
Zero of them render a component, drive the UI, or start the app. Every claim
about behaviour above the pure-logic layer is currently unproven, which is what
this audit exists to change.
