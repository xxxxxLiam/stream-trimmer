#!/usr/bin/env node
/**
 * Audit run 2, area AF scaffolding. NOT product code.
 *
 * Freezes the app into /tmp/af-<shape> so a concurrent helper rebuilding the
 * repo's dist/ cannot swap the build under a run in progress. Shapes:
 *   public      -> /tmp/af-public      (channel exporter compiled out)
 *   owner       -> /tmp/af-owner       (channel data built, this machine allowlisted)
 *
 * usage: node mkmirror.cjs <public|owner>
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const REPO = "/home/user/stream-trimmer";
const SALT = "run2-af-salt-7c13";

function thisMachineHash(salt) {
  const id = fs.readFileSync("/etc/machine-id", "utf8").trim();
  return crypto.createHash("sha256").update(`${salt}:${id}`).digest("hex");
}

const SHAPES = {
  public: () => ({}),
  owner: () => ({
    VITE_ENABLE_CHANNEL_DATA: "1",
    VITE_OWNER_MACHINES: thisMachineHash(SALT),
    VITE_OWNER_SALT: SALT,
  }),
};

function build(shape) {
  const extra = SHAPES[shape]();
  const MIRROR = `/tmp/af-${shape}`;
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
  for (const k of ["VITE_ENABLE_CHANNEL_DATA", "VITE_OWNER_MACHINES", "VITE_OWNER_SALT"]) delete env[k];
  Object.assign(env, extra);

  execFileSync("npx", ["vite", "build", "--outDir", path.join(MIRROR, "dist"), "--emptyOutDir"], {
    cwd: REPO, env, stdio: "inherit",
  });
  // build-server.cjs supports BUILD_SERVER_OUT (added by T10) so the repo's own
  // electron/dist/server.cjs is left alone.
  const out = path.join(MIRROR, "electron", "dist", "server.cjs");
  execFileSync("node", [path.join(REPO, "scripts", "build-server.cjs")], {
    cwd: REPO, env: { ...env, BUILD_SERVER_OUT: out }, stdio: "inherit",
  });
  if (!fs.existsSync(out)) {
    fs.copyFileSync(path.join(REPO, "electron", "dist", "server.cjs"), out);
  }
  fs.writeFileSync(
    path.join(MIRROR, "SHAPE.json"),
    JSON.stringify({ shape, env: extra, builtAt: new Date().toISOString() }, null, 2),
  );
  console.log(`[mkmirror] ${shape} -> ${MIRROR}`);
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
