#!/usr/bin/env node
/**
 * slice-4 verification scaffolding (NOT product code, NOT the original
 * author's script).
 *
 * Builds a frozen copy of the app so that another audit helper rebuilding the
 * repo's dist/ cannot swap the build under a run in progress. Three shapes:
 *
 *   public      VITE_ENABLE_CHANNEL_DATA unset           -> /tmp/s4-public
 *   owner-star  =1, VITE_OWNER_MACHINES="*"              -> /tmp/s4-owner-star
 *   owner-hash  =1, VITE_OWNER_MACHINES=<this machine>    -> /tmp/s4-owner-hash
 *   owner-other =1, VITE_OWNER_MACHINES=<other machine>   -> /tmp/s4-owner-other
 *
 * Nothing in /home/user/stream-trimmer is modified except the two build
 * outputs the real build scripts own (dist/, electron/dist/server.cjs), whose
 * artefacts are copied straight into the mirror.
 *
 * usage: node mkmirror.cjs <shape>
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const REPO = "/home/user/stream-trimmer";
const SALT = "slice4-salt-9b21";

function thisMachineHash(salt) {
  // Same recipe as electron/machineId.cjs, recomputed here independently.
  const id = fs.readFileSync("/etc/machine-id", "utf8").trim();
  return crypto.createHash("sha256").update(`${salt}:${id}`).digest("hex");
}

const SHAPES = {
  public: () => ({}),
  "owner-star": () => ({
    VITE_ENABLE_CHANNEL_DATA: "1",
    VITE_OWNER_MACHINES: "*",
    VITE_OWNER_SALT: SALT,
  }),
  "owner-hash": () => ({
    VITE_ENABLE_CHANNEL_DATA: "1",
    VITE_OWNER_MACHINES: thisMachineHash(SALT),
    VITE_OWNER_SALT: SALT,
  }),
  "owner-other": () => ({
    VITE_ENABLE_CHANNEL_DATA: "1",
    VITE_OWNER_MACHINES: "f".repeat(64),
    VITE_OWNER_SALT: SALT,
  }),
};

function build(shape) {
  const extra = SHAPES[shape]();
  const MIRROR = `/tmp/s4-${shape}`;
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
  for (const k of ["VITE_ENABLE_CHANNEL_DATA", "VITE_OWNER_MACHINES", "VITE_OWNER_SALT"]) {
    delete env[k];
  }
  Object.assign(env, extra);

  execFileSync(
    "npx",
    ["vite", "build", "--outDir", path.join(MIRROR, "dist"), "--emptyOutDir"],
    { cwd: REPO, env, stdio: "inherit" },
  );
  execFileSync("node", [path.join(REPO, "scripts", "build-server.cjs")], {
    cwd: REPO,
    env,
    stdio: "inherit",
  });
  fs.copyFileSync(
    path.join(REPO, "electron", "dist", "server.cjs"),
    path.join(MIRROR, "electron", "dist", "server.cjs"),
  );

  fs.writeFileSync(
    path.join(MIRROR, "SHAPE.json"),
    JSON.stringify({ shape, env: extra, builtAt: new Date().toISOString() }, null, 2),
  );
  const bundles = fs
    .readdirSync(path.join(MIRROR, "dist", "assets"))
    .filter((f) => f.endsWith(".js"));
  console.log(`[mkmirror] ${shape} -> ${MIRROR} bundles=${bundles.join(",")}`);
  return MIRROR;
}

module.exports = { build, SALT, thisMachineHash, SHAPES };

if (require.main === module) {
  const shape = process.argv[2];
  if (!SHAPES[shape]) {
    console.error(`usage: mkmirror.cjs <${Object.keys(SHAPES).join("|")}>`);
    process.exit(2);
  }
  build(shape);
}
