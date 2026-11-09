import test from "node:test";
import assert from "node:assert/strict";
import { fitTabs, urgent, fullWidth, moreHeight, MORE_ROWS_MAX } from "../mods/nebula/lib/tablayout.js";
import { promote } from "../mods/nebula/lib/open.js";

const tabs = (...names) => names.map((n) => ({ root: `/r/${n}`, name: n }));
const T = tabs("alpha", "beta", "gamma", "delta", "epsilon");
const need = (n) => 34 + 10 + 26 + 2 + 41 + T.slice(0, n).reduce((s, t) => s + 2 + fullWidth(t.name), 0);

test("everything fits: all tabs in full, in order", () => {
  const r = fitTabs({ width: need(5), tabs: T, selected: "/r/beta" });
  assert.deepEqual(r, { full: T.map((t) => t.root), icons: [], folded: [] });
  assert.deepEqual(fitTabs({ tabs: T }).full.length, 5); // width unknown: full
});

test("one pixel short: the selected tab in full first, the rest icon-only", () => {
  const r = fitTabs({ width: need(5) - 1, tabs: T, selected: "/r/gamma" });
  assert.deepEqual(r.full, ["/r/gamma"]);
  assert.deepEqual(r.icons, ["/r/alpha", "/r/beta", "/r/delta", "/r/epsilon"]);
  assert.deepEqual(r.folded, []);
});

test("All selected: no full tab, every project icon-only", () => {
  const r = fitTabs({ width: need(5) - 1, tabs: T, selected: null });
  assert.deepEqual(r.full, []);
  assert.equal(r.icons.length, 5);
});

test("too narrow even for icons: the last ones fold into +N, the selected one stays", () => {
  const many = tabs(...Array.from({ length: 14 }, (_, i) => `p${i}`));
  const r = fitTabs({ width: 420, tabs: many, selected: "/r/p0" });
  assert.deepEqual(r.full, ["/r/p0"]);
  assert.ok(r.folded.length > 0 && r.icons.length > 0);
  assert.deepEqual([...r.full, ...r.icons, ...r.folded].sort(), many.map((t) => t.root).sort());
  assert.deepEqual(r.folded, many.map((t) => t.root).filter((x) => x !== "/r/p0").slice(r.icons.length)); // the tail folds
  // one more pixel of room never folds more
  const wider = fitTabs({ width: 421, tabs: many, selected: "/r/p0" });
  assert.ok(wider.folded.length <= r.folded.length);
});

test("a tiny board folds everything but the selected tab; one tab alone never breaks", () => {
  const r = fitTabs({ width: 100, tabs: T, selected: "/r/alpha" });
  assert.deepEqual(r, { full: ["/r/alpha"], icons: [], folded: T.slice(1).map((t) => t.root) });
  assert.deepEqual(fitTabs({ width: 50, tabs: tabs("solo"), selected: "/r/solo" }), { full: ["/r/solo"], icons: [], folded: [] });
  assert.deepEqual(fitTabs({ width: 50, tabs: [], selected: null }), { full: [], icons: [], folded: [] });
});

test("tab width grows with the name and stops at the 150px cap", () => {
  assert.ok(fullWidth("abcdefgh") > fullWidth("abc"));
  assert.equal(fullWidth("x".repeat(80)), 150);
});

test("the +N dot is the most urgent status: needs, working, unseen, seen, else grey", () => {
  assert.equal(urgent(["seen", "working", "needs", "unseen"]), "needs");
  assert.equal(urgent(["seen", "unseen", "working"]), "working");
  assert.equal(urgent(["seen", "unseen"]), "unseen");
  assert.equal(urgent(["seen", "exited"]), "seen");
  assert.equal(urgent(["exited"]), "exited");
  assert.equal(urgent([]), "exited");
});

test("the +N popup has an explicit list height that stops growing at the row cap", () => {
  assert.equal(moreHeight(1) < moreHeight(3), true);
  assert.equal(moreHeight(MORE_ROWS_MAX + 5), moreHeight(MORE_ROWS_MAX));
  assert.equal(moreHeight(0), moreHeight(1));
});

test("promote moves the picked project to the front and keeps the rest in order", () => {
  const open = ["/a", "/b", "/c", "/d"];
  assert.deepEqual(promote(open, "/c"), ["/c", "/a", "/b", "/d"]);
  assert.equal(promote(open, "/a"), open); // already first: the same array
  assert.equal(promote(open, "all:"), open); // All and strangers change nothing
  assert.equal(promote(open, undefined), open);
  assert.deepEqual(open, ["/a", "/b", "/c", "/d"]);
  assert.equal(promote(promote(open, "/d"), "/d")[0], "/d");
});
