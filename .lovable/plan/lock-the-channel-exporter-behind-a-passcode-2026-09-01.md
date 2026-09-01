# Lock the channel exporter behind a passcode

Goal: anyone can run the app, but the Channel export feature only unlocks for
someone who knows your passcode. The clip downloader stays open to everyone.

## How it behaves

- On first use, the "Channel export" tab shows a small unlock card: one
  password field plus an Unlock button.
- Correct passcode unlocks the tab and is remembered on that machine, so you
  only enter it once per install. A "Lock again" link in the panel clears it.
- Wrong passcode shows an inline error; no lockout counter (this is a local app,
  not a server).
- If a build is produced without a passcode configured, the tab is hidden
  entirely — public builds simply don't show the feature.

## Where the passcode lives

The passcode is never stored in the repo. A SHA-256 hash of it is baked into the
build from an environment variable you set locally and in your GitHub Actions
release secrets. Source code and shipped binaries contain only the hash.

Honesty note: because this is a desktop app that runs entirely on the user's own
machine, a determined, technical person could bypass a local gate by editing the
app bundle. This stops casual use and keeps the feature out of sight; it is not
cryptographic protection. Real enforcement would need a remote server, which
conflicts with the app's fully-local, free design.

## Technical details

- `.env` / CI secret: `VITE_CHANNEL_PASSCODE_HASH` (hex SHA-256 of the
  passcode). `.env` stays gitignored; `.env.example` documents the variable.
- New `src/lib/channelLock.ts`: `hashPasscode()` using `crypto.subtle.digest`,
  `isLockConfigured()`, `verifyPasscode()`, and localStorage helpers for the
  `clipper.channelUnlocked` flag (stores the hash, not the passcode).
- New `src/components/ChannelLockGate.tsx`: unlock card, wraps
  `ChannelExportPanel` in `src/App.tsx`.
- `src/App.tsx`: mode tabs render the "Channel export" tab only when
  `isLockConfigured()` is true; the panel renders behind the gate.
- Backend parity in `server/index.ts`: `/api/channel/export` requires an
  `X-Channel-Key` header equal to the same hash when
  `CHANNEL_EXPORT_PASSCODE_HASH` is set, so the local endpoint isn't callable
  without it; `useChannelExport` sends the header after unlock.
- `electron/main.cjs` passes the hash through to the in-process server env.
- `.github/workflows/release.yml`: inject `VITE_CHANNEL_PASSCODE_HASH` and
  `CHANNEL_EXPORT_PASSCODE_HASH` from repository secrets at build time.
- `README.md`: short section on setting the passcode and generating its hash.

## What I need from you

Tell me the passcode you want (or say "generate one" and I'll produce a strong
one and give it to you once). I'll store only its hash in the build config.
