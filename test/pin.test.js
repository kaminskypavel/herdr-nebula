import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findNode } from "../mods/nebula/lib/focus.js";
import { togglePin, pinnable, pinnedIn, pinGone, withPin, PIN_ID } from "../mods/nebula/lib/pin.js";

const tree = () => JSON.parse(readFileSync(new URL("../layouts/nebula.json", import.meta.url), "utf8"));
const kids = (t) => findNode(t, "work-body").children.map((c) => c.id);

test("togglePin: pins, swaps, and unpins the same one", () => {
  assert.equal(togglePin(null, "t1"), "t1");
  assert.equal(togglePin("t1", "t2"), "t2");
  assert.equal(togglePin("t1", "t1"), null);
});

test("pinnable: sessions yes, nebula rows and blanks no", () => {
  assert.equal(pinnable({ address: "t1" }), true);
  assert.equal(pinnable({ address: "t1", kind: "nebula" }), false);
  assert.equal(pinnable({}), false);
  assert.equal(pinnable(undefined), false);
});

test("pinGone: only a pin missing from the terminals", () => {
  assert.equal(pinGone(null, []), false);
  assert.equal(pinGone("t1", ["t1", "t2"]), false);
  assert.equal(pinGone("t1", ["t2"]), true);
});

test("withPin adds a pinned block beside main and leaves the input alone", () => {
  const before = tree(),
    json = JSON.stringify(before);
  const out = withPin(before, "t7");
  assert.equal(JSON.stringify(before), json);
  assert.deepEqual(kids(out), ["main", PIN_ID]);
  const pin = findNode(out, PIN_ID);
  assert.deepEqual(pin.content, { terminal: "t7" });
  assert.equal(pin.type, "block");
  assert.equal(pinnedIn(out), "t7");
  assert.equal(pinnedIn(before), null);
  assert.deepEqual(findNode(out, "main"), findNode(before, "main"));
});

test("withPin on a pinned tree swaps the terminal and keeps size", () => {
  const a = withPin(tree(), "t1");
  findNode(a, PIN_ID).size = { px: 500 };
  const b = withPin(a, "t2");
  assert.deepEqual(kids(b), ["main", PIN_ID]);
  assert.equal(pinnedIn(b), "t2");
  assert.deepEqual(findNode(b, PIN_ID).size, { px: 500 });
});

test("withPin null removes the pin and restores the shipped tree", () => {
  assert.deepEqual(withPin(withPin(tree(), "t1"), null), tree());
  assert.deepEqual(withPin(tree(), null), tree());
});

test("withPin: a layout without work-body is not touched", () => {
  assert.equal(withPin({ id: "root", type: "row", children: [] }, "t1"), null);
  assert.equal(withPin(null, "t1"), null);
});

test("the shipped layout has the row the pin needs", () => {
  assert.ok(findNode(tree(), "work-body"));
});
