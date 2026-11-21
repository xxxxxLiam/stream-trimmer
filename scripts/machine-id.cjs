// Prints this computer's salted machine hash, for VITE_OWNER_MACHINES.
//   VITE_OWNER_SALT=<your salt> npm run machine-id
// (the salt may also live in .env). Append the printed hash, comma-separated,
// to VITE_OWNER_MACHINES in the build that should recognise this device.
const fs = require("node:fs");
const path = require("node:path");
const { readMachineId, hashMachineId } = require("../electron/machineId.cjs");

function fromDotEnv(key) {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
    const line = raw.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

(async () => {
  const salt = (process.env.VITE_OWNER_SALT || fromDotEnv("VITE_OWNER_SALT")).trim();
  if (!salt) {
    console.error("Set VITE_OWNER_SALT first (any long random string, in the environment or .env).");
    console.error("Use the same salt in every build, or the hashes will not match.");
    process.exit(1);
  }
  const id = await readMachineId();
  if (!id) {
    console.error("Could not read this machine's id.");
    process.exit(1);
  }
  console.log(hashMachineId(id, salt));
})();
