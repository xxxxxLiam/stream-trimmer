#!/usr/bin/env node
/**
 * v-build-mirror.cjs — build a frozen, production-shape mirror of the app for
 * slice-3 verification.
 *
 *   node v-build-mirror.cjs public    -> /tmp/v3-app-public     (feature compiled out)
 *   node v-build-mirror.cjs owner     -> /tmp/v3-app-owner      (feature in, THIS machine allowlisted)
 *   node v-build-mirror.cjs nonowner  -> /tmp/v3-app-nonowner   (feature in, a DIFFERENT machine allowlisted)
 *
 * A mirror is `electron/*.cjs` + a vanilla `vite build` + the esbuild server
 * bundle, laid out exactly as electron/main.cjs expects (`<mirror>/dist` and
 * `<mirror>/electron/dist/server.cjs`), so the real main process runs against
 * it unmodified. Mirrors are used instead of the repo's own dist/ so that
 * nothing in the repo is mutated and so a rebuild elsewhere cannot swap a
 * build out from under a run.
 *
 * No product file is modified. Only build OUTPUT (gitignored) is produced.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");

const REPO = path.resolve(__dirname, "..", "..", "..", "..");
const SALT = "verify-slice3-salt-9d41";
const MACHINE_ID = fs.readFileSync("/etc/machine-id", "utf8").trim();
const MY_HASH = createHash("sha256").update(`${SALT}:${MACHINE_ID.toLowerCase()}`).digest("hex");
const OTHER_HASH = createHash("sha256")
  .update(`${SALT}:ffffffffffffffffffffffffffffffff`)
  .digest("hex");

const shape = process.argv[2];
const SHAPES = {
  public: { channel: "", list: "", salt: "" },
  owner: { channel: "1", list: MY_HASH, salt: SALT },
  nonowner: { channel: "1", list: OTHER_HASH, salt: SALT },
};
if (!SHAPES[shape]) {
  console.error(`usage: v-build-mirror.cjs <${Object.keys(SHAPES).join("|")}>`);
  process.exit(2);
}
const cfg = SHAPES[shape];
const out = `/tmp/v3-app-${shape}`;

const env = {
  ...process.env,
  VITE_ENABLE_CHANNEL_DATA: cfg.channel,
  VITE_OWNER_MACHINES: cfg.list,
  VITE_OWNER_SALT: cfg.salt,
};

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "electron", "dist"), { recursive: true });

// 1. renderer
console.log(`[mirror ${shape}] vite build -> ${out}/dist`);
execFileSync(path.join(REPO, "node_modules", ".bin", "vite"), ["build", "--outDir", path.join(out, "dist"), "--emptyOutDir"], {
  cwd: REPO,
  env,
  stdio: "inherit",
});

// 2. server bundle. build-server.cjs writes to <repo>/electron/dist/server.cjs;
//    copy it into the mirror and put the repo's own copy back afterwards.
const repoServer = path.join(REPO, "electron", "dist", "server.cjs");
const backup = fs.existsSync(repoServer) ? fs.readFileSync(repoServer) : null;
console.log(`[mirror ${shape}] build-server.cjs (VITE_ENABLE_CHANNEL_DATA=${cfg.channel || "(unset)"})`);
execFileSync(process.execPath, [path.join(REPO, "scripts", "build-server.cjs")], {
  cwd: REPO,
  env,
  stdio: "inherit",
});
fs.copyFileSync(repoServer, path.join(out, "electron", "dist", "server.cjs"));
if (backup) fs.writeFileSync(repoServer, backup);

// 3. electron main process files, verbatim
for (const f of fs.readdirSync(path.join(REPO, "electron"))) {
  const src = path.join(REPO, "electron", f);
  if (!fs.statSync(src).isFile()) continue;
  if (f.endsWith(".ts") || f.endsWith(".map")) continue;
  fs.copyFileSync(src, path.join(out, "electron", f));
}
// node_modules + package.json so require() resolves exactly as in the repo
fs.copyFileSync(path.join(REPO, "package.json"), path.join(out, "package.json"));
fs.symlinkSync(path.join(REPO, "node_modules"), path.join(out, "node_modules"));

fs.writeFileSync(
  path.join(out, "MIRROR.json"),
  JSON.stringify(
    { shape, salt: cfg.salt, list: cfg.list, machineId: MACHINE_ID, myHash: MY_HASH, otherHash: OTHER_HASH, builtAt: new Date().toISOString() },
    null,
    2,
  ),
);
console.log(`[mirror ${shape}] done -> ${out}`);
console.log(JSON.stringify({ shape, myHash: MY_HASH, otherHash: OTHER_HASH }, null, 2));
