#!/usr/bin/env python3
"""
Mentor Vault — local viewer.

A small read-only web app over the SQLite database: browse lessons by topic,
filter by speaker/industry/format, full-text search, and every lesson links
back to the exact timestamped moment in the source video.

Uses only Python's standard library (no Flask, no pip install needed, no
API keys — this never calls Claude or any other AI, it just displays what's
already in the database).

Usage:
    python3 viewer/server.py
    -> open http://localhost:8420 in a browser
"""

import json
import os
import sqlite3
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DB_PATH = os.path.join(ROOT, "data", "mentor_vault.db")
STATIC_DIR = os.path.join(HERE, "static")
PORT = 8420


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def youtube_url(video_id, seconds):
    seconds = int(seconds or 0)
    return f"https://www.youtube.com/watch?v={video_id}&t={seconds}s"


def lesson_to_dict(conn, row):
    sources = conn.execute(
        "SELECT video_id, timestamp_seconds, is_primary FROM lesson_sources WHERE lesson_id = ? ORDER BY is_primary DESC, id",
        (row["id"],),
    ).fetchall()
    src_out = []
    for s in sources:
        v = conn.execute(
            "SELECT title, is_short FROM videos WHERE video_id = ?", (s["video_id"],)
        ).fetchone()
        src_out.append(
            {
                "video_id": s["video_id"],
                "video_title": v["title"] if v else s["video_id"],
                "is_short": bool(v["is_short"]) if v else False,
                "timestamp_seconds": s["timestamp_seconds"],
                "url": youtube_url(s["video_id"], s["timestamp_seconds"]),
                "is_primary": bool(s["is_primary"]),
            }
        )
    return {
        "id": row["id"],
        "speaker": row["speaker_name"],
        "lesson_text": row["lesson_text"],
        "topic": row["topic"],
        "subtopic": row["subtopic"],
        "industry": row["industry"],
        "transferability_note": row["transferability_note"],
        "video_format": row["video_format"],
        "questioner_context": row["questioner_context"],
        "sources": src_out,
    }


LESSON_SELECT = """
    SELECT lessons.*, speakers.name AS speaker_name
    FROM lessons
    JOIN speakers ON speakers.id = lessons.speaker_id
"""


def get_lessons(params):
    conn = db()
    where = []
    args = []
    q = params.get("q", [""])[0].strip()
    if q:
        # FTS5 query — quote it so punctuation in the search box can't break syntax.
        fts_query = '"' + q.replace('"', '""') + '"'
        where.append("lessons.id IN (SELECT rowid FROM lessons_fts WHERE lessons_fts MATCH ?)")
        args.append(fts_query)
    for field, col in [("speaker", "speakers.name"), ("industry", "lessons.industry"),
                        ("format", "lessons.video_format"), ("topic", "lessons.topic"),
                        ("subtopic", "lessons.subtopic")]:
        val = params.get(field, [""])[0].strip()
        if val:
            where.append(f"{col} = ?")
            args.append(val)

    sql = LESSON_SELECT
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY lessons.topic, lessons.subtopic, lessons.id"

    rows = conn.execute(sql, args).fetchall()
    out = [lesson_to_dict(conn, r) for r in rows]
    conn.close()
    return out


def get_filters():
    """Distinct values for the sidebar: topic tree, speakers, industries, formats."""
    conn = db()
    topics = conn.execute(
        "SELECT DISTINCT topic, subtopic FROM lessons ORDER BY topic, subtopic"
    ).fetchall()
    tree = {}
    for t in topics:
        tree.setdefault(t["topic"], [])
        if t["subtopic"]:
            tree[t["topic"]].append(t["subtopic"])

    speakers = [r["name"] for r in conn.execute("SELECT DISTINCT name FROM speakers ORDER BY name")]
    industries = [r["industry"] for r in conn.execute(
        "SELECT DISTINCT industry FROM lessons WHERE industry IS NOT NULL ORDER BY industry"
    )]
    formats = [r["video_format"] for r in conn.execute(
        "SELECT DISTINCT video_format FROM lessons ORDER BY video_format"
    )]
    conn.close()
    return {"topics": tree, "speakers": speakers, "industries": industries, "formats": formats}


def get_stats():
    conn = db()
    stats = {
        "videos_total": conn.execute("SELECT COUNT(*) FROM videos").fetchone()[0],
        "videos_needs_watching": conn.execute(
            "SELECT COUNT(*) FROM videos WHERE needs_watching = 1"
        ).fetchone()[0],
        "lessons_total": conn.execute("SELECT COUNT(*) FROM lessons").fetchone()[0],
        "extraction_done": conn.execute(
            "SELECT COUNT(*) FROM extraction_progress WHERE status = 'done'"
        ).fetchone()[0],
        "extraction_pending": conn.execute(
            "SELECT COUNT(*) FROM extraction_progress WHERE status = 'pending'"
        ).fetchone()[0],
    }
    conn.close()
    return stats


def get_needs_watching():
    conn = db()
    rows = conn.execute(
        "SELECT video_id, title, url, transcript_status FROM videos WHERE needs_watching = 1 ORDER BY title"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


ROUTES = {
    "/api/lessons": get_lessons,
    "/api/filters": lambda params: get_filters(),
    "/api/stats": lambda params: get_stats(),
    "/api/needs-watching": lambda params: get_needs_watching(),
}

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # keep the terminal quiet

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        if path in ROUTES:
            if not os.path.exists(DB_PATH):
                self._json({"error": "No database found yet. Run ingest.py first."}, status=404)
                return
            try:
                data = ROUTES[path](params)
                self._json(data)
            except Exception as e:
                self._json({"error": str(e)}, status=500)
            return

        if path == "/":
            path = "/index.html"
        safe_path = os.path.normpath(path).lstrip("/")
        full_path = os.path.join(STATIC_DIR, safe_path)
        if not full_path.startswith(STATIC_DIR) or not os.path.isfile(full_path):
            self.send_response(404)
            self.end_headers()
            return
        ext = os.path.splitext(full_path)[1]
        with open(full_path, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", CONTENT_TYPES.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    server = ThreadingHTTPServer(("localhost", PORT), Handler)
    print(f"Mentor Vault viewer running at http://localhost:{PORT}")
    if not os.path.exists(DB_PATH):
        print(f"(no database yet at {DB_PATH} — run ingest.py first)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
