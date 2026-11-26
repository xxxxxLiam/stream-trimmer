/**
 * File: mineVersion.cjs
 * Path: scripts/mineVersion.cjs
 * Description: Picks the version the private `npm run build:mine` app is stamped with.
 *
 * The private build is made from whatever the local clone's package.json says. When that
 * lags the latest public release (a clone that was not pulled, or a branch that has not had
 * main merged back), the app opens, sees the newer public release and offers to "update" to
 * it, which replaces the owner build. So the build is stamped with the HIGHER of the two.
 */
const RELEASES_API = "https://api.github.com/repos/xxxxxLiam/clipr/releases/latest";

function parse(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v ?? "").trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** 1 when a > b, -1 when a < b, 0 when equal; an unparsable side loses. */
function compareVersions(a, b) {
  const x = parse(a);
  const y = parse(b);
  if (!x && !y) return 0;
  if (!x) return -1;
  if (!y) return 1;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}

/** The version to stamp: the higher of the local package.json and the latest public release. */
function pickVersion(local, latest) {
  const l = parse(local) ? String(local).trim().replace(/^v/, "") : "";
  const r = parse(latest) ? String(latest).trim().replace(/^v/, "") : "";
  if (!r) return l;
  if (!l) return r;
  return compareVersions(r, l) > 0 ? r : l;
}

/** The latest public release version, or "" when it cannot be reached (offline, rate limited). */
async function latestReleaseVersion(fetchImpl = globalThis.fetch) {
  try {
    const res = await fetchImpl(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "clipr-build-mine" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "";
    const body = await res.json();
    return String(body.tag_name ?? "").replace(/^v/, "");
  } catch {
    return "";
  }
}

module.exports = { compareVersions, pickVersion, latestReleaseVersion };
