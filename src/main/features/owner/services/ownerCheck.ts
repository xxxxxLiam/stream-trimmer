// src/main/features/owner/services/ownerCheck.ts
// The main process's half of the owner gate. The verdict is decided HERE, from
// values baked into this build (see scripts/build-server.cjs) and this
// computer's own id. Nothing the renderer sends is ever an input: a page can
// call `owner:check` with any list and salt it likes and gets back the same
// answer main already had. Only booleans leave this module. Fails closed: no
// baked list, no owner.
// A device check, not a security boundary — see src/lib/ownerGate.ts.
import fs from "node:fs";
import path from "node:path";

/**
 * Reads the build's baked owner settings from the sidecar the build script
 * writes beside the bundled server, or null when the build has none (every
 * public build). Never throws.
 */
function readBakedShape(distDir: any) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(distDir, "build-shape.json"), "utf8"));
    if (!raw || typeof raw !== "object" || typeof raw.list !== "string") return null;
    return {
      list: String(raw.list ?? ""),
      salt: String(raw.salt ?? ""),
      dataFolderName: typeof raw.dataFolderName === "string" ? raw.dataFolderName : "",
    };
  } catch {
    return null;
  }
}

/** "a, B ,," -> ["a","b"]. Same rule as parseMachineList in src/lib/ownerGate.ts. */
function parseList(raw: any) {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function createOwnerCheck({ readMachineId, hashMachineId, getBaked }: any) {
  let localMachineId: any;

  async function compute() {
    const baked = typeof getBaked === "function" ? getBaked() : null;
    if (!baked) return false;
    const list = parseList(baked.list);
    if (list.includes("*")) return true;
    if (list.length === 0 || !baked.salt) return false;
    if (localMachineId === undefined) localMachineId = await readMachineId();
    if (!localMachineId) return false;
    return list.includes(hashMachineId(localMachineId, baked.salt));
  }

  async function isOwner() {
    try {
      return (await compute()) === true;
    } catch {
      return false;
    }
  }

  return {
    // Arguments are accepted so the renderer's call shape keeps working, and
    // ignored: the answer never depends on what the page says.
    check: (_list?: any, _salt?: any) => isOwner(),
    isOwner,
  };
}

export { createOwnerCheck, readBakedShape };
