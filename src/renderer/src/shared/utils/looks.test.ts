/**
 * File: looks.test.ts
 * Description: Saved looks: the same file is never stored twice, an in-use look cannot be deleted, the
 *   old single pasted look moves into the list once, and a campaign gets its look's text only when it has one.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { addLook, lookNameFromFile, migrateLooks, normalizeLooks, removeLook, withResolvedLook } from "./looks";

test("the same text is reused, not stored twice", () => {
  const a = addLook([], "Mine", "<fcpxml/>");
  const b = addLook(a.list, "Other name", "  <fcpxml/> ");
  assert.equal(b.id, a.id);
  assert.equal(b.list.length, 1);
});

test("a look used by a campaign cannot be deleted", () => {
  const { list, id } = addLook([], "Mine", "<x/>");
  assert.equal(removeLook(list, id, [id]).length, 1);
  assert.equal(removeLook(list, id, [null]).length, 0);
});

test("the old pasted look moves into the list for each campaign that had it on", () => {
  const m = migrateLooks([], {
    a: { lookXml: "<x/>", applyLook: true },
    b: { lookXml: "<x/>", applyLook: false },
    c: { lookXml: "" },
  });
  assert.equal(m.looks.length, 1);
  assert.equal((m.perCampaign.a as { lookId: string }).lookId, m.looks[0].id);
  assert.equal((m.perCampaign.b as { lookId: unknown }).lookId, null);
  assert.equal(m.changed, true);
  assert.equal(migrateLooks(m.looks, m.perCampaign).changed, false);
});

test("a campaign gets look text only when it has a look", () => {
  const looks = [{ id: "look-1", name: "A", xml: "<x/>" }];
  assert.deepEqual([withResolvedLook({ lookId: "look-1" }, looks).applyLook, withResolvedLook({ lookId: "look-1" }, looks).lookXml], [true, "<x/>"]);
  assert.equal(withResolvedLook({ lookId: null }, looks).applyLook, false);
  assert.equal(withResolvedLook({ lookId: "gone" }, looks).applyLook, false);
});

test("file names and damaged lists read sensibly", () => {
  assert.equal(lookNameFromFile("/a/b/Acme look.fcpxml"), "Acme look");
  assert.equal(lookNameFromFile("Info.fcpxml"), "Info");
  assert.deepEqual(normalizeLooks([{ id: "x", xml: "" }, 5, { id: "y", xml: "<a/>" }]), [{ id: "y", name: "My look", xml: "<a/>" }]);
});
