/**
 * File: detectBump.cjs
 * Path: scripts/detectBump.cjs
 * Description: Decides patch/minor/major for a release from the commits since
 * the previous tag. Used by .github/workflows/release.yml.
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

/** Reads the commit range since the last tag and prints the bump. */
function main() {
  const forced = process.argv[2];
  if (forced && forced !== "auto") {
    process.stdout.write(`${forced}\n`);
    return;
  }
  const git = (args) =>
    execFileSync("git", args, { encoding: "utf8" }).trim();

  let range = "HEAD";
  try {
    const prev = git(["describe", "--tags", "--abbrev=0"]);
    if (prev) range = `${prev}..HEAD`;
  } catch {
    /* no tags yet — consider everything */
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

module.exports = { detectBump };
