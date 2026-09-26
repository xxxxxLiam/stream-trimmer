#!/usr/bin/env python3
"""
Mentor Vault — ingest script.

Loads a channel export (videos.csv, transcripts.csv, summary.csv,
video-status.csv, all produced by the YouTube Clipper channel exporter in
this same repo) into the shared SQLite database, under one speaker's name.

Usage:
    python3 ingest.py --speaker "Alex Hormozi" --csv-dir sample_data

Re-run it any time with a new export for the same speaker (e.g. the export
finished collecting more videos) — it's safe to run again: rows for a video
that's already in the database are replaced, not duplicated. Running it for
a different --speaker adds that mentor alongside the existing ones.
"""

import argparse
import csv
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB = os.path.join(HERE, "data", "mentor_vault.db")
SCHEMA_PATH = os.path.join(HERE, "schema.sql")

# A video's transcript_status counts as "needs watching" if this substring
# shows up in it — that's the exact note the exporter writes when caption
# fetching came back empty or failed. See server/index.ts in stream-trimmer.
NEEDS_WATCHING_MARKERS = ["no captions"]


def read_csv(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def to_bool(v):
    return str(v).strip().lower() in ("true", "1", "yes")


def to_num(v, kind=int):
    v = (v or "").strip()
    if v == "":
        return None
    try:
        return kind(v)
    except ValueError:
        return None


def get_or_create_speaker(conn, name, channel):
    row = conn.execute("SELECT id FROM speakers WHERE name = ?", (name,)).fetchone()
    if row:
        return row[0]
    cur = conn.execute(
        "INSERT INTO speakers (name, channel) VALUES (?, ?)", (name, channel)
    )
    return cur.lastrowid


def ingest(csv_dir, speaker_name, db_path):
    videos = read_csv(os.path.join(csv_dir, "videos.csv"))
    transcripts = read_csv(os.path.join(csv_dir, "transcripts.csv"))
    statuses = read_csv(os.path.join(csv_dir, "video-status.csv"))
    summary = read_csv(os.path.join(csv_dir, "summary.csv"))

    if not videos:
        sys.exit(f"No videos.csv found (or it's empty) in {csv_dir}")

    channel = summary[0]["channel"] if summary else (videos[0].get("channel") or speaker_name)

    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.executescript(open(SCHEMA_PATH).read())

    speaker_id = get_or_create_speaker(conn, speaker_name, channel)

    status_by_video = {r["video_id"]: r["status"] for r in statuses}

    n_videos = 0
    for v in videos:
        vid = v["video_id"]
        status = status_by_video.get(vid, "")
        needs_watching = 1 if any(m in status for m in NEEDS_WATCHING_MARKERS) else 0
        conn.execute(
            """
            INSERT INTO videos (
                video_id, speaker_id, url, title, description, upload_date,
                duration_seconds, is_short, view_count, like_count, comment_count,
                channel, thumbnail, tags, transcript_status, needs_watching
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(video_id) DO UPDATE SET
                speaker_id=excluded.speaker_id, url=excluded.url, title=excluded.title,
                description=excluded.description, upload_date=excluded.upload_date,
                duration_seconds=excluded.duration_seconds, is_short=excluded.is_short,
                view_count=excluded.view_count, like_count=excluded.like_count,
                comment_count=excluded.comment_count, channel=excluded.channel,
                thumbnail=excluded.thumbnail, tags=excluded.tags,
                transcript_status=excluded.transcript_status,
                needs_watching=excluded.needs_watching
            """,
            (
                vid, speaker_id, v.get("url", ""), v.get("title", ""),
                v.get("description", ""), v.get("upload_date", ""),
                to_num(v.get("duration_seconds")), 1 if to_bool(v.get("is_short")) else 0,
                to_num(v.get("view_count")), to_num(v.get("like_count")),
                to_num(v.get("comment_count")), v.get("channel", ""),
                v.get("thumbnail", ""), v.get("tags", ""), status, needs_watching,
            ),
        )
        # Only mark pending extraction work for videos whose transcript is
        # usable — a "needs watching" video has nothing to extract from yet.
        pass_name = "short" if to_bool(v.get("is_short")) else "long_form"
        if needs_watching:
            conn.execute(
                """
                INSERT INTO extraction_progress (video_id, pass, status, notes)
                VALUES (?, ?, 'needs_watching', ?)
                ON CONFLICT(video_id) DO UPDATE SET
                    pass=excluded.pass, status=excluded.status, notes=excluded.notes
                """,
                (vid, pass_name, status),
            )
        else:
            conn.execute(
                """
                INSERT INTO extraction_progress (video_id, pass, status)
                VALUES (?, ?, 'pending')
                ON CONFLICT(video_id) DO NOTHING
                """,
                (vid, pass_name),
            )
        n_videos += 1

    # Group transcript lines by video, in file order (their natural caption order).
    lines_by_video = {}
    for row in transcripts:
        lines_by_video.setdefault(row["video_id"], []).append(row)

    n_lines = 0
    for vid, lines in lines_by_video.items():
        conn.execute("DELETE FROM transcript_lines WHERE video_id = ?", (vid,))
        texts = []
        for seq, row in enumerate(lines):
            start = to_num(row.get("start"), float) or 0.0
            end = to_num(row.get("end"), float) or start
            text = row.get("text", "")
            conn.execute(
                "INSERT INTO transcript_lines (video_id, seq, start, end, text) VALUES (?, ?, ?, ?, ?)",
                (vid, seq, start, end, text),
            )
            texts.append(text)
            n_lines += 1
        full_text = " ".join(texts)
        conn.execute(
            """
            INSERT INTO video_transcripts (video_id, full_text, line_count) VALUES (?, ?, ?)
            ON CONFLICT(video_id) DO UPDATE SET full_text=excluded.full_text, line_count=excluded.line_count
            """,
            (vid, full_text, len(lines)),
        )

    conn.commit()

    needs_watching_count = conn.execute(
        "SELECT COUNT(*) FROM videos WHERE needs_watching = 1"
    ).fetchone()[0]
    conn.close()

    print(f"Ingested {n_videos} videos ({n_lines} caption lines) for {speaker_name!r} into {db_path}")
    if needs_watching_count:
        print(f"  {needs_watching_count} video(s) flagged 'needs watching' (missing/failed transcript)")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--speaker", required=True, help='Mentor name, e.g. "Alex Hormozi"')
    p.add_argument("--csv-dir", required=True, help="Folder containing videos.csv etc.")
    p.add_argument("--db", default=DEFAULT_DB, help=f"SQLite file to write to (default: {DEFAULT_DB})")
    args = p.parse_args()
    ingest(args.csv_dir, args.speaker, args.db)


if __name__ == "__main__":
    main()
