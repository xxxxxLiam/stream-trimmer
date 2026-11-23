/**
 * File: ownerGate.ts
 * Path: src/main/features/owner/services/ownerGate.ts
 * Description: The build's baked owner shape and the gate built on it. Both are
 *   created once, at load, from what this build was baked with (absent in a public
 *   build). The gate answers a boolean and nothing else.
 */
import { readMachineId, hashMachineId } from "../../../../../electron/machineId";
import { createOwnerCheck, readBakedShape } from "../../../../../electron/ownerCheck";

// Read once, at start: what this build was baked with. Absent in a public build.
export const bakedShape = readBakedShape(__dirname);
export const ownerGate = createOwnerCheck({ readMachineId, hashMachineId, getBaked: () => bakedShape });
