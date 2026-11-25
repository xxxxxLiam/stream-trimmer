/**
 * File: detectBump.cjs
 * Path: scripts/detectBump.cjs
 * Description: Decides patch/minor/major for a release from the commits since
 * the previous release. Used by .github/workflows/release.yml.
 *
 * This lives in a file rather than inline in the workflow because it needs
 * tests: the first inline version read markers out of commit BODIES, so a
 * commit whose body merely *documented* the markers ("an explicit [major] /
 * [minor] marker wins") tripped a major bump and shipped v3.0.0 for a bugfix.
 */
const { execFileSync } = require("node:child_process");

const RECORD = "\x1f"; // ASCII unit separator: never appears in commit text,
                       // and unlike NUL it can be passed as a process argument.

/**
 * Markers are read from commit SUBJECTS only — the first line of each message.
 * Bodies are prose: they explain, quote and document, and anything matched
 * there will eventually be matched by accident.
 *
 * The one exception is the Conventional-Commits `BREAKING CHANGE:` footer,
 * which by definition lives in the body. It is required at the start of a
 * line, case-sensitively, with its colon — so an ordinary sentence such as
 * "this is not a breaking change" cannot trigger it.
 */
function detectBump({ subjects = [], bodies = [] } = {}) {
  const subject = subjects.join("\n");
  const body = bodies.join("\n");

  // A whole-token [major] / [minor], not "[major]/[minor] marker" in passing.
  const marker = (word) =>
    new RegExp(`(^|\\s)\\[${word}\\](\\s|$)`, "i").test(subject);
  const conventional = (re) =>
    subjects.some((line) => re.test(line.trimStart()));

  if (
    marker("major") ||
    /^BREAKING[ -]CHANGE:/m.test(body) ||
    conventional(/^[a-zA-Z]+(\([^)]*\))?!:/)
  ) {
    return { bump: "major", why: "a breaking change was flagged" };
  }
  if (marker("minor") || conventional(/^feat(\([^)]*\))?:/)) {
    return { bump: "minor", why: "a new feature was flagged" };
  }
  return { bump: "patch", why: "no breaking change or feature marker found" };
}

/**
 * Where to start looking, given what git reports.
 *
 * This repo carries NO TAGS: the release tag is created in the public releases
 * repo over the REST API, because a ref-creation rule here rejects refs/tags/*.
 * The original fallback for "no tags" was to consider the ENTIRE history, which
 * turned into a trap — two `BREAKING CHANGE:` footers from ~900 commits ago
 * meant every automatic run returned `major`, and the version went 2.1.0 to
 * 14.0.0 across twelve unintended releases in a day.
 *
 * So the boundary is the previous `Release v...` commit, the same one the
 * publish job uses for its notes. If there is no boundary at all we return no
 * range and the caller defaults to `patch`: an unbounded scan must never again
 * be able to infer a major bump. A deliberate major is still available — a
 * [major] marker on the release commit, or a manual run with the level chosen.
 */
function rangeFrom({ tag = "", logLines = [] } = {}) {
  // The previous `Release v...` commit wins over any tag: the tags that exist
  // here are stale (v3.x), and measuring from one of them re-read ancient
  // BREAKING CHANGE footers, so every release since v14 came out as a major.
  const prev = logLines.find((l) => /^[0-9a-f]+ Release v/.test(l.trim()));
  if (prev) return `${prev.trim().split(/\s+/)[0]}..HEAD`;
  return tag ? `${tag}..HEAD` : null;
}

/** Reads the commit range since the last release and prints the bump. */
function main() {
  const forced = process.argv[2];
  if (forced && forced !== "auto") {
    process.stdout.write(`${forced}\n`);
    return;
  }
  const git = (args) =>
    execFileSync("git", args, { encoding: "utf8" }).trim();

  let tag = "";
  try {
    tag = git(["describe", "--tags", "--abbrev=0"]);
  } catch {
    /* no tags in this repo; the boundary below is used instead */
  }
  // --skip=1 because HEAD is this release's own commit when one has landed.
  const logLines = git(["log", "--format=%H %s", "--skip=1", "-n", "500"]).split("\n");
  const range = rangeFrom({ tag, logLines });
  if (!range) {
    process.stdout.write("patch\n");
    return;
  }

  const split = (fmt) =>
    git(["log", `--format=${fmt}${RECORD}`, range])
      .split(RECORD)
      .map((s) => s.trim())
      .filter(Boolean);

  const { bump } = detectBump({
    subjects: split("%s"),
    bodies: split("%b"),
  });
  process.stdout.write(`${bump}\n`);
}

if (require.main === module) main();

module.exports = { detectBump, rangeFrom };
