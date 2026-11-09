import test from "node:test";
import assert from "node:assert/strict";
import { ALL, tabOf, scopeModel, tabKey, landOn, followFocus, foldAllState } from "../mods/nebula/lib/tabs.js";
import { OTHER, buildBoard, columnsModel, treeItems, listItems, projectColumns, projectItems, bandPaths, agentOrder } from "../mods/nebula/lib/viewmodel.js";
import { onlyOpen } from "../mods/nebula/lib/open.js";
import { arrange } from "../mods/nebula/lib/arrange.js";

const NOW = 10_000_000;
const repos = ["alpha", "beta", "gamma"].map((n) => ({
  root: `/r/${n}`,
  name: n,
  checkouts: [
    { path: `/r/${n}`, branch: "main" },
    { path: `/r/${n}-worktrees/feat`, branch: "feat" },
  ],
}));
const term = (address, cwd, status = "idle") => ({
  address,
  cwd,
  status,
  state: "live",
  app: "claude-code",
  program: { key: "claude", name: "Claude Code", shell: false },
  labels: {},
});

// alpha: a1 (main), a2 (feat); beta: b1; gamma: g1 (closed); a stray in Other.
const board = () =>
  buildBoard({
    terminals: [
      term("a1", "/r/alpha", "blocked"),
      term("a2", "/r/alpha-worktrees/feat", "working"),
      term("b1", "/r/beta"),
      term("g1", "/r/gamma"),
      term("s1", "/Users/x/Desktop"),
    ],
    agents: [],
    panes: [],
    spaces: [],
    repos,
    now: NOW,
  });
const OPEN = ["/r/alpha", "/r/beta"];
const shown = () => onlyOpen(board(), OPEN);
const ids = (items) => items.filter((i) => i.type === "session").map((i) => i.key);

test("the tab is the selected open project, else All (also when nothing is stored or the project is closed)", () => {
  assert.equal(tabOf(OPEN, "/r/beta"), "/r/beta");
  assert.equal(tabOf(OPEN, ALL), ALL);
  assert.equal(tabOf(OPEN, undefined), ALL);
  assert.equal(tabOf(OPEN, "/r/gamma"), ALL);
  assert.equal(tabOf([], "/r/alpha"), ALL);
});

test("All scopes to every open project and the Other group; a project tab to that project alone", () => {
  const m = shown();
  assert.deepEqual(
    scopeModel(m, ALL).repos.map((r) => r.root),
    ["/r/alpha", "/r/beta", OTHER],
  );
  assert.deepEqual(
    scopeModel(m, "/r/beta").repos.map((r) => r.root),
    ["/r/beta"],
  );
  assert.deepEqual(scopeModel(m, "/r/gamma").repos, []);
});

test("every view shows only the project tab's sessions; the Other group only on All, closed projects never", () => {
  const m = shown(),
    one = scopeModel(m, "/r/alpha"),
    all = scopeModel(m, ALL);
  assert.deepEqual(ids(treeItems(one, new Set())).sort(), ["a1", "a2"]);
  assert.deepEqual(ids(listItems(one)).sort(), ["a1", "a2"]);
  assert.deepEqual(
    columnsModel(one)
      .flatMap((c) => c.rows)
      .map((r) => r.id)
      .sort(),
    ["a1", "a2"],
  );
  assert.deepEqual(ids(treeItems(all, new Set())).sort(), ["a1", "a2", "b1", "s1"]);
  const grouped = listItems(all, { all: true });
  assert.deepEqual(
    grouped.filter((i) => i.type === "repo").map((i) => i.repo.root),
    ["/r/alpha", "/r/beta", OTHER],
  );
  assert.deepEqual(ids(grouped).sort(), ["a1", "a2", "b1", "s1"]);
  assert.deepEqual(
    columnsModel(all)
      .flatMap((c) => c.rows)
      .map((r) => r.id)
      .sort(),
    ["a1", "a2", "b1", "s1"],
  );
  assert.ok(!ids(listItems(all, { all: true })).includes("g1"));
});

test("the filter and the sort work inside the tab", () => {
  const m = scopeModel(shown(), "/r/alpha");
  assert.deepEqual(
    arrange(m, { filter: "feat" })
      .repos.flatMap((r) => r.rows)
      .map((r) => r.id),
    ["a2"],
  );
  assert.deepEqual(arrange(scopeModel(shown(), "/r/beta"), { filter: "alpha" }).repos, []);
  assert.deepEqual(
    arrange(scopeModel(shown(), ALL), { filter: "alpha" }).repos.map((r) => r.root),
    ["/r/alpha"],
  );
  assert.equal(arrange(m, { sort: "name" }).sort, "name");
});

test("Projects mode: a project tab has no PROJECTS column, All keeps all three", () => {
  const one = scopeModel(shown(), "/r/alpha"),
    all = scopeModel(shown(), ALL);
  const pc = projectColumns(one, {}, "/r/alpha", true);
  assert.equal(pc.sel.project, "/r/alpha");
  assert.deepEqual(
    projectItems(pc).map((i) => i.type),
    ["worktree", "worktree", "session"],
  );
  assert.deepEqual(
    projectItems(projectColumns(all, {}, null))
      .map((i) => i.type)
      .filter((t) => t === "project").length,
    3,
  );
  assert.equal(projectColumns(all, {}, null).scoped, false);
});

test("the agent order of a scoped model lists its sessions in tree order", () => {
  assert.deepEqual(agentOrder(scopeModel(shown(), "/r/beta"), "cards", "/r/beta"), ["b1"]);
  assert.deepEqual(agentOrder(scopeModel(shown(), ALL), "list", null).sort(), ["a1", "a2", "b1", "s1"]);
});

test("0 is All, 1 to 9 the open tabs in order, anything else nothing", () => {
  assert.equal(tabKey(OPEN, "0"), ALL);
  assert.equal(tabKey(OPEN, "1"), "/r/alpha");
  assert.equal(tabKey(OPEN, "2"), "/r/beta");
  assert.equal(tabKey(OPEN, "3"), null);
  assert.equal(tabKey(OPEN, "9"), null);
  assert.equal(tabKey(OPEN, "a"), null);
  assert.equal(tabKey([], "0"), ALL);
});

test("showing a session: a project tab moves to its project, All stays, Other goes to All, a closed project is opened", () => {
  assert.deepEqual(landOn("/r/alpha", OPEN, "/r/beta"), { tab: "/r/beta", open: false });
  assert.deepEqual(landOn("/r/beta", OPEN, "/r/beta"), { tab: "/r/beta", open: false });
  assert.deepEqual(landOn(ALL, OPEN, "/r/beta"), { tab: ALL, open: false });
  assert.deepEqual(landOn("/r/alpha", OPEN, OTHER), { tab: ALL, open: false });
  assert.deepEqual(landOn(ALL, OPEN, OTHER), { tab: ALL, open: false });
  assert.deepEqual(landOn("/r/alpha", OPEN, "/r/gamma"), { tab: "/r/gamma", open: true });
  assert.deepEqual(landOn(ALL, OPEN, "/r/gamma"), { tab: ALL, open: true });
});

test("follow focus reacts only to a change to an agent the board knows, and not while the board has the keys", () => {
  const model = board(),
    base = { terminal: "a1", last: "b1", boardKeys: false, model };
  assert.deepEqual(followFocus(base), { last: "a1", id: "a1" });
  assert.deepEqual(followFocus({ ...base, last: "a1" }), { last: "a1", id: null });
  assert.deepEqual(followFocus({ ...base, terminal: null }), { last: "b1", id: null });
  assert.deepEqual(followFocus({ ...base, boardKeys: true }), { last: "b1", id: null });
  assert.deepEqual(followFocus({ ...base, terminal: "g1" }), { last: "g1", id: "g1" }); // a closed project's agent is known
  assert.deepEqual(followFocus({ ...base, terminal: "s1" }), { last: "s1", id: "s1" });
  assert.deepEqual(followFocus({ ...base, terminal: "shell9" }), { last: "shell9", id: null });
  const neb = buildBoard({
    terminals: [],
    agents: [],
    panes: [],
    spaces: [],
    repos,
    now: NOW,
    nebula: [{ id: "n1", name: "N", worktree: "/r/alpha", status: "idle", alive: false, summary: "N", model: "", effort: "" }],
  });
  assert.equal(followFocus({ terminal: "nebula:n1", last: null, boardKeys: false, model: neb }).id, null);
});

test("Collapse all / Expand all act on what is shown: headers on All, bands on a project tab", () => {
  const all = scopeModel(shown(), ALL).repos,
    one = scopeModel(shown(), "/r/alpha").repos;
  const start = { folded: new Set(["/r/gamma"]), bands: new Set(["/keep"]) };
  const a = foldAllState(start, all, true, ALL);
  assert.deepEqual([...a.folded].sort(), ["/r/alpha", "/r/beta", "/r/gamma", OTHER].sort());
  assert.deepEqual([...a.bands], ["/keep"]);
  const b = foldAllState({ folded: a.folded, bands: new Set([...bandPaths(all[0]), "/keep"]) }, all, false, ALL);
  assert.deepEqual([...b.folded], ["/r/gamma"]);
  assert.deepEqual([...b.bands], ["/keep"]);
  const c = foldAllState(start, one, true, "/r/alpha");
  assert.deepEqual([...c.folded], ["/r/gamma"]);
  assert.deepEqual([...c.bands].sort(), ["/keep", ...bandPaths(one[0])].sort());
  const d = foldAllState({ folded: new Set(["/r/alpha"]), bands: c.bands }, one, false, "/r/alpha");
  assert.deepEqual([...d.folded], []);
  assert.deepEqual([...d.bands], ["/keep"]);
});
