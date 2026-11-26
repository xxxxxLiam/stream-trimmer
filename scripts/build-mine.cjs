// Builds YOUR private Clipr with the channel export switched on, for this computer only.
//   npm run build:mine
// It writes .env (git-ignored) with the channel flag, a salt kept between runs and this computer's hash,
// then builds the Mac .dmg into dist-electron/. The public release never runs this and never has the flag.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { readMachineId, hashMachineId } = require("../src/main/shared/services/machineId.ts");
const { pickVersion, latestReleaseVersion } = require("./mineVersion.cjs");

const root = path.join(__dirname, "..");
const envFile = path.join(root, ".env");

function readEnv() {
  try {
    return fs.readFileSync(envFile, "utf8").split(/\r?\n/);
  } catch {
    return [];
  }
}
function valueOf(lines, key) {
  const line = lines.find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "") : "";
}
function withKey(lines, key, value) {
  const out = lines.filter((l) => !l.startsWith(`${key}=`));
  while (out.length && out[out.length - 1] === "") out.pop();
  out.push(`${key}=${value}`);
  return out;
}

(async () => {
  let lines = readEnv();
  // The same salt every time, or an older build's hash would stop matching.
  const salt = valueOf(lines, "VITE_OWNER_SALT") || crypto.randomBytes(32).toString("hex");
  let machines = "*";
  try {
    const id = await readMachineId();
    if (id) machines = hashMachineId(id, salt);
  } catch {
    /* falls back to any machine: this build is yours alone */
  }
  lines = withKey(lines, "VITE_ENABLE_CHANNEL_DATA", "1");
  lines = withKey(lines, "VITE_OWNER_SALT", salt);
  lines = withKey(lines, "VITE_OWNER_MACHINES", machines);
  fs.writeFileSync(envFile, lines.join("\n") + "\n");
  console.log(machines === "*" ? "Could not read this Mac's id: the build will work on any Mac, so keep it to yourself." : "This Mac is registered for the channel export.");

  const env = {
    ...process.env,
    VITE_ENABLE_CHANNEL_DATA: "1",
    VITE_OWNER_SALT: salt,
    VITE_OWNER_MACHINES: machines,
  };
  const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, stdio: "inherit", env }).status ?? 1;
  if (!fs.existsSync(path.join(root, "node_modules")) && run("npm", ["ci"]) !== 0) process.exit(1);
  // Stamp the build with at least the latest public release, so it never opens saying it is out of
  // date and offers an "update" that would replace this private build.
  const local = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  const version = pickVersion(local, await latestReleaseVersion());
  if (version !== local) console.log(`This clone says ${local}, the latest public release is newer: stamping ${version}.`);
  const code = run("npm", ["run", "dist:mac", "--", `--config.extraMetadata.version=${version}`]);
  if (code !== 0) process.exit(code);
  console.log("\nDone. Open dist-electron/ and install the .dmg. Panels menu > Channel data, or paste a channel link.");
  spawnSync("open", [path.join(root, "dist-electron")], { stdio: "ignore" });
})();
