// electron/machineId.cjs
// Reads this computer's stable id and turns it into a salted hash. Used by the
// main process (to answer "is this an owner machine") and by
// scripts/machine-id.cjs (so the owner can add a device). The raw id never
// leaves the main process; only the boolean result is sent to the renderer.
//
// This is a device check, not a security boundary. See src/lib/ownerGate.ts.
const { createHash } = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs");

function parseIoregOutput(text) {
  const m = /"IOPlatformUUID"\s*=\s*"([0-9A-Fa-f-]{8,})"/.exec(String(text || ""));
  return m ? m[1] : null;
}

function parseRegOutput(text) {
  const m = /MachineGuid\s+REG_SZ\s+([0-9A-Fa-f-]{8,})/.exec(String(text || ""));
  return m ? m[1] : null;
}

function run(cmd, args) {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout: 5000, windowsHide: true }, (err, stdout) =>
        resolve(err ? "" : String(stdout)),
      );
    } catch {
      resolve("");
    }
  });
}

/** The raw platform id, or null if it cannot be read. */
async function readMachineId(platform = process.platform) {
  try {
    if (platform === "darwin") {
      return parseIoregOutput(
        await run("/usr/sbin/ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"]),
      );
    }
    if (platform === "win32") {
      return parseRegOutput(
        await run("reg", [
          "query",
          "HKLM\\SOFTWARE\\Microsoft\\Cryptography",
          "/v",
          "MachineGuid",
        ]),
      );
    }
    for (const p of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
      try {
        const id = fs.readFileSync(p, "utf8").trim();
        if (id) return id;
      } catch {
        /* try the next location */
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** sha256 of "salt:id" (id trimmed and lowercased), lowercase hex. */
function hashMachineId(id, salt) {
  return createHash("sha256")
    .update(`${String(salt)}:${String(id).trim().toLowerCase()}`)
    .digest("hex");
}

module.exports = { readMachineId, hashMachineId, parseIoregOutput, parseRegOutput };
