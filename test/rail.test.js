import test from "node:test";
import assert from "node:assert/strict";
import { railTabs, tabHint, pillText } from "../mods/nebula/lib/rail.js";
import { ALL } from "../mods/nebula/lib/shared.js";

const summary = [
  { root: "/r/a", name: "a", count: 1, status: "done" },
  { root: "/r/b", name: "b", count: 2, needs: 2, status: "needs" },
  { root: "/r/c", name: "c", count: 0, status: "exited" },
];

test("the rail follows the open list's order, not the store's, and never moves the picked project", () => {
  const open = ["/r/c", "/r/a", "/r/b"];
  assert.deepEqual(
    railTabs({ summary, open, selected: "/r/b" }).items.map((i) => i.root),
    open,
  );
  assert.deepEqual(
    railTabs({ summary, open, selected: "/r/c" }).items.map((i) => i.root),
    open,
  );
});

test("each item carries its name and status; only the selected one is on", () => {
  const r = railTabs({ summary, open: ["/r/a", "/r/b"], selected: "/r/b" });
  assert.deepEqual(r.items, [
    { root: "/r/a", name: "a", status: "done", needs: 0, on: false, pinned: false },
    { root: "/r/b", name: "b", status: "needs", needs: 2, on: true, pinned: false },
  ]);
  assert.equal(r.all, false);
});

test("All is selected for All, for nothing stored and for a project that is not open", () => {
  for (const selected of [ALL, undefined, null, "/r/c"]) {
    const r = railTabs({ summary, open: ["/r/a"], selected });
    assert.equal(r.all, true);
    assert.ok(r.items.every((i) => !i.on));
  }
});

test("a root missing from the summary is left out; nothing open gives no items", () => {
  assert.deepEqual(
    railTabs({ summary, open: ["/r/gone", "/r/a"], selected: ALL }).items.map((i) => i.root),
    ["/r/a"],
  );
  assert.deepEqual(railTabs({ summary, open: [], selected: ALL }), { all: true, items: [] });
});

test("the first nine tabs carry their cmd number in the tooltip and on the icon", () => {
  assert.deepEqual(tabHint("alpha", 1), { tip: "alpha  \u23181", num: 1 });
  assert.deepEqual(tabHint("alpha", 9), { tip: "alpha  \u23189", num: 9 });
});

test("from the tenth tab on there is no number and the tooltip is the name", () => {
  assert.deepEqual(tabHint("alpha", 10), { tip: "alpha", num: null });
  assert.deepEqual(tabHint("alpha", 25), { tip: "alpha", num: null });
});

test("a tab carries how many sessions need you; a summary without the count reads as none", () => {
  const r = railTabs({ summary, open: ["/r/a", "/r/b"], selected: ALL });
  assert.deepEqual(
    r.items.map((i) => [i.root, i.needs]),
    [
      ["/r/a", 0],
      ["/r/b", 2],
    ],
  );
});

test("the red pill shows the count, 9+ from ten on", () => {
  assert.equal(pillText(1), "1");
  assert.equal(pillText(9), "9");
  assert.equal(pillText(10), "9+");
  assert.equal(pillText(37), "9+");
});

test("pinned projects come first in pin order; the rest keep the open order", async () => {
  const { togglePinned } = await import("../mods/nebula/lib/rail.js");
  const summary = ["/a", "/b", "/c", "/d"].map((root) => ({ root, name: root.slice(1), status: "idle" }));
  const r = railTabs({ summary, open: ["/a", "/b", "/c", "/d"], selected: "/a", pinned: ["/c", "/x", "/b"] });
  assert.deepEqual(
    r.items.map((i) => [i.root, i.pinned]),
    [
      ["/c", true],
      ["/b", true],
      ["/a", false],
      ["/d", false],
    ],
  );
  assert.deepEqual(togglePinned(["/c"], "/a"), ["/c", "/a"]);
  assert.deepEqual(togglePinned(["/c", "/a"], "/c"), ["/a"]);
  assert.deepEqual(togglePinned(undefined, "/a"), ["/a"]);
});

test("the bar passes a focus on to the board, except right after a project pick", async () => {
  const { passFocusOn } = await import("../mods/nebula/lib/rail.js");
  assert.equal(passFocusOn({ pending: false, at: undefined, now: 10_000, ms: 250 }), true);
  assert.equal(passFocusOn({ pending: true, at: undefined, now: 10_000, ms: 250 }), false);
  assert.equal(passFocusOn({ pending: false, at: 9_800, now: 10_000, ms: 250 }), false);
  assert.equal(passFocusOn({ pending: false, at: 9_000, now: 10_000, ms: 250 }), true);
});

test("dragging a tab reorders it; dropping among the pins pins it, below them unpins it", async () => {
  const { moveTab, dropSlot } = await import("../mods/nebula/lib/rail.js");
  const order = ["/p1", "/p2", "/a", "/b", "/c"],
    pinned = ["/p1", "/p2"];
  assert.deepEqual(moveTab(order, pinned, 4, 2), { order: ["/p1", "/p2", "/c", "/a", "/b"], pinned: ["/p1", "/p2"] }); // boundary: stays unpinned
  assert.deepEqual(moveTab(order, pinned, 3, 1), { order: ["/p1", "/b", "/p2", "/a", "/c"], pinned: ["/p1", "/b", "/p2"] }); // among pins: pinned
  assert.deepEqual(moveTab(order, pinned, 0, 4), { order: ["/p2", "/a", "/b", "/p1", "/c"], pinned: ["/p2"] }); // below pins: unpinned
  assert.deepEqual(moveTab(order, pinned, 1, 0), { order: ["/p2", "/p1", "/a", "/b", "/c"], pinned: ["/p2", "/p1"] }); // reorder pins
  assert.equal(moveTab(order, pinned, 2, 2), null);
  assert.equal(moveTab(order, pinned, 2, 3), null);
  assert.deepEqual(moveTab(["/a", "/b"], ["/gone"], 1, 0).pinned, ["/gone"]);
  assert.equal(dropSlot(3, 10, 42), 3);
  assert.equal(dropSlot(3, 30, 42), 4);
});
