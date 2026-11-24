import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { ANY_MACHINE, CHANNEL_DATA_BUILT, decideAccess, parseMachineList } from "./ownerGate";

const require = createRequire(import.meta.url);
const { hashMachineId, parseIoregOutput, parseRegOutput } = require("../../../../main/shared/services/machineId.ts");

test("list parsing trims, lowercases and drops blanks", () => {
  assert.deepEqual(parseMachineList(" AB12 , cd34,, "), ["ab12", "cd34"]);
  assert.deepEqual(parseMachineList(undefined), []);
  assert.deepEqual(parseMachineList(""), []);
});

test("access fails closed", () => {
  const base = { built: true, list: ["a"], salt: "s", localMatch: true };
  assert.equal(decideAccess(base), true);
  assert.equal(decideAccess({ ...base, built: false }), false);
  assert.equal(decideAccess({ ...base, localMatch: false }), false);
  assert.equal(decideAccess({ ...base, list: [] }), false);
  assert.equal(decideAccess({ ...base, salt: "" }), false);
});

test("a build with the code omitted is never enabled, even with a wildcard", () => {
  assert.equal(decideAccess({ built: false, list: [ANY_MACHINE], salt: "", localMatch: true }), false);
  assert.equal(decideAccess({ built: true, list: [ANY_MACHINE], salt: "", localMatch: false }), true);
});

test("the unbuilt default is off", () => {
  assert.equal(CHANNEL_DATA_BUILT, false);
});

test("hash is stable, salted, and ignores case and whitespace in the id", () => {
  const a = hashMachineId("ABCD-1234", "salt");
  assert.equal(a, hashMachineId("  abcd-1234\n", "salt"));
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, hashMachineId("ABCD-1234", "other"));
  assert.notEqual(a, hashMachineId("ABCD-1235", "salt"));
  // Pinned so an accidental change to the scheme (which would orphan every
  // device already on an allowlist) fails loudly.
  assert.equal(
    hashMachineId("abcd-1234", "salt"),
    "f9795b678daea7173aa4f64e246278846540a66e7b97220d24be138af924845d",
  );
});

test("platform id parsers", () => {
  assert.equal(
    parseIoregOutput('  | "IOPlatformUUID" = "564D2A9C-1111-2222-3333-ABCDEF012345"\n'),
    "564D2A9C-1111-2222-3333-ABCDEF012345",
  );
  assert.equal(parseIoregOutput("nothing"), null);
  assert.equal(
    parseRegOutput("    MachineGuid    REG_SZ    8f2e7a1c-aaaa-bbbb-cccc-0123456789ab\r\n"),
    "8f2e7a1c-aaaa-bbbb-cccc-0123456789ab",
  );
  assert.equal(parseRegOutput(""), null);
});
