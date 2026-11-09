import test from "node:test";
import assert from "node:assert/strict";
import { buildBoard } from "../mods/nebula/lib/viewmodel.js";
import {
  summarize, cleanOpen, initialOpen, syncOpen, currentOpen, openProject, closeProject, onlyOpen, pickerRows, closedNeeding, pickerHeight,
} from "../mods/nebula/lib/open.js";

const proj = (name) => ({ root: `/r/${name}`, name });
const store = { list: [proj("a"), proj("b"), proj("c")] };
const repos = store.list.map((p) => ({ ...p, checkouts: [{ path: p.root, branch: "main" }] }));
const term = (name, address, status) => ({ address, cwd: `/r/${name}`, status, state: "live" });
const board = (terminals) => buildBoard({ terminals, repos });

test("first run opens the projects with live sessions, in store order", () => {
  const m = board([term("c", "t1", "working"), term("a", "t2", "done")]);
  assert.deepEqual(initialOpen(m, store), ["/r/a", "/r/c"]);
  assert.deepEqual(syncOpen(undefined, m, store).open, ["/r/a", "/r/c"]);
  assert.equal(syncOpen(undefined, m, store).changed, true);
});

test("first run with no live session opens the first project; an empty store opens nothing", () => {
  assert.deepEqual(syncOpen(undefined, board([]), store).open, ["/r/a"]);
  assert.deepEqual(syncOpen(undefined, board([]), {}), { open: null, seen: null, changed: false });
});

test("a stored list is kept in order and cut to projects still in the store", () => {
  assert.deepEqual(cleanOpen(["/r/c", "/r/gone", "/r/a", "/r/c/"], store), ["/r/c", "/r/a"]);
  const r = syncOpen(["/r/c", "/r/a"], board([]), store);
  assert.deepEqual(r.open, ["/r/c", "/r/a"]);
  assert.equal(r.changed, false);
  assert.equal(syncOpen(["/r/c", "/r/gone"], board([]), store).changed, true);
});

test("a session that newly needs you opens its closed project; one already waiting does not", () => {
  const first = syncOpen(["/r/a"], board([term("b", "t1", "blocked")]), store, null);
  assert.deepEqual(first.open, ["/r/a"]);
  assert.equal(closedNeeding(board([term("b", "t1", "blocked")]), ["/r/a"]), true);
  const quiet = syncOpen(["/r/a"], board([term("b", "t1", "blocked")]), store, first.seen);
  assert.deepEqual(quiet.open, ["/r/a"]);
  const fresh = syncOpen(["/r/a"], board([term("b", "t1", "blocked"), term("c", "t2", "blocked")]), store, first.seen);
  assert.deepEqual(fresh.open, ["/r/c", "/r/a"]);
  assert.equal(fresh.changed, true);
});

test("a session that needs you in an open project changes nothing", () => {
  const r = syncOpen(["/r/a"], board([term("a", "t1", "blocked")]), store, new Set());
  assert.deepEqual(r.open, ["/r/a"]);
  assert.equal(r.changed, false);
  assert.equal(closedNeeding(board([term("a", "t1", "blocked")]), ["/r/a"]), false);
});

test("opening appends once; closing the selected tab selects a neighbor", () => {
  assert.deepEqual(openProject(["/r/a"], "/r/b"), ["/r/b", "/r/a"]);
  const open = ["/r/a", "/r/b"];
  assert.equal(openProject(open, "/r/a"), open);
  assert.deepEqual(closeProject(["/r/a", "/r/b", "/r/c"], "/r/b", "/r/b"), { open: ["/r/a", "/r/c"], select: "/r/c" });
  assert.deepEqual(closeProject(["/r/a", "/r/b"], "/r/b", "/r/b"), { open: ["/r/a"], select: "/r/a" });
  assert.deepEqual(closeProject(["/r/a"], "/r/a", "/r/a"), { open: [], select: null });
  assert.deepEqual(closeProject(["/r/a", "/r/b"], "/r/a", "/r/b"), { open: ["/r/b"], select: null });
  assert.deepEqual(closeProject(["/r/a"], "/r/zzz", "/r/a"), { open: ["/r/a"], select: null });
});

test("the board shows open projects in tab order plus Other, never a closed project's sessions", () => {
  const m = board([term("a", "t1", "working"), term("b", "t2", "working"), { address: "t3", cwd: "/elsewhere", status: "working", state: "live" }]);
  const shown = onlyOpen(m, ["/r/b", "/r/a"]);
  assert.deepEqual(shown.repos.map((r) => r.name), ["b", "a", "Other"]);
  assert.deepEqual(onlyOpen(m, ["/r/c"]).repos.map((r) => r.name), ["c", "Other"]);
  assert.deepEqual(onlyOpen(m, []).repos.map((r) => r.name), ["Other"]);
});

test("the picker lists every project with count, status and open mark; typing filters", () => {
  const m = board([term("a", "t1", "done"), term("a", "t2", "blocked"), term("b", "t3", "working")]);
  const rows = pickerRows(summarize(m), currentOpen(["/r/a"], m, store), "");
  assert.deepEqual(rows.map((r) => [r.name, r.count, r.status, r.open]), [["a", 2, "needs", true], ["b", 1, "working", false], ["c", 0, "exited", false]]);
  assert.deepEqual(pickerRows(summarize(m), ["/r/a"], " B ").map((r) => r.name), ["b"]);
  assert.deepEqual(pickerRows(summarize(m), [], "zzz"), []);
});

test("the picker grows with the list up to nine rows", () => {
  assert.ok(pickerHeight(2) < pickerHeight(5));
  assert.equal(pickerHeight(12), pickerHeight(9));
});
