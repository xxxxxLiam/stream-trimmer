# Third-party notices

Clipr is published by IDK Solutions (Pty) Ltd and distributed under its own
licence (see `LICENSE`), but it ships alongside independent programs that
carry their own terms. Those terms govern those programs, and nothing in
`LICENSE` overrides them.

Clipr was previously released as **YouTube Clipper**; these notices cover the
binaries shipped with Clipr.

Each of the three bundled binaries runs as a **separate process**, invoked
with command-line arguments. None of them is linked into the application.
They are installed under `resources/bin/` (with a `.exe` suffix on Windows).

## ffmpeg — GNU General Public License v3.0 or later

Used to cut segments and join them into one file.

The exact binary is downloaded at build time from the
[`eugeneware/ffmpeg-static`](https://github.com/eugeneware/ffmpeg-static)
GitHub releases — **release tag `b6.0`**, asset
`ffmpeg-<platform>-<arch>.gz`. (The `ffmpeg-static` npm package is not used to
supply the shipped binary.)

The binary reports its own licence when run with `ffmpeg -L`:

> ffmpeg is free software; you can redistribute it and/or modify it under the
> terms of the GNU General Public License as published by the Free Software
> Foundation; either version 3 of the License, or (at your option) any later
> version.

**Your rights to ffmpeg come from the GPL, not from this project's licence.**
You may redistribute and modify ffmpeg itself under the GPL's terms, entirely
independently of Clipr.

### Corresponding source

GPL-3.0 section 6 requires that anyone distributing these binaries makes the
corresponding source available. The exact build shipped here comes from
`ffmpeg-static` release `b6.0`, which publishes both the binaries and the
build scripts they were produced with:

- Binaries and build scripts, tag `b6.0`:
  https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.0
- ffmpeg upstream source: https://git.ffmpeg.org/ffmpeg.git and
  https://ffmpeg.org/download.html
- Licence text: https://www.gnu.org/licenses/gpl-3.0.txt

If you want the corresponding source for the exact binary in a particular
release of Clipr and cannot obtain it from the links above, open an issue at
https://github.com/xxxxxLiam/clipr/issues and it will be provided.

Note that this build includes GPL-licensed components such as **libx264**,
which the re-encode path uses. That is why the bundled ffmpeg is GPL rather
than LGPL.

## yt-dlp — The Unlicense (public domain)

Downloaded at build time from the [yt-dlp nightly
builds](https://github.com/yt-dlp/yt-dlp-nightly-builds) (latest release at
build time). Used to read video metadata, subtitles and comments, and to
download media.

The nightly channel is deliberate: extractor breakages are fixed there first,
and yt-dlp's stable tags can trail a fix by weeks. The version that actually
shipped is recorded at build time from the binary's own `--version`.

yt-dlp is released into the public domain under The Unlicense:
https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE

## Deno — MIT License

Downloaded at build time from the [Deno
releases](https://github.com/denoland/deno) (latest release at build time).
Present only because yt-dlp's JavaScript-challenge step needs a JavaScript
runtime.

Licence: https://github.com/denoland/deno/blob/main/LICENSE.md

## Electron — MIT License

Clipr runs on [Electron](https://github.com/electron/electron), which is MIT
licensed and itself embeds Chromium and Node.js. Chromium is distributed
under the BSD-3-Clause licence with a number of additional component
licences; the full set is viewable from the application via Chromium's
`chrome://credits` equivalent, and at
https://github.com/electron/electron/blob/main/LICENSE

## npm dependencies

Clipr's JavaScript dependencies are predominantly MIT, ISC or BSD licensed.
They are declared in `package.json` and pinned in `package-lock.json` in the
source repository, which is not distributed with the installer, so a full
inventory cannot be produced from an installed copy.

If you need the complete dependency-and-licence inventory, open an issue at
https://github.com/xxxxxLiam/clipr/issues and it will be provided. From a
source checkout it is:

```
npx license-checker --production --summary
```

---

If you believe a component is missing from this file or is attributed
incorrectly, please open an issue — that is a bug and will be fixed.

<!-- GENERATED: bundled JS license comments, written by scripts/buildHardening.cjs -->
### Collected from the engine's bundle

```
Bundled license information:

depd/index.js:
  /*!
   * depd
   * Copyright(c) 2014-2018 Douglas Christopher Wilson
   * MIT Licensed
   */

bytes/index.js:
  /*!
   * bytes
   * Copyright(c) 2012-2014 TJ Holowaychuk
   * Copyright(c) 2015 Jed Watson
   * MIT Licensed
   */

content-type/index.js:
  /*!
   * content-type
   * Copyright(c) 2015 Douglas Christopher Wilson
   * MIT Licensed
   */

statuses/index.js:
  /*!
   * statuses
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2016 Douglas Christopher Wilson
   * MIT Licensed
   */

toidentifier/index.js:
  /*!
   * toidentifier
   * Copyright(c) 2016 Douglas Christopher Wilson
   * MIT Licensed
   */

http-errors/index.js:
  /*!
   * http-errors
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2016 Douglas Christopher Wilson
   * MIT Licensed
   */

destroy/index.js:
  /*!
   * destroy
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2015-2022 Douglas Christopher Wilson
   * MIT Licensed
   */

unpipe/index.js:
  /*!
   * unpipe
   * Copyright(c) 2015 Douglas Christopher Wilson
   * MIT Licensed
   */

raw-body/index.js:
  /*!
   * raw-body
   * Copyright(c) 2013-2014 Jonathan Ong
   * Copyright(c) 2014-2022 Douglas Christopher Wilson
   * MIT Licensed
   */

ee-first/index.js:
  /*!
   * ee-first
   * Copyright(c) 2014 Jonathan Ong
   * MIT Licensed
   */

on-finished/index.js:
  /*!
   * on-finished
   * Copyright(c) 2013 Jonathan Ong
   * Copyright(c) 2014 Douglas Christopher Wilson
   * MIT Licensed
   */

body-parser/lib/read.js:
  /*!
   * body-parser
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   */

media-typer/index.js:
  /*!
   * media-typer
   * Copyright(c) 2014 Douglas Christopher Wilson
   * MIT Licensed
   */

mime-db/index.js:
  /*!
   * mime-db
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2015-2022 Douglas Christopher Wilson
   * MIT Licensed
   */

mime-types/index.js:
  /*!
   * mime-types
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2015 Douglas Christopher Wilson
   * MIT Licensed
   */

type-is/index.js:
  /*!
   * type-is
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   */

body-parser/lib/types/json.js:
  /*!
   * body-parser
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   */

body-parser/lib/types/raw.js:
  /*!
   * body-parser
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   */

body-parser/lib/types/text.js:
  /*!
   * body-parser
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   */

body-parser/lib/types/urlencoded.js:
  /*!
   * body-parser
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   */

body-parser/index.js:
  /*!
   * body-parser
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   */

merge-descriptors/index.js:
  /*!
   * merge-descriptors
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2015 Douglas Christopher Wilson
   * MIT Licensed
   */

encodeurl/index.js:
  /*!
   * encodeurl
   * Copyright(c) 2016 Douglas Christopher Wilson
   * MIT Licensed
   */

escape-html/index.js:
  /*!
   * escape-html
   * Copyright(c) 2012-2013 TJ Holowaychuk
   * Copyright(c) 2015 Andreas Lubbe
   * Copyright(c) 2015 Tiancheng "Timothy" Gu
   * MIT Licensed
   */

parseurl/index.js:
  /*!
   * parseurl
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2014-2017 Douglas Christopher Wilson
   * MIT Licensed
   */

finalhandler/index.js:
  /*!
   * finalhandler
   * Copyright(c) 2014-2022 Douglas Christopher Wilson
   * MIT Licensed
   */

express/lib/router/layer.js:
  /*!
   * express
   * Copyright(c) 2009-2013 TJ Holowaychuk
   * Copyright(c) 2013 Roman Shtylman
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   */

methods/index.js:
  /*!
   * methods
   * Copyright(c) 2013-2014 TJ Holowaychuk
   * Copyright(c) 2015-2016 Douglas Christopher Wilson
   * MIT Licensed
   */

express/lib/router/route.js:
  /*!
   * express
   * Copyright(c) 2009-2013 TJ Holowaychuk
   * Copyright(c) 2013 Roman Shtylman
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   */

express/lib/router/index.js:
  /*!
   * express
   * Copyright(c) 2009-2013 TJ Holowaychuk
   * Copyright(c) 2013 Roman Shtylman
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   */

express/lib/middleware/init.js:
  /*!
   * express
   * Copyright(c) 2009-2013 TJ Holowaychuk
   * Copyright(c) 2013 Roman Shtylman
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   */

express/lib/middleware/query.js:
  /*!
   * express
   * Copyright(c) 2009-2013 TJ Holowaychuk
   * Copyright(c) 2013 Roman Shtylman
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   */

express/lib/view.js:
  /*!
   * express
   * Copyright(c) 2009-2013 TJ Holowaychuk
   * Copyright(c) 2013 Roman Shtylman
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   */

safe-buffer/index.js:
  /*! safe-buffer. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> */

content-disposition/index.js:
  /*!
   * content-disposition
   * Copyright(c) 2014-2017 Douglas Christopher Wilson
   * MIT Licensed
   */

etag/index.js:
  /*!
   * etag
   * Copyright(c) 2014-2016 Douglas Christopher Wilson
   * MIT Licensed
   */

fresh/index.js:
  /*!
   * fresh
   * Copyright(c) 2012 TJ Holowaychuk
   * Copyright(c) 2016-2017 Douglas Christopher Wilson
   * MIT Licensed
   */

range-parser/index.js:
  /*!
   * range-parser
   * Copyright(c) 2012-2014 TJ Holowaychuk
   * Copyright(c) 2015-2016 Douglas Christopher Wilson
   * MIT Licensed
   */

send/index.js:
  /*!
   * send
   * Copyright(c) 2012 TJ Holowaychuk
   * Copyright(c) 2014-2022 Douglas Christopher Wilson
   * MIT Licensed
   */

forwarded/index.js:
  /*!
   * forwarded
   * Copyright(c) 2014-2017 Douglas Christopher Wilson
   * MIT Licensed
   */

proxy-addr/index.js:
  /*!
   * proxy-addr
   * Copyright(c) 2014-2016 Douglas Christopher Wilson
   * MIT Licensed
   */

express/lib/utils.js:
  /*!
   * express
   * Copyright(c) 2009-2013 TJ Holowaychuk
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   */

express/lib/application.js:
  /*!
   * express
   * Copyright(c) 2009-2013 TJ Holowaychuk
   * Copyright(c) 2013 Roman Shtylman
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   */

negotiator/index.js:
  /*!
   * negotiator
   * Copyright(c) 2012 Federico Romero
   * Copyright(c) 2012-2014 Isaac Z. Schlueter
   * Copyright(c) 2015 Douglas Christopher Wilson
   * MIT Licensed
   */

accepts/index.js:
  /*!
   * accepts
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2015 Douglas Christopher Wilson
   * MIT Licensed
   */

express/lib/request.js:
  /*!
   * express
   * Copyright(c) 2009-2013 TJ Holowaychuk
   * Copyright(c) 2013 Roman Shtylman
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   */

cookie/index.js:
  /*!
   * cookie
   * Copyright(c) 2012-2014 Roman Shtylman
   * Copyright(c) 2015 Douglas Christopher Wilson
   * MIT Licensed
   */

vary/index.js:
  /*!
   * vary
   * Copyright(c) 2014-2017 Douglas Christopher Wilson
   * MIT Licensed
   */

express/lib/response.js:
  /*!
   * express
   * Copyright(c) 2009-2013 TJ Holowaychuk
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   */

serve-static/index.js:
  /*!
   * serve-static
   * Copyright(c) 2010 Sencha Inc.
   * Copyright(c) 2011 TJ Holowaychuk
   * Copyright(c) 2014-2016 Douglas Christopher Wilson
   * MIT Licensed
   */

express/lib/express.js:
  /*!
   * express
   * Copyright(c) 2009-2013 TJ Holowaychuk
   * Copyright(c) 2013 Roman Shtylman
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   */

express/index.js:
  /*!
   * express
   * Copyright(c) 2009-2013 TJ Holowaychuk
   * Copyright(c) 2013 Roman Shtylman
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   */

object-assign/index.js:
  /*
  object-assign
  (c) Sindre Sorhus
  @license MIT
  */
```
<!-- END GENERATED -->
