import test from "node:test";
import assert from "node:assert/strict";
import { railTabs } from "../mods/nebula/lib/rail.js";
import { ALL } from "../mods/nebula/lib/shared.js";

const summary = [
  { root: "/r/a", name: "a", count: 1, status: "done" },
  { root: "/r/b", name: "b", count: 2, status: "needs" },
  { root: "/r/c", name: "c", count: 0, status: "exited" },
];

test("the rail follows the open list's order, not the store's, and never moves the picked project", () => {
  const open = ["/r/c", "/r/a", "/r/b"];
  assert.deepEqual(railTabs({ summary, open, selected: "/r/b" }).items.map((i) => i.root), open);
  assert.deepEqual(railTabs({ summary, open, selected: "/r/c" }).items.map((i) => i.root), open);
});

test("each item carries its name and status; only the selected one is on", () => {
  const r = railTabs({ summary, open: ["/r/a", "/r/b"], selected: "/r/b" });
  assert.deepEqual(r.items, [
    { root: "/r/a", name: "a", status: "done", on: false },
    { root: "/r/b", name: "b", status: "needs", on: true },
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
  assert.deepEqual(railTabs({ summary, open: ["/r/gone", "/r/a"], selected: ALL }).items.map((i) => i.root), ["/r/a"]);
  assert.deepEqual(railTabs({ summary, open: [], selected: ALL }), { all: true, items: [] });
});
