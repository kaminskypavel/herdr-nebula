import test from "node:test";
import assert from "node:assert/strict";
import { arrange, cleanSort, byName } from "../mods/nebula/lib/arrange.js";
import { bandStats, bandParts, columnsModel, projectColumns } from "../mods/nebula/lib/viewmodel.js";

const row = (id, title, status, extra = {}) => ({ id, title, status, subs: [], ...extra });
const band = (path, label, rows, branch = label) => ({ path, label, branch, ahead: 0, added: 0, deleted: 0, rows });
const repo = (root, name, bands) => ({ root, name, bands, rows: bands.flatMap((b) => b.rows), counts: {} });

// zed: only idle; mike: a needs-you session; apple: only grey; empty: no sessions
const model = () => ({
  repos: [
    repo("/zed", "zed", [band("/zed", "main", [row("z1", "beta task", "seen"), row("z2", "Alpha task", "seen")])]),
    repo("/mike", "Mike", [
      band("/mike", "main", [row("m1", "refactor", "working"), row("m2", "docs", "needs")]),
      band("/mike-wt", "Feature-X", [row("m3", "deploy", "unseen")]),
    ]),
    repo("/apple", "apple", [band("/apple", "main", [row("a1", "old", "exited"), row("a2", "nebula one", "exited", { kind: "nebula" })])]),
    repo("/empty", "empty", []),
  ],
});
const ids = (m) => m.repos.map((r) => r.root);
const sessions = (m) => m.repos.flatMap((r) => r.rows.map((x) => x.id));

test("no filter, status sort: projects by most urgent status, grey and empty last, stable otherwise", () => {
  const m = arrange(model(), { sort: "status" });
  assert.deepEqual(ids(m), ["/mike", "/zed", "/apple", "/empty"]);
  assert.equal(m.sort, "status");
  // sessions keep the order buildBoard gave them
  assert.deepEqual(m.repos[1].rows.map((r) => r.id), ["z1", "z2"]);
});

test("default sort is status, the same as asking for it", () => {
  assert.deepEqual(arrange(model()), arrange(model(), { sort: "status", filter: "" }));
});

test("name sort: projects, worktrees and sessions alphabetical and case-insensitive, grey not special", () => {
  const m = arrange(model(), { sort: "name" });
  assert.deepEqual(ids(m), ["/apple", "/empty", "/mike", "/zed"]);
  assert.deepEqual(m.repos[2].bands.map((b) => b.label), ["Feature-X", "main"]);
  assert.deepEqual(m.repos[3].rows.map((r) => r.id), ["z2", "z1"]);
  assert.deepEqual(m.repos[0].rows.map((r) => r.id), ["a2", "a1"]);
});

test("name sort keeps equal names in their order (stable)", () => {
  const m = arrange({ repos: [repo("/a", "x", [band("/a", "main", [row("1", "same", "seen"), row("2", "SAME", "needs"), row("3", "same", "working")])])] }, { sort: "name" });
  assert.deepEqual(m.repos[0].rows.map((r) => r.id), ["1", "2", "3"]);
});

test("filter matches the session title, case-insensitively, as a substring", () => {
  const m = arrange(model(), { filter: "ALPHA" });
  assert.deepEqual(sessions(m), ["z2"]);
  assert.deepEqual(ids(m), ["/zed"]);
});

test("a project whose name matches shows all its sessions", () => {
  const m = arrange(model(), { filter: "mike" });
  assert.deepEqual(ids(m), ["/mike"]);
  assert.deepEqual(sessions(m), ["m1", "m2", "m3"]);
});

test("a project whose name matches stays even with no sessions", () => {
  assert.deepEqual(ids(arrange(model(), { filter: "empt" })), ["/empty"]);
});

test("filter matches the worktree label and branch: that band's sessions all show", () => {
  const m = arrange(model(), { filter: "feature" });
  assert.deepEqual(sessions(m), ["m3"]);
  assert.deepEqual(m.repos[0].bands.map((b) => b.path), ["/mike-wt"]);
  const byBranch = { repos: [repo("/r", "r", [band("/r-wt", "wt", [row("x", "t", "seen")], "fix/login")])] };
  assert.deepEqual(sessions(arrange(byBranch, { filter: "login" })), ["x"]);
});

test("filter matches nebula rows by title; empty bands and projects hide", () => {
  const m = arrange(model(), { filter: "nebula" });
  assert.deepEqual(sessions(m), ["a2"]);
  assert.deepEqual(ids(m), ["/apple"]);
  assert.equal(m.repos[0].bands.length, 1);
});

test("filter counts follow the visible rows; no match gives no projects", () => {
  const m = arrange(model(), { filter: "refactor" });
  assert.equal(m.repos[0].counts.working, 1);
  assert.equal(m.repos[0].counts.needs, 0);
  assert.deepEqual(arrange(model(), { filter: "zzz" }).repos, []);
});

test("a blank filter (spaces) shows everything; the input model is not changed", () => {
  const before = model();
  assert.deepEqual(sessions(arrange(before, { filter: "   " })), sessions(arrange(model())));
  assert.deepEqual(ids(arrange(before, { filter: "  " })), ["/mike", "/zed", "/apple", "/empty"]);
  assert.deepEqual(before, model());
});

test("filter and sort combine", () => {
  const m = arrange(model(), { filter: "task", sort: "name" });
  assert.deepEqual(ids(m), ["/zed"]);
  assert.deepEqual(sessions(m), ["z2", "z1"]);
});

test("columnsModel follows the model's sort", () => {
  const byStatusCols = columnsModel(arrange(model(), { sort: "status" }));
  const seen = byStatusCols.find((c) => c.status === "seen").rows.map((r) => r.id);
  assert.deepEqual(seen, ["z1", "z2", "a1", "a2"]); // idle first, grey after
  const byNameCols = columnsModel(arrange(model(), { sort: "name" }));
  assert.deepEqual(byNameCols.find((c) => c.status === "seen").rows.map((r) => r.id), ["z2", "z1", "a2", "a1"]);
});

test("projectColumns keeps the arranged order under name sort and orders by urgency under status", () => {
  assert.deepEqual(projectColumns(arrange(model(), { sort: "name" })).projects.map((p) => p.key), ["/apple", "/empty", "/mike", "/zed"]);
  assert.deepEqual(projectColumns(arrange(model(), { sort: "status" })).projects.map((p) => p.key), ["/mike", "/zed", "/apple", "/empty"]);
  assert.deepEqual(projectColumns(arrange(model(), { sort: "name" }), { project: "/mike" }).worktrees.map((w) => w.label), ["Feature-X", "main"]);
});

test("cleanSort and byName", () => {
  assert.equal(cleanSort("name"), "name");
  assert.equal(cleanSort("nope"), "status");
  assert.equal(cleanSort(undefined), "status");
  assert.deepEqual(["b", "A", "c"].sort(byName((s) => s)), ["A", "b", "c"]);
});

test("bandStats names each part's colour kind, bandParts keeps the text", () => {
  const b = { ahead: 5, added: 14387, deleted: 3 };
  assert.deepEqual(bandStats(b), [{ kind: "ahead", text: "↑5" }, { kind: "added", text: "+14387" }, { kind: "deleted", text: "−3" }]);
  assert.deepEqual(bandParts(b), ["↑5", "+14387", "−3"]);
  assert.deepEqual(bandStats({ ahead: 0, added: 0, deleted: 2 }), [{ kind: "deleted", text: "−2" }]);
});
