<!--
  This file is the README for the PUBLIC releases repository
  (github.com/xxxxxLiam/clipr). It is kept here so it stays with the source.
  Copy its contents — from the line below — into that repo's README.md.
  Everything above this line is a note to you, not part of it.
-->

# Clipr

Cut short vertical clips out of long podcasts and interviews, fast.

Clipr is a desktop app for clippers: paste a link, read the transcript to find
the moment, mark in and out, and cut. A clip can be several ranges joined into
one file. It keeps your campaigns, folders and naming apart, remembers which
moments you have already used, and hands the finished clip and its text
straight to your editor.

**This repository holds the downloads only.** The source lives in a private
repository.

## Download

Grab the newest installer from the [latest
release](https://github.com/xxxxxLiam/clipr/releases/latest):

| Platform | File |
|---|---|
| macOS (Apple Silicon) | `Clipr-macOS-AppleSilicon.dmg` |
| Windows | `Clipr-Windows-x64-Setup.exe` |
| Linux | `Clipr-Linux-x64.AppImage` |

The app updates itself after that; you only download once.

### macOS: "unidentified developer"

The macOS build is not yet signed with an Apple Developer certificate, so
Gatekeeper will refuse a plain double-click. Right-click the app and choose
**Open**, then confirm. You only do this once.

### Windows: SmartScreen

Windows may show "Windows protected your PC" for the same reason. Choose
**More info**, then **Run anyway**.

Both warnings mean "we cannot verify who published this", not "this is
malware". Signing certificates are on the roadmap.

## Getting 1080p

YouTube serves 360p to signed-out requests. The app will ask you, once, for a
`cookies.txt` exported from your own browser, and explains how. The file stays
on your computer and is never uploaded. You can skip it and work at 360p; the
header tells you which you are getting.

## Licence

Free to download and use, including for paid client work — the clips you make
are yours.

Not open source: copying, redistributing, forking or reselling the application
is not permitted. See the `LICENSE` file inside the installed application, or
[LICENSE](https://github.com/xxxxxLiam/clipr/blob/main/LICENSE) here.

Clipr ships alongside **ffmpeg**, which is licensed under the GNU General
Public License v3 and carries its own terms that this licence does not
override. See
[THIRD-PARTY-NOTICES.md](https://github.com/xxxxxLiam/clipr/blob/main/THIRD-PARTY-NOTICES.md)
for the full component list and for how to obtain corresponding source.

## Reporting a problem

Open an [issue](https://github.com/xxxxxLiam/clipr/issues). If the app showed
you a **Copy diagnostics** button next to the error, use it and paste the
result — it collects the logs for that one failure, with cookies, tokens and
personal paths removed.
