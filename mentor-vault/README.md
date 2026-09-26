# Mentor Vault

Turns a channel export (from this repo's exporter) into a searchable,
permanent knowledge base of lessons, browsable in a local web viewer.

This folder is self-contained and doesn't touch the YouTube Clipper app in
the rest of this repo — it just lives in the same GitHub repository for
convenience.

## What's here right now

- `schema.sql` — the database layout (videos, transcripts, lessons, sources, extraction progress).
- `ingest.py` — loads a channel export's CSVs into the database.
- `seed_sample_lessons.py` — inserts 5 hand-written sample lessons, in the exact shape real extraction will produce, so you can see the format before extraction is built.
- `sample_data/` — small fake CSVs (6 videos) shaped exactly like the real export, for testing.
- `viewer/` — the local web app you browse lessons in.
- `data/` — where the real database file lives (not committed to git).

The **extraction system** (Claude reading transcripts and writing lessons) isn't built yet — that's next, once you've approved the look of the viewer and the lesson format below.

## Try it now, with fake sample data

No installation needed — just Python, which is already on this machine.

```
cd mentor-vault
python3 ingest.py --speaker "Alex Hormozi" --csv-dir sample_data
python3 seed_sample_lessons.py
python3 viewer/server.py
```

Then open **http://localhost:8420** in a browser. You should see 5 sample
lessons (about first customers, growth levers, gym no-shows, discounting,
and objection handling), each with topic tags, an industry tag where one
applies, a transferability note, and a link that jumps straight to the
timestamp in the (fake) source video. There's also a "1 needs watching"
button — that's the one fake video whose captions failed, which extraction
will skip until you watch it manually.

## When your real export arrives

Upload the export folder (or just `videos.csv`, `transcripts.csv`,
`summary.csv`, `video-status.csv`) here in the project chat, and I'll:

1. Run `ingest.py` against it instead of the sample data.
2. Wipe the 5 fake sample lessons.
3. Run a **test batch of 15 varied real videos** through extraction and show you the results here for approval before running it on all 5,626.

Re-ingesting is always safe to re-run — it replaces a video's row if it's
already there instead of duplicating it, so if your export finishes in
batches, just re-run `ingest.py` each time a new batch is ready.

## A note on cost

Loading CSVs and running the viewer costs nothing (no AI calls at all —
it's a plain database and a plain web page). The expensive part is
**extraction**: reading through thousands of video transcripts with Claude.
I'll always flag it before running that at scale, and the 15-video test
batch happens first so you can see quality and rough cost per video before
committing to the full catalog.
