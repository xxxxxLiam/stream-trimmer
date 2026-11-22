#!/usr/bin/env node
/**
 * audit/run-2/area-E/mirror.cjs <shape>
 *
 * Builds a frozen copy of the app under /tmp/r2e-<shape>, with the REAL
 * `vite build` and the REAL scripts/build-server.cjs.
 *
 * It writes NOTHING into the repository: vite is given --outDir inside the
 * mirror, and the server bundle is written straight into the mirror through
 * BUILD_SERVER_OUT. Other audit areas rebuild the repo's dist/ while this run
 * is in flight, so the mirror is what makes a result mean anything.
 *
 * Shapes:
 *   public       channel data off (the shipped shape)
 *   owner-star   on, VITE_OWNER_MACHINES="*"
 *   owner-hash   on, allowlist = THIS machine's salted hash
 *   owner-other  on, allowlist = a hash for a different machine
 *
 * Salt: run2-E-salt-4c7d (mine, not run 1's).
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const REPO = "/home/user/stream-trimmer";
const SALT = "run2-E-salt-4c7d";
const OTHER_HASH = crypto
  .createHash("sha256")
  .update(`${SALT}:11111111111111111111111111111111`)
  .digest("hex");

function machineId() {
  for (const p of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
    try {
      const id = fs.readFileSync(p, "utf8").trim();
      if (id) return id;
    } catch {
      /* next */
    }
  }
  return null;
}
function hashFor(salt, id = machineId()) {
  return crypto.createHash("sha256").update(`${salt}:${String(id).trim().toLowerCase()}`).digest("hex");
}

const MINE_HASH = hashFor(SALT);

const SHAPES = {
  public: {},
  "owner-star": {
    VITE_ENABLE_CHANNEL_DATA: "1",
    VITE_OWNER_MACHINES: "*",
    VITE_OWNER_SALT: SALT,
  },
  "owner-hash": {
    VITE_ENABLE_CHANNEL_DATA: "1",
    VITE_OWNER_MACHINES: MINE_HASH,
    VITE_OWNER_SALT: SALT,
  },
  "owner-other": {
    VITE_ENABLE_CHANNEL_DATA: "1",
    VITE_OWNER_MACHINES: OTHER_HASH,
    VITE_OWNER_SALT: SALT,
  },
};

function mirrorPath(shape) {
  return `/tmp/r2e-${shape}`;
}

function build(shape) {
  const extra = SHAPES[shape];
  if (!extra) throw new Error(`unknown shape ${shape}`);
  const MIRROR = mirrorPath(shape);
  fs.rmSync(MIRROR, { recursive: true, force: true });
  fs.mkdirSync(path.join(MIRROR, "electron", "dist"), { recursive: true });

  for (const f of fs.readdirSync(path.join(REPO, "electron"))) {
    const src = path.join(REPO, "electron", f);
    if (fs.statSync(src).isDirectory()) continue;
    fs.copyFileSync(src, path.join(MIRROR, "electron", f));
  }
  fs.copyFileSync(path.join(REPO, "package.json"), path.join(MIRROR, "package.json"));
  fs.symlinkSync(path.join(REPO, "node_modules"), path.join(MIRROR, "node_modules"));
  fs.symlinkSync(path.join(REPO, "resources"), path.join(MIRROR, "resources"));

  const env = { ...process.env };
  // The worst case for the leak test: the owner values are exported for EVERY
  // shape, public included, so a leak cannot hide behind an unset variable.
  env.VITE_OWNER_MACHINES = `${MINE_HASH},${OTHER_HASH}`;
  env.VITE_OWNER_SALT = SALT;
  delete env.VITE_ENABLE_CHANNEL_DATA;
  Object.assign(env, extra);
  env.BUILD_SERVER_OUT = path.join(MIRROR, "electron", "dist", "server.cjs");

  execFileSync(
    path.join(REPO, "node_modules", ".bin", "vite"),
    ["build", "--outDir", path.join(MIRROR, "dist"), "--emptyOutDir"],
    { cwd: REPO, env, stdio: "inherit" },
  );
  execFileSync("node", [path.join(REPO, "scripts", "build-server.cjs")], {
    cwd: REPO,
    env,
    stdio: "inherit",
  });

  fs.writeFileSync(
    path.join(MIRROR, "SHAPE.json"),
    JSON.stringify(
      { shape, env: extra, salt: SALT, mineHash: MINE_HASH, otherHash: OTHER_HASH, builtAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  const bundles = fs.readdirSync(path.join(MIRROR, "dist", "assets")).filter((f) => f.endsWith(".js"));
  console.log(`[mirror] ${shape} -> ${MIRROR}  bundles=${bundles.join(",")}`);
  return MIRROR;
}

module.exports = { build, mirrorPath, SHAPES, SALT, MINE_HASH, OTHER_HASH, hashFor, machineId, REPO };

if (require.main === module) {
  const shapes = process.argv.slice(2);
  if (shapes.length === 0) {
    console.error(`usage: mirror.cjs <${Object.keys(SHAPES).join("|")}> ...`);
    process.exit(2);
  }
  for (const s of shapes) build(s);
}
