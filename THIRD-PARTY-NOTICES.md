# Third-party notices

YouTube Clipper is distributed under its own licence (see `LICENSE`), but it
ships alongside independent programs that carry their own terms. Those terms
govern those programs, and nothing in `LICENSE` overrides them.

Each of the three bundled binaries runs as a **separate process**, invoked
with command-line arguments. None of them is linked into the application.

## ffmpeg — GNU General Public License v3.0 or later

Bundled via [`ffmpeg-static`](https://github.com/eugeneware/ffmpeg-static) and
placed at `resources/bin/ffmpeg` in the installed application. Used to cut
segments and join them into one file.

The binary reports its own licence when run with `ffmpeg -L`:

> ffmpeg is free software; you can redistribute it and/or modify it under the
> terms of the GNU General Public License as published by the Free Software
> Foundation; either version 3 of the License, or (at your option) any later
> version.

**Your rights to ffmpeg come from the GPL, not from this project's licence.**
You may redistribute and modify ffmpeg itself under the GPL's terms, entirely
independently of YouTube Clipper.

### Corresponding source

GPL-3.0 section 6 requires that anyone distributing these binaries makes the
corresponding source available. The exact builds shipped here come from
`ffmpeg-static`'s releases, which publish both the binaries and the source
they were built from:

- Binaries and build scripts: https://github.com/eugeneware/ffmpeg-static
- ffmpeg upstream source: https://git.ffmpeg.org/ffmpeg.git and
  https://ffmpeg.org/download.html
- Licence text: https://www.gnu.org/licenses/gpl-3.0.txt

If you want the corresponding source for the exact binary in a particular
release of this application and cannot obtain it from the links above, open
an issue at https://github.com/xxxxxLiam/stream-trimmer and it will be
provided.

Note that this build includes GPL-licensed components such as **libx264**,
which the re-encode path uses. That is why the bundled ffmpeg is GPL rather
than LGPL.

## yt-dlp — The Unlicense (public domain)

Bundled from the [yt-dlp nightly
releases](https://github.com/yt-dlp/yt-dlp-nightly-builds) and placed at
`resources/bin/yt-dlp`. Used to read video metadata, subtitles and comments,
and to download media.

yt-dlp is released into the public domain under The Unlicense:
https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE

## Deno — MIT License

Bundled from the [Deno releases](https://github.com/denoland/deno) and placed
at `resources/bin/deno`. Present only because yt-dlp's JavaScript-challenge
step needs a JavaScript runtime.

Licence: https://github.com/denoland/deno/blob/main/LICENSE.md

## Electron — MIT License

The application runs on [Electron](https://github.com/electron/electron),
which is MIT licensed and itself embeds Chromium and Node.js. Chromium is
distributed under the BSD-3-Clause licence with a number of additional
component licences; the full set is viewable from the application via
Chromium's `chrome://credits` equivalent, and at
https://github.com/electron/electron/blob/main/LICENSE

## npm dependencies

The application's JavaScript dependencies are listed in `package.json` and
pinned in `package-lock.json`, and are predominantly MIT, ISC or
BSD licensed. A full machine-readable inventory can be produced with:

```
npx license-checker --production --summary
```

---

If you believe a component is missing from this file or is attributed
incorrectly, please open an issue — that is a bug and will be fixed.
