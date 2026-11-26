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
(`POT_PROVIDER_REF`, currently `2.0.2`), runs its own `npm ci && npx tsc`, prunes it down to
production dependencies only, and copies its build output *and* its `node_modules` into
`resources/pot-provider/` — gitignored, never committed to this repo. It is not one self-contained
file: `build/main.js` imports sibling files in the same folder and plain Node packages
(`express`, `commander`, ...) from `node_modules` beside it, confirmed by actually running it, not
by reading its source. The command finishes by starting the vendored build itself and polling its
`/ping` endpoint, so a build that doesn't actually come up fails the command loudly instead of
silently vendoring something broken.

`potTokenProvider.ts` only finds and starts it once both `build/main.js` and `node_modules` exist;
with no `POT_PROVIDER_LICENSE_ACK` or no refresh ever run, nothing changes from how the app behaves
today (the token-free client list yt-dlp already falls back to, which this app already shipped).

**This has to be run separately on each platform's own build host** — Windows, macOS (both
Intel and Apple Silicon) and Linux each need their own run, because `canvas`, one of the
provider's dependencies, is a native module. Running it once on one machine and copying
`resources/pot-provider/` to another platform will not work. This has only actually been run and
verified (build + smoke test) on Linux from this cloud session; it has not been run on Windows or
macOS at all.

To pick up a newer bgutil release: bump `POT_PROVIDER_REF` in `scripts/bundle-binaries.cjs` to the
new tag, then run the command again. That is the entire monthly routine — one line changed, one
command run.

yt-dlp and ffmpeg/Deno are unaffected by any of this: they already refresh automatically on every
`npm run build:electron` (see the rest of `bundle-binaries.cjs`), and yt-dlp separately self-updates
at runtime (`toolUpdater.ts`) with a checksum-verified install that never replaces a working binary
with one that fails to run. Nothing about the PO token provider changes that.

## Verified, and not verified yet

Verified by actually running the vendored build (not just reading its source), on Linux, from this
cloud session: it clones, builds and prunes cleanly; the server starts and answers `/ping`; the
app's own `potTokenProvider.ts` finds and starts it and gets a working base URL back.

Not verified:

- Whether `bgutil`'s native `canvas` dependency has a prebuilt binary for win-x64, mac-x64 and
  mac-arm64 — `tools:refresh-pot` has to be run and its smoke test watched on each of those
  platforms directly; it cannot be inferred from the Linux run above.
- Whether an unsigned Mac build (no Apple Developer ID, which is how Clipr ships today) runs a
  bundled Deno + a native module without a Gatekeeper problem.
- Whether the provider actually mints a usable token against real YouTube and fixes the quality
  cap — this session has no network path to YouTube, only to GitHub/npm, so everything above
  confirms the provider *runs*, not that it *works* against YouTube.
- A real `yt-dlp -v -F` capture against a failing video, which is what actually tells us whether a
  given failure needs this fix at all, or is one of the two other causes a token can't fix (YouTube
  forcing an unsupported SABR-only stream, or no JS runtime — Deno is already bundled, which should
  already rule the second one out for this app).

None of the above can be checked from this cloud session: no network path to YouTube, and no real
Windows or Mac machine to run the packaged app on.
