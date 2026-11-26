# PO token provider (anonymous 1080p without sign-in)

## What this is

Some YouTube player clients (`mweb`, `web_creator`, plain `web`) refuse to hand back usable
video/audio formats unless the request carries a "PO token" (Proof of Origin) — without one,
YouTube often leaves only `itag 18`, a pre-merged 360p stream. A PO token provider mints that
token locally, so those clients become usable anonymously, same as a signed-in session already
is. It has nothing to do with sign-in itself: age-restricted, members-only and private videos
still need an account.

We use [bgutil-ytdlp-pot-provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider)
(GPL-3.0), running its own HTTP server, which `src/main/features/engine/services/download/potTokenProvider.ts`
starts as a separate child process on `127.0.0.1` and points yt-dlp at with
`--extractor-args youtubepot-bgutilhttp:base_url=...`.

## The licence gate — read this before running anything below

bgutil is GPL-3.0. Running it as a standalone child process our code talks to over HTTP, rather
than linking it into our own process, is the usual way projects avoid GPL's copyleft obligations
extending to the rest of the app — but that is an engineering read, not legal advice. **Liam has
not yet cleared bundling this with a lawyer.** Nothing below runs without
`POT_PROVIDER_LICENSE_ACK=1` set explicitly, and that env var exists for exactly one reason: to
make sure this is never built by accident before that review happens.

## Refreshing it (monthly, one command)

```
POT_PROVIDER_LICENSE_ACK=1 npm run tools:refresh-pot
```

This clones `bgutil-ytdlp-pot-provider` at the pinned tag in `scripts/bundle-binaries.cjs`
(`POT_PROVIDER_REF`, currently `2.0.2`), runs its own `npm ci && npx tsc`, and copies the built
server into `resources/pot-provider/server.js` — gitignored, never committed to this repo.
`potTokenProvider.ts` only finds and starts it if that file exists; with no `POT_PROVIDER_LICENSE_ACK`
or no refresh ever run, nothing changes from how the app behaves today (the token-free client list
yt-dlp already falls back to, which this app already shipped).

To pick up a newer bgutil release: bump `POT_PROVIDER_REF` in `scripts/bundle-binaries.cjs` to the
new tag, then run the command again. That is the entire monthly routine — one line changed, one
command run.

yt-dlp and ffmpeg/Deno are unaffected by any of this: they already refresh automatically on every
`npm run build:electron` (see the rest of `bundle-binaries.cjs`), and yt-dlp separately self-updates
at runtime (`toolUpdater.ts`) with a checksum-verified install that never replaces a working binary
with one that fails to run. Nothing about the PO token provider changes that.

## Not verified yet

- Whether `bgutil`'s native `canvas` dependency has a prebuilt binary for win-x64, mac-x64 and
  mac-arm64 — the refresh command logs a warning either way; only running the built app on each
  platform confirms it actually starts.
- Whether an unsigned Mac build (no Apple Developer ID, which is how Clipr ships today) runs a
  bundled Deno + native module without a Gatekeeper problem.
- The exact file the provider's own build produces (`findFileNamed` in `bundle-binaries.cjs`
  searches for `main.js` under its build output rather than a hardcoded path, specifically because
  this was not confirmed against the real repo from this environment).
- A real `yt-dlp -v -F` capture against a failing video, which is what actually tells us whether a
  given failure needs this fix at all, or is one of the two other causes a token can't fix (YouTube
  forcing an unsupported SABR-only stream, or no JS runtime — Deno is already bundled, which should
  already rule the second one out for this app).

None of the above can be checked from this cloud session: no network path to YouTube, and no real
Windows or Mac machine to run the packaged app on.
