#!/usr/bin/env python3
"""
Inserts a handful of hand-written sample lessons into the database, in the
exact shape real extraction will produce, purely so the viewer has
something real to display before extraction exists.

Run after ingest.py. Safe to re-run: it clears old sample lessons first.

Usage:
    python3 seed_sample_lessons.py
"""

import os
import sqlite3

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(HERE, "data", "mentor_vault.db")

SAMPLE_LESSONS = [
    dict(
        video_id="vid001",
        timestamp_seconds=0,
        topic="sales",
        subtopic="finding first customers",
        industry=None,
        video_format="solo",
        questioner_context=None,
        transferability_note=(
            "Applies to any brand-new business with zero customers, regardless of "
            "industry — the point is that manual outreach reveals what messaging "
            "works before any money is spent on ads."
        ),
        lesson_text=(
            "When you have zero customers, don't run ads or build a funnel yet — "
            "manually go find your first ten customers one at a time, by any means "
            "necessary (cold DMs, calls, asking friends). At zero customers you don't "
            "yet know what messaging or offer works, so paid acquisition just burns "
            "money on guesses.\n\n"
            "Once you have ten paying customers, you can look at what you said and "
            "did that actually worked, and only then start turning that into a "
            "repeatable, paid process."
        ),
    ),
    dict(
        video_id="vid002",
        timestamp_seconds=6,
        topic="marketing",
        subtopic="growth levers",
        industry=None,
        video_format="solo",
        questioner_context=None,
        transferability_note=(
            "Framework applies to any business model with repeat purchase or "
            "upsell potential, not just Hormozi's portfolio companies."
        ),
        lesson_text=(
            "There are only four ways to get more customers or revenue: more leads, "
            "a better conversion rate, a higher price, or more repeat purchases. Most "
            "people default to pulling the leads lever (spend more on ads), but "
            "that's usually the most expensive one.\n\n"
            "Conversion is often the cheapest lever to pull first, because you've "
            "already paid to acquire those leads — fixing your close rate on traffic "
            "you already have is close to free money."
        ),
    ),
    dict(
        video_id="vid003",
        timestamp_seconds=10,
        topic="retention",
        subtopic="no-shows",
        industry="gyms",
        video_format="consult_qa",
        questioner_context=(
            "Gym owner gets ~40 sign-ups per class but only ~15 people actually show up."
        ),
        transferability_note=(
            "The specific fix (a small refundable booking deposit) is gym-specific, "
            "but the underlying principle — make no-shows cost the customer "
            "something small and refundable — transfers to any appointment-based "
            "business: salons, coaches, clinics, restaurants with reservations."
        ),
        lesson_text=(
            "A gym with plenty of class sign-ups but low actual attendance doesn't "
            "have a leads problem, it has a no-show problem. The fix for gyms "
            "specifically is a small refundable booking deposit (five to ten "
            "dollars) that's returned automatically when the person shows up.\n\n"
            "That alone typically cuts the no-show rate roughly in half, because it "
            "converts a free, low-commitment reservation into one with a small "
            "amount of skin in the game."
        ),
    ),
    dict(
        video_id="vid004",
        timestamp_seconds=0,
        topic="pricing",
        subtopic="discounting",
        industry=None,
        video_format="solo",
        questioner_context=None,
        transferability_note="Applies to essentially any priced product or service.",
        lesson_text=(
            "Discounting trains customers to wait for the next discount instead of "
            "buying at full price — every discount teaches the market that your "
            "listed price isn't the real price.\n\n"
            "Instead of cutting price to move product, raise the price and add more "
            "value to justify it; this protects the perceived value of the offer "
            "long-term instead of eroding it."
        ),
    ),
    dict(
        video_id="vid005",
        timestamp_seconds=0,
        topic="sales",
        subtopic="objection handling",
        industry=None,
        video_format="solo",
        questioner_context=None,
        transferability_note="A verbal-framing swap usable in any sales conversation, any industry.",
        lesson_text=(
            "Stop asking prospects \"does that make sense?\" — it assumes agreement "
            "and gives them an easy \"yes\" that hides real objections. Instead ask "
            "\"what questions do you have?\", which explicitly invites whatever "
            "objection they're actually sitting on.\n\n"
            "This one phrasing change surfaces real hesitations earlier in the "
            "conversation instead of finding out about them after the pitch is over."
        ),
    ),
]


def main():
    if not os.path.exists(DB_PATH):
        raise SystemExit(f"No database at {DB_PATH} — run ingest.py first.")

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")

    speaker_id = conn.execute(
        "SELECT id FROM speakers WHERE name = 'Alex Hormozi'"
    ).fetchone()
    if not speaker_id:
        raise SystemExit("No speaker 'Alex Hormozi' found — run ingest.py with --speaker first.")
    speaker_id = speaker_id[0]

    # Clear previously seeded sample lessons for this speaker so re-running is safe.
    old_ids = [r[0] for r in conn.execute(
        "SELECT id FROM lessons WHERE speaker_id = ?", (speaker_id,)
    ).fetchall()]
    for lid in old_ids:
        conn.execute("DELETE FROM lesson_sources WHERE lesson_id = ?", (lid,))
    conn.execute("DELETE FROM lessons WHERE speaker_id = ?", (speaker_id,))

    for sample in SAMPLE_LESSONS:
        cur = conn.execute(
            """
            INSERT INTO lessons (
                speaker_id, lesson_text, topic, subtopic, industry,
                transferability_note, video_format, questioner_context
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                speaker_id, sample["lesson_text"], sample["topic"], sample["subtopic"],
                sample["industry"], sample["transferability_note"],
                sample["video_format"], sample["questioner_context"],
            ),
        )
        lesson_id = cur.lastrowid
        conn.execute(
            "INSERT INTO lesson_sources (lesson_id, video_id, timestamp_seconds, is_primary) VALUES (?, ?, ?, 1)",
            (lesson_id, sample["video_id"], sample["timestamp_seconds"]),
        )

    conn.commit()
    conn.close()
    print(f"Seeded {len(SAMPLE_LESSONS)} sample lessons.")


if __name__ == "__main__":
    main()
