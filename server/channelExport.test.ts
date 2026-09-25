/**
 * File: channelExport.test.ts
 * Path: server/channelExport.test.ts
 * Description: End-to-end tests for the channel exporter. Each one boots the
 * real server against a fake yt-dlp binary and drives /api/channel/export over
 * HTTP, so what is checked is the shipped code path — the listing, the
 * ranking, the checkpoints and the CSVs on disk — not a stub of it.
 *
 * These cover the bugs this work exists for: an export that stopped at ten
 * videos, could not be asked for more than five hundred, gave up on the
 * channel listing at three thousand, and held every row in memory on the way
 * out.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  readCsvFile,
  runExport,
  startHarness,
  type FakeChannel,
  type Harness,
} from "./testSupport/exportHarness";

// Booting a server and spawning a process per video is slower than a unit
// test; the default timeout is nowhere near enough for the larger channels.
// The fake yt-dlp is wrapped in a POSIX shell script, so these skip on
// Windows rather than failing for a reason that has nothing to do with the
// exporter. CI runs them on Linux.
const SLOW = {
  timeout: 600_000,
  skip:
    process.platform === "win32"
      ? "the fake yt-dlp shim is a POSIX shell script"
      : false,
};

// try/finally rather than t.after, which needs a newer Node than .nvmrc pins.
async function withHarness<T>(
  channel: FakeChannel,
  fn: (harness: Harness) => Promise<T>,
): Promise<T> {
  const harness = await startHarness(channel);
  try {
    return await fn(harness);
  } finally {
    await harness.stop();
  }
}

function filesByName(data: any): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of data.files) out[f.name] = f.path;
  return out;
}

test("exports every video when asked for everything", SLOW, () =>
  withHarness({ longform: 40, shorts: 25 }, async (harness) => {
    const data = await runExport(harness, { limit: "all", deliver: "path" });

    assert.equal(data.cancelled, false);
    assert.equal(
      data.counts.videos,
      65,
      `expected all 65 videos, got ${data.counts.videos}\n${harness.log()}`,
    );
    assert.equal(data.channel.requested, "all");
    assert.equal(data.channel.exported, 65);

    const videos = readCsvFile(filesByName(data)["videos.csv"]);
    assert.equal(videos.length, 65);
    const ids = new Set(videos.map((v) => v.video_id));
    assert.equal(ids.size, 65, "every exported video should be distinct");
    assert.ok(ids.has("lf000040"), "the least-viewed long-form video is included");
    assert.ok(ids.has("sh000025"), "the least-viewed short is included");
  }));

test("a numeric limit above the old 500 ceiling is honoured", SLOW, () =>
  // 500 was a hard cap in both the request schema and the client, so a
  // 600-video export was simply not expressible.
  withHarness({ longform: 620, shorts: 0 }, async (harness) => {
    const data = await runExport(harness, {
      limit: 600,
      contentType: "longform",
      deliver: "path",
    });

    assert.equal(
      data.counts.videos,
      600,
      `expected 600 videos, got ${data.counts.videos}\n${harness.log()}`,
    );
  }));

test("a numeric limit still caps the export", SLOW, () =>
  withHarness({ longform: 40, shorts: 25 }, async (harness) => {
    const data = await runExport(harness, { limit: 10, deliver: "path" });

    assert.equal(data.counts.videos, 10);
    const videos = readCsvFile(filesByName(data)["videos.csv"]);
    // Ranked by view count, and the fake channel gives long-form the highest
    // counts — so the top ten are the first ten long-form videos.
    assert.deepEqual(
      videos.map((v) => v.video_id),
      Array.from({ length: 10 }, (_, i) => `lf${String(i + 1).padStart(6, "0")}`),
    );
  }));

test("everything means everything, not the first ten", SLOW, () =>
  // The symptom that started this. Ten is the floor of the count field, so a
  // run that quietly fell back to it looked like a working export of the
  // wrong size.
  withHarness({ longform: 30, shorts: 0 }, async (harness) => {
    const all = await runExport(harness, { limit: "all", deliver: "path" });
    assert.notEqual(all.counts.videos, 10);
    assert.equal(all.counts.videos, 30);
  }));

test("comments and transcripts stream to CSV without passing through the response", SLOW, () =>
  withHarness(
    { longform: 6, shorts: 0, commentsPerVideo: 4, transcriptLines: 3 },
    async (harness) => {
      const data = await runExport(harness, {
        limit: "all",
        includeComments: true,
        includeTranscripts: true,
        deliver: "path",
      });

      // The whole point of path delivery: the rows are on disk, not in the body.
      assert.equal(data.videos, undefined);
      assert.equal(data.comments, undefined);
      assert.equal(data.transcripts, undefined);

      assert.equal(data.counts.comments, 24, harness.log());
      assert.equal(data.counts.transcripts, 18, harness.log());

      const files = filesByName(data);
      const comments = readCsvFile(files["comments.csv"]);
      assert.equal(comments.length, 24);
      const transcripts = readCsvFile(files["transcripts.csv"]);
      assert.equal(transcripts.length, 18);

      // Text that only survives an intact UTF-8 path, plus the two characters
      // a CSV writer has to handle: an embedded quote and an embedded newline.
      assert.match(comments[0].text, /日本語/);
      assert.match(comments[0].text, /🎬/);
      assert.match(comments[0].text, /"quoted"/);
      assert.match(comments[0].text, /\nsecond line/);
      assert.match(transcripts[0].text, /Caption 0 of lf000001/);

      // Every file the UI expects, each a well-formed CSV.
      for (const name of [
        "videos.csv",
        "comments.csv",
        "transcripts.csv",
        "summary.csv",
        "video-status.csv",
      ]) {
        const raw = fs.readFileSync(files[name], "utf8");
        assert.ok(raw.startsWith("﻿"), `${name} needs a BOM for Excel`);
        assert.ok(raw.includes("\r\n"), `${name} should use CRLF`);
      }

      const summary = readCsvFile(files["summary.csv"]);
      assert.equal(summary.length, 1);
      assert.equal(summary[0].requested, "all");
      assert.equal(summary[0].exported, "6");
      assert.equal(summary[0].cancelled, "false");
    },
  ));

test("path and rows deliveries produce the same CSV bytes", SLOW, () =>
  // Path delivery streams from the JSONL checkpoints; rows delivery builds the
  // same files in the client from the JSON body. They must not drift.
  withHarness(
    { longform: 4, shorts: 2, commentsPerVideo: 2, transcriptLines: 2 },
    async (harness) => {
      const opts = {
        limit: "all" as const,
        includeComments: true,
        includeTranscripts: true,
      };
      const viaPath = await runExport(harness, { ...opts, deliver: "path" });
      const viaRows = await runExport(harness, { ...opts, deliver: "rows" });

      const { buildExportFiles } = await import("../src/lib/channel");
      const built = buildExportFiles(viaRows as any);
      const onDisk = filesByName(viaPath);

      for (const file of built) {
        // summary.csv carries an export timestamp, which differs per run.
        if (file.name === "summary.csv") continue;
        assert.equal(
          fs.readFileSync(onDisk[file.name], "utf8"),
          file.contents,
          `${file.name} differs between path and rows delivery`,
        );
      }
    },
  ));

test("a completed export starts clean rather than doubling up", SLOW, () =>
  withHarness(
    { longform: 5, shorts: 0, commentsPerVideo: 2, transcriptLines: 1 },
    async (harness) => {
      const opts = {
        limit: "all" as const,
        contentType: "longform" as const,
        includeComments: true,
        includeTranscripts: true,
        deliver: "path" as const,
      };
      const first = await runExport(harness, opts);
      assert.equal(first.counts.comments, 10);

      // A finished export clears its checkpoint, so this second run collects
      // everything again — and must not append to the first run's rows.
      const second = await runExport(harness, opts);
      assert.equal(second.counts.videos, 5);
      assert.equal(second.counts.comments, 10);
      assert.equal(second.counts.transcripts, 5);
    },
  ));

test("start fresh discards saved progress", SLOW, () =>
  withHarness(
    { longform: 4, shorts: 0, commentsPerVideo: 2 },
    async (harness) => {
      const opts = {
        limit: "all" as const,
        contentType: "longform" as const,
        includeComments: true,
        deliver: "path" as const,
      };
      const first = await runExport(harness, opts);
      assert.equal(first.counts.comments, 8);

      const refreshed = await runExport(harness, { ...opts, fresh: true });
      assert.equal(refreshed.counts.videos, 4);
      assert.equal(refreshed.counts.comments, 8);
    },
  ));

test("a video with comments disabled is recorded, not dropped", SLOW, () =>
  withHarness(
    { longform: 3, shorts: 0, commentsPerVideo: 2, noComments: ["lf000002"] },
    async (harness) => {
      const data = await runExport(harness, {
        limit: "all",
        contentType: "longform",
        includeComments: true,
        deliver: "path",
      });

      assert.equal(data.counts.videos, 3);
      assert.equal(data.counts.comments, 4, "the other two videos still report");

      const statuses = readCsvFile(filesByName(data)["video-status.csv"]);
      const failed = statuses.find((s) => s.video_id === "lf000002");
      assert.ok(failed, "the failing video still gets a status row");
      assert.match(failed!.status, /comments disabled/);
    },
  ));

test("the exported CSVs live in the engine's temp dir, ready to be moved", SLOW, () =>
  withHarness({ longform: 3, shorts: 0 }, async (harness) => {
    const data = await runExport(harness, { limit: "all", deliver: "path" });

    // Electron's export:save refuses anything not under <tmp>/ytchan-, so the
    // engine has to write there for the move to be accepted.
    for (const file of data.files) {
      assert.equal(path.dirname(file.path), data.dir);
      assert.ok(
        path.basename(data.dir).startsWith("ytchan-"),
        `export dir ${data.dir} must carry the ytchan- prefix`,
      );
      assert.ok(fs.existsSync(file.path), `${file.name} should exist on disk`);
      assert.ok(file.bytes > 0, `${file.name} should report its size`);
    }
  }));

test("rows delivery still returns every row for the browser", SLOW, () =>
  withHarness(
    { longform: 4, shorts: 0, commentsPerVideo: 2 },
    async (harness) => {
      const data = await runExport(harness, {
        limit: "all",
        includeComments: true,
        deliver: "rows",
      });

      assert.equal(data.videos.length, 4);
      assert.equal(data.comments.length, 8);
      assert.equal(data.files, undefined);
    },
  ));

test("shorts and long-form filters select the right videos", SLOW, () =>
  withHarness({ longform: 10, shorts: 7 }, async (harness) => {
    const shorts = await runExport(harness, {
      limit: "all",
      contentType: "shorts",
      deliver: "path",
    });
    assert.equal(shorts.counts.videos, 7);
    const shortRows = readCsvFile(filesByName(shorts)["videos.csv"]);
    assert.ok(shortRows.every((r) => r.video_id.startsWith("sh")));
    assert.ok(shortRows.every((r) => r.is_short === "true"));

    const long = await runExport(harness, {
      limit: "all",
      contentType: "longform",
      deliver: "path",
    });
    assert.equal(long.counts.videos, 10);
    const longRows = readCsvFile(filesByName(long)["videos.csv"]);
    assert.ok(longRows.every((r) => r.video_id.startsWith("lf")));
    assert.ok(longRows.every((r) => r.is_short === "false"));
  }));

test("the request schema rejects a limit past the ceiling", SLOW, () =>
  withHarness({ longform: 1, shorts: 0 }, async (harness) => {
    await assert.rejects(
      () => runExport(harness, { limit: 10001 }),
      /400|less than or equal|too big|expected/i,
    );
  }));

// The two below are the cases the user actually hit: a channel with more
// videos than the old listing depth, and an export large enough that holding
// every row was what broke it. They are the slowest here, and the point of
// the whole change.

test("a channel deeper than the old 3000-entry listing exports in full", SLOW, () =>
  // The flat listing used to stop at 3000 however much was asked for, so a
  // larger channel silently lost everything past that point.
  withHarness({ longform: 3400, shorts: 0 }, async (harness) => {
    const data = await runExport(harness, {
      limit: "all",
      contentType: "longform",
      deliver: "path",
    });

    assert.equal(
      data.counts.videos,
      3400,
      `expected all 3400 videos, got ${data.counts.videos}`,
    );
    const videos = readCsvFile(filesByName(data)["videos.csv"]);
    assert.equal(videos.length, 3400);
    assert.ok(
      videos.some((v) => v.video_id === "lf003400"),
      "the 3400th video, well past the old cap, must be present",
    );
  }));

test("a large export streams instead of accumulating", SLOW, async () => {
  // 100 videos x 12,000 caption lines is 1.2 million transcript rows — the
  // order of magnitude a few thousand real videos reach. Held as objects and
  // then serialised into a JSON response, that does not fit in a 192 MB heap;
  // streamed to CSV a line at a time, it does. The control run at the end
  // shows the old delivery mode killing the engine on the same workload.
  const channel: FakeChannel = {
    longform: 100,
    shorts: 0,
    commentsPerVideo: 20,
    transcriptLines: 12_000,
    maxOldSpaceMb: 192,
  };
  const opts = {
    limit: "all" as const,
    contentType: "longform" as const,
    includeComments: true,
    includeTranscripts: true,
  };

  await withHarness(channel, async (harness) => {
    const data = await runExport(harness, { ...opts, deliver: "path" });

    assert.equal(data.counts.videos, 100);
    assert.equal(data.counts.comments, 2000);
    assert.equal(data.counts.transcripts, 1_200_000, harness.log());

    const transcripts = filesByName(data)["transcripts.csv"];
    const bytes = fs.statSync(transcripts).size;
    assert.ok(
      bytes > 100_000_000,
      `expected a transcripts.csv far larger than the heap allowance, got ${bytes} bytes`,
    );
    // Spot-check the far end: a stream that stopped early would still leave a
    // plausible-looking CSV behind.
    const rows = readCsvFile(transcripts);
    assert.equal(rows.length, 1_200_000);
    assert.equal(rows[rows.length - 1].video_id, "lf000100");
    assert.match(rows[rows.length - 1].text, /Caption 11999 of lf000100/);
  });

  // Without this control the test above only shows that streaming works, not
  // that it was needed.
  await withHarness(channel, async (harness) => {
    await assert.rejects(() => runExport(harness, { ...opts, deliver: "rows" }));
    assert.match(
      harness.log(),
      /heap out of memory/i,
      "rows delivery should have exhausted the heap on this workload",
    );
  });
});

// --- what to export -------------------------------------------------------
// Each part is its own CSV and its own work. Turning one off has to drop the
// file AND skip the collecting, or the toggle is cosmetic.

test("every part is exported by default", SLOW, () =>
  withHarness(
    { longform: 3, shorts: 0, commentsPerVideo: 2, transcriptLines: 2 },
    async (harness) => {
      // No include* flags at all — the server's own defaults decide.
      const data = await runExport(harness, {
        limit: "all",
        contentType: "longform",
        includeComments: undefined,
        includeTranscripts: undefined,
        deliver: "path",
      });

      assert.deepEqual(data.parts, {
        videoDetails: true,
        comments: true,
        transcripts: true,
      });
      assert.deepEqual(
        data.files.map((f: { name: string }) => f.name).sort(),
        [
          "comments.csv",
          "summary.csv",
          "transcripts.csv",
          "video-status.csv",
          "videos.csv",
        ],
      );
      assert.equal(data.counts.comments, 6);
      assert.equal(data.counts.transcripts, 6);
    },
  ));

test("transcripts only: no other CSV, and no metadata pass at all", SLOW, () =>
  withHarness(
    { longform: 5, shorts: 0, commentsPerVideo: 9, transcriptLines: 2 },
    async (harness) => {
      const data = await runExport(harness, {
        limit: "all",
        contentType: "longform",
        includeVideoDetails: false,
        includeComments: false,
        includeTranscripts: true,
        deliver: "path",
      });

      assert.deepEqual(
        data.files.map((f: { name: string }) => f.name).sort(),
        ["summary.csv", "transcripts.csv", "video-status.csv"],
      );
      assert.equal(data.counts.transcripts, 10);
      assert.equal(data.counts.comments, 0);

      // The run still covered every video, it just collected less per video.
      assert.equal(data.channel.exported, 5);
      const statuses = readCsvFile(filesByName(data)["video-status.csv"]);
      assert.equal(statuses.length, 5);

      // The expensive pass is skipped outright, not merely unwritten: with
      // details off and everything selected there is nothing to rank on. One
      // yt-dlp call per video is the whole cost of that pass.
      const calls = harness.calls();
      assert.equal(
        calls.metadata ?? 0,
        0,
        `no per-video metadata call should have been made, saw ${JSON.stringify(calls)}`,
      );
      assert.equal(calls.subtitles, 5);
      assert.equal(calls.comments ?? 0, 0);

      const transcripts = readCsvFile(filesByName(data)["transcripts.csv"]);
      assert.equal(transcripts.length, 10);
      assert.match(transcripts[0].text, /Caption 0 of lf00000/);
    },
  ));

test("comments only", SLOW, () =>
  withHarness(
    { longform: 4, shorts: 0, commentsPerVideo: 3, transcriptLines: 5 },
    async (harness) => {
      const data = await runExport(harness, {
        limit: "all",
        contentType: "longform",
        includeVideoDetails: false,
        includeComments: true,
        includeTranscripts: false,
        deliver: "path",
      });

      assert.deepEqual(
        data.files.map((f: { name: string }) => f.name).sort(),
        ["comments.csv", "summary.csv", "video-status.csv"],
      );
      assert.equal(data.counts.comments, 12);
      assert.equal(data.counts.transcripts, 0);

      const calls = harness.calls();
      assert.equal(calls.metadata ?? 0, 0, "details were not asked for");
      assert.equal(calls.subtitles ?? 0, 0, "transcripts were not asked for");
      assert.equal(calls.comments, 4);
    },
  ));

test("video details only", SLOW, () =>
  withHarness(
    { longform: 4, shorts: 0, commentsPerVideo: 3, transcriptLines: 5 },
    async (harness) => {
      const data = await runExport(harness, {
        limit: "all",
        contentType: "longform",
        includeVideoDetails: true,
        includeComments: false,
        includeTranscripts: false,
        deliver: "path",
      });

      assert.deepEqual(
        data.files.map((f: { name: string }) => f.name).sort(),
        ["summary.csv", "video-status.csv", "videos.csv"],
      );
      assert.equal(data.counts.videos, 4);
      const videos = readCsvFile(filesByName(data)["videos.csv"]);
      // The details really were fetched, not left blank.
      assert.equal(videos.length, 4);
      assert.ok(videos.every((v) => v.view_count !== ""));
      assert.ok(videos.every((v) => v.description !== ""));

      const calls = harness.calls();
      assert.equal(calls.metadata, 4);
      assert.equal(calls.comments ?? 0, 0);
      assert.equal(calls.subtitles ?? 0, 0);
    },
  ));

test("a Top-N run still ranks on views with details switched off", SLOW, () =>
  // The details pass is what view counts come from, so it has to keep running
  // for a numeric limit even though videos.csv is not wanted.
  withHarness(
    { longform: 20, shorts: 0, commentsPerVideo: 1 },
    async (harness) => {
      const data = await runExport(harness, {
        limit: 5,
        contentType: "longform",
        includeVideoDetails: false,
        includeComments: true,
        includeTranscripts: false,
        deliver: "path",
      });

      assert.equal(data.channel.exported, 5);
      assert.ok(!data.files.some((f: { name: string }) => f.name === "videos.csv"));

      // The five most-viewed, in order — which is only possible if the view
      // counts were read.
      const statuses = readCsvFile(filesByName(data)["video-status.csv"]);
      assert.deepEqual(
        statuses.map((s) => s.video_id),
        ["lf000001", "lf000002", "lf000003", "lf000004", "lf000005"],
      );
      // The pass ran over the candidate pool precisely because ranking needs it.
      assert.ok(
        (harness.calls().metadata ?? 0) > 0,
        "a Top-N run must still read view counts",
      );
    },
  ));

test("summary.csv records which parts the run held", SLOW, () =>
  withHarness({ longform: 2, shorts: 0, transcriptLines: 1 }, async (harness) => {
    const partial = await runExport(harness, {
      limit: "all",
      contentType: "longform",
      includeVideoDetails: false,
      includeComments: false,
      includeTranscripts: true,
      deliver: "path",
    });
    assert.equal(
      readCsvFile(filesByName(partial)["summary.csv"])[0].included,
      "transcripts",
    );

    const full = await runExport(harness, {
      limit: "all",
      contentType: "longform",
      includeComments: true,
      includeTranscripts: true,
      deliver: "path",
    });
    assert.equal(
      readCsvFile(filesByName(full)["summary.csv"])[0].included,
      "video details; comments; transcripts",
    );
  }));

test("selecting nothing is refused", SLOW, () =>
  withHarness({ longform: 2, shorts: 0 }, async (harness) => {
    await assert.rejects(
      () =>
        runExport(harness, {
          limit: "all",
          includeVideoDetails: false,
          includeComments: false,
          includeTranscripts: false,
        }),
      /at least one thing to export/i,
    );
  }));

test("a partial run keeps its own saved progress, separate from a full one", SLOW, () =>
  // The checkpoint is keyed on what is being collected, so switching the
  // toggles must not resume from a run that collected something else.
  withHarness(
    { longform: 3, shorts: 0, commentsPerVideo: 2, transcriptLines: 2 },
    async (harness) => {
      const transcriptsOnly = await runExport(harness, {
        limit: "all",
        contentType: "longform",
        includeVideoDetails: false,
        includeComments: false,
        includeTranscripts: true,
        deliver: "path",
      });
      assert.equal(transcriptsOnly.counts.transcripts, 6);
      assert.equal(transcriptsOnly.counts.comments, 0);

      const commentsOnly = await runExport(harness, {
        limit: "all",
        contentType: "longform",
        includeVideoDetails: false,
        includeComments: true,
        includeTranscripts: false,
        deliver: "path",
      });
      assert.equal(commentsOnly.counts.comments, 6);
      assert.equal(commentsOnly.counts.transcripts, 0);
    },
  ));

test("path and rows deliveries agree on a partial export too", SLOW, () =>
  withHarness(
    { longform: 3, shorts: 0, commentsPerVideo: 2, transcriptLines: 2 },
    async (harness) => {
      const opts = {
        limit: "all" as const,
        contentType: "longform" as const,
        includeVideoDetails: false,
        includeComments: false,
        includeTranscripts: true,
      };
      const viaPath = await runExport(harness, { ...opts, deliver: "path" });
      const viaRows = await runExport(harness, { ...opts, deliver: "rows" });

      const { buildExportFiles } = await import("../src/lib/channel");
      const built = buildExportFiles(viaRows as any);
      assert.deepEqual(
        built.map((f) => f.name).sort(),
        ["summary.csv", "transcripts.csv", "video-status.csv"],
      );

      const onDisk = filesByName(viaPath);
      for (const file of built) {
        if (file.name === "summary.csv") continue; // carries a timestamp
        assert.equal(
          fs.readFileSync(onDisk[file.name], "utf8"),
          file.contents,
          `${file.name} differs between path and rows delivery`,
        );
      }
    },
  ));
