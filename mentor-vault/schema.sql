-- Mentor Vault database schema.
-- Built for SQLite. Speaker is a first-class field everywhere so a second
-- mentor (e.g. Vusi Thembekwayo) can be ingested later without changing
-- the shape of anything.

PRAGMA foreign_keys = ON;

-- One row per mentor. Re-running the pipeline for a new person just adds a
-- row here plus their own videos/transcripts/lessons.
CREATE TABLE IF NOT EXISTS speakers (
    id      INTEGER PRIMARY KEY,
    name    TEXT NOT NULL UNIQUE,      -- e.g. "Alex Hormozi"
    channel TEXT                        -- YouTube channel name, as exported
);

-- One row per source video, straight from videos.csv.
CREATE TABLE IF NOT EXISTS videos (
    video_id            TEXT PRIMARY KEY,
    speaker_id          INTEGER NOT NULL REFERENCES speakers(id),
    url                 TEXT NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    upload_date         TEXT,           -- YYYYMMDD as exported
    duration_seconds    INTEGER,
    is_short            INTEGER NOT NULL DEFAULT 0,   -- 0/1
    view_count          INTEGER,
    like_count          INTEGER,
    comment_count       INTEGER,
    channel             TEXT,
    thumbnail           TEXT,
    tags                TEXT,           -- "; "-joined, as exported
    -- Filled in by the ingest script from video-status.csv:
    transcript_status   TEXT,           -- raw status string, e.g. "ok", "no captions"
    needs_watching      INTEGER NOT NULL DEFAULT 0     -- 1 = transcript missing/failed
);
CREATE INDEX IF NOT EXISTS idx_videos_speaker ON videos(speaker_id);
CREATE INDEX IF NOT EXISTS idx_videos_is_short ON videos(is_short);
CREATE INDEX IF NOT EXISTS idx_videos_needs_watching ON videos(needs_watching);

-- Raw caption lines, kept exactly as exported (one row per caption line),
-- so the original timestamps are never lost.
CREATE TABLE IF NOT EXISTS transcript_lines (
    id          INTEGER PRIMARY KEY,
    video_id    TEXT NOT NULL REFERENCES videos(video_id),
    seq         INTEGER NOT NULL,   -- original order within the video
    start       REAL NOT NULL,      -- seconds
    end         REAL NOT NULL,      -- seconds
    text        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_translines_video ON transcript_lines(video_id, seq);

-- The reassembled full transcript per video (caption lines joined into
-- readable text), so extraction can read one video at a time without
-- re-joining lines every time.
CREATE TABLE IF NOT EXISTS video_transcripts (
    video_id    TEXT PRIMARY KEY REFERENCES videos(video_id),
    full_text   TEXT NOT NULL,
    line_count  INTEGER NOT NULL
);

-- Extraction progress, one row per video, so any future session can see
-- what's done and resume instead of re-processing.
CREATE TABLE IF NOT EXISTS extraction_progress (
    video_id        TEXT PRIMARY KEY REFERENCES videos(video_id),
    pass            TEXT NOT NULL DEFAULT 'long_form',  -- 'long_form' or 'short'
    status          TEXT NOT NULL DEFAULT 'pending',    -- pending | done | skipped | needs_watching
    lesson_count    INTEGER NOT NULL DEFAULT 0,
    processed_at    TEXT,
    notes           TEXT
);

-- One row per distinct lesson extracted from the transcripts.
CREATE TABLE IF NOT EXISTS lessons (
    id                      INTEGER PRIMARY KEY,
    speaker_id              INTEGER NOT NULL REFERENCES speakers(id),
    lesson_text             TEXT NOT NULL,      -- the 1-2 paragraph write-up
    topic                   TEXT NOT NULL,      -- e.g. "sales"
    subtopic                TEXT,               -- e.g. "objection handling"
    industry                TEXT,               -- e.g. "gyms" or NULL if general
    transferability_note    TEXT,               -- how it applies beyond that industry
    video_format            TEXT NOT NULL,      -- 'solo' | 'consult_qa'
    questioner_context      TEXT,               -- consult/Q&A only: the asker's situation
    created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lessons_speaker ON lessons(speaker_id);
CREATE INDEX IF NOT EXISTS idx_lessons_topic ON lessons(topic, subtopic);
CREATE INDEX IF NOT EXISTS idx_lessons_industry ON lessons(industry);
CREATE INDEX IF NOT EXISTS idx_lessons_format ON lessons(video_format);

-- Every place a lesson was said. Usually one row; a lesson also taught in a
-- Short gets a second row pointing at that Short instead of duplicating the
-- lesson text.
CREATE TABLE IF NOT EXISTS lesson_sources (
    id                  INTEGER PRIMARY KEY,
    lesson_id           INTEGER NOT NULL REFERENCES lessons(id),
    video_id            TEXT NOT NULL REFERENCES videos(video_id),
    timestamp_seconds   INTEGER NOT NULL,
    is_primary          INTEGER NOT NULL DEFAULT 1   -- 1 = the original long-form source
);
CREATE INDEX IF NOT EXISTS idx_sources_lesson ON lesson_sources(lesson_id);
CREATE INDEX IF NOT EXISTS idx_sources_video ON lesson_sources(video_id);

-- Full-text search over lessons (topic/subtopic/industry/text all searchable).
CREATE VIRTUAL TABLE IF NOT EXISTS lessons_fts USING fts5(
    lesson_text, topic, subtopic, industry,
    content='lessons', content_rowid='id'
);

-- Keep the FTS index in sync with the lessons table.
CREATE TRIGGER IF NOT EXISTS lessons_ai AFTER INSERT ON lessons BEGIN
    INSERT INTO lessons_fts(rowid, lesson_text, topic, subtopic, industry)
    VALUES (new.id, new.lesson_text, new.topic, new.subtopic, new.industry);
END;
CREATE TRIGGER IF NOT EXISTS lessons_ad AFTER DELETE ON lessons BEGIN
    INSERT INTO lessons_fts(lessons_fts, rowid, lesson_text, topic, subtopic, industry)
    VALUES ('delete', old.id, old.lesson_text, old.topic, old.subtopic, old.industry);
END;
CREATE TRIGGER IF NOT EXISTS lessons_au AFTER UPDATE ON lessons BEGIN
    INSERT INTO lessons_fts(lessons_fts, rowid, lesson_text, topic, subtopic, industry)
    VALUES ('delete', old.id, old.lesson_text, old.topic, old.subtopic, old.industry);
    INSERT INTO lessons_fts(rowid, lesson_text, topic, subtopic, industry)
    VALUES (new.id, new.lesson_text, new.topic, new.subtopic, new.industry);
END;
