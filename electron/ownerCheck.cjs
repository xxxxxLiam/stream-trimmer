// electron/ownerCheck.cjs
// The main process's half of the owner gate. `check(list, salt)` answers the
// renderer's owner:check question and REMEMBERS the verdict here, so other
// handlers (export:save) can ask `isOwner()` without ever being handed the raw
// machine id or the hash. Only booleans leave this module. Fails closed:
// nothing is owner until a check has said yes.
// A device check, not a security boundary — see src/lib/ownerGate.ts.
function createOwnerCheck({ readMachineId, hashMachineId }) {
  let localMachineId;
  let verdict = false;

  async function compute(list, salt) {
    if (!Array.isArray(list)) return false;
    const clean = list.map((h) => (typeof h === "string" ? h.trim().toLowerCase() : ""));
    if (clean.includes("*")) return true;
    if (typeof salt !== "string" || !salt) return false;
    if (localMachineId === undefined) localMachineId = await readMachineId();
    if (!localMachineId) return false;
    return clean.includes(hashMachineId(localMachineId, salt));
  }

  return {
    async check(list, salt) {
      try {
        verdict = (await compute(list, salt)) === true;
      } catch {
        verdict = false;
      }
      return verdict;
    },
    isOwner: () => verdict === true,
  };
}

module.exports = { createOwnerCheck };
