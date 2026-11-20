import test from "node:test";
import assert from "node:assert/strict";
import { generalRoot, generalFolder, generalStep, isGeneral, GENERAL_NAME } from "../mods/nebula/lib/general.js";
import { iconFor } from "../mods/nebula/lib/icons.js";
import { mergeSettings } from "../mods/nebula/lib/settings.js";

const ROOT = generalRoot("/Users/pk");

test("General is off by default and lives in a hidden herdr-nebula folder", () => {
  assert.equal(mergeSettings({}).general, false);
  assert.equal(ROOT, "/Users/pk/.config/herdr-nebula/general");
  assert.equal(isGeneral(ROOT), true);
  assert.equal(isGeneral("/Users/pk/devl/app"), false);
});

test("on: General joins the list, opens and becomes the first pin; on again changes nothing", () => {
  const s = generalStep({ on: true, root: ROOT, store: { list: [{ root: "/a", name: "a" }] }, open: ["/a"], pinned: ["/a"] });
  assert.deepEqual(s.store.list.at(-1), { root: ROOT, name: GENERAL_NAME, general: true });
  assert.deepEqual(s.open, [ROOT, "/a"]);
  assert.deepEqual(s.pinned, [ROOT, "/a"]);
  assert.equal(generalStep({ on: true, root: ROOT, store: s.store, open: s.open, pinned: s.pinned }), null);
});

test("off: General leaves the list, the open tabs and the pins", () => {
  const on = generalStep({ on: true, root: ROOT, store: {}, open: null, pinned: null });
  const off = generalStep({ on: false, root: ROOT, ...on });
  assert.deepEqual(off.store.list, []);
  assert.deepEqual(off.open, []);
  assert.deepEqual(off.pinned, []);
  assert.equal(generalStep({ on: false, root: ROOT, store: {}, open: [], pinned: [] }), null);
});

test("General draws its own symbol, not initials", () => {
  assert.ok(iconFor({}, ROOT, GENERAL_NAME).svg);
  assert.equal(iconFor({}, "/a", "alpha").svg, undefined);
});

test("a picked folder moves General: the old one leaves, the new one is open and first", () => {
  const on = generalStep({ on: true, root: ROOT, store: {}, open: ["/a"], pinned: [] });
  const notes = generalFolder("/Users/pk", "/Users/pk/notes/");
  assert.equal(notes, "/Users/pk/notes");
  const moved = generalStep({ on: true, root: notes, ...on });
  assert.deepEqual(
    moved.store.list.map((p) => [p.root, p.general]),
    [[notes, true]],
  );
  assert.deepEqual(moved.open, [notes, "/a"]);
  assert.deepEqual(moved.pinned, [notes]);
  assert.equal(generalStep({ on: true, root: notes, ...moved }), null);
});
