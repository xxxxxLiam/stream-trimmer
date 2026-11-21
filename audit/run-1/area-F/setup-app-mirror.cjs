#!/usr/bin/env node
/**
 * Builds a frozen MIRROR of the app under /tmp/f-app so area-F runs are not
 * silently re-based when another audit helper rebuilds the repo's `dist/`.
 *
 * It copies (never modifies) electron/*.cjs, builds the renderer and the
 * bundled server into the mirror, and symlinks node_modules. No product file
 * is written to.
 *
 * Usage:
 *   node setup-app-mirror.cjs            # public build (channel data off)
 *   node setup-app-mirror.cjs --channel  # VITE_ENABLE_CHANNEL_DATA=1, owner=*
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const REPO = "/home/user/stream-trimmer";
const channel = process.argv.includes("--channel");
const nonOwner = process.argv.includes("--non-owner");
const MIRROR = nonOwner ? "/tmp/f-app-channel-nonowner" : channel ? "/tmp/f-app-channel" : "/tmp/f-app";

fs.rmSync(MIRROR, { recursive: true, force: true });
fs.mkdirSync(path.join(MIRROR, "electron"), { recursive: true });

// electron/ sources, verbatim.
for (const f of fs.readdirSync(path.join(REPO, "electron"))) {
  const src = path.join(REPO, "electron", f);
  if (fs.statSync(src).isDirectory()) continue;
  fs.copyFileSync(src, path.join(MIRROR, "electron", f));
}
fs.copyFileSync(path.join(REPO, "package.json"), path.join(MIRROR, "package.json"));
fs.symlinkSync(path.join(REPO, "node_modules"), path.join(MIRROR, "node_modules"));
if (fs.existsSync(path.join(REPO, "resources"))) {
  fs.symlinkSync(path.join(REPO, "resources"), path.join(MIRROR, "resources"));
}

const env = { ...process.env };
if (nonOwner) {
  // Built WITH the exporter but this machine is not an owner machine.
  env.VITE_ENABLE_CHANNEL_DATA = "1";
  env.VITE_OWNER_MACHINES = "0000000000000000000000000000000000000000000000000000000000000000";
  env.VITE_OWNER_SALT = "audit-salt";
} else if (channel) {
  env.VITE_ENABLE_CHANNEL_DATA = "1";
  env.VITE_OWNER_MACHINES = "*";
  env.VITE_OWNER_SALT = "audit-salt";
} else {
  delete env.VITE_ENABLE_CHANNEL_DATA;
  delete env.VITE_OWNER_MACHINES;
  delete env.VITE_OWNER_SALT;
}

// Renderer into the mirror's dist/ — never into the repo's.
execFileSync("npx", ["vite", "build", "--outDir", path.join(MIRROR, "dist"), "--emptyOutDir"], {
  cwd: REPO,
  env,
  stdio: "inherit",
});

// Bundled server: build-server.cjs writes to electron/dist/server.cjs in the
// repo, so build it there and move the artefact into the mirror.
execFileSync("node", [path.join(REPO, "scripts", "build-server.cjs")], {
  cwd: REPO,
  env,
  stdio: "inherit",
});
fs.mkdirSync(path.join(MIRROR, "electron", "dist"), { recursive: true });
fs.copyFileSync(
  path.join(REPO, "electron", "dist", "server.cjs"),
  path.join(MIRROR, "electron", "dist", "server.cjs"),
);

const js = fs.readdirSync(path.join(MIRROR, "dist", "assets")).filter((f) => f.endsWith(".js"));
console.log("MIRROR", MIRROR, "bundle", js.join(","));
console.log(
  "channel help tasks in bundle:",
  js.some((f) => fs.readFileSync(path.join(MIRROR, "dist", "assets", f), "utf8").includes("Export a channel's data")),
);
