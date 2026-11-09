import test from "node:test";
import assert from "node:assert/strict";
import { step, findNode, FOLDED, TERMINAL, BOARD } from "../mods/nebula/lib/focus.js";
import { digitTile, parseWorktrees, resolveAdd, jumpTarget, projectList, addProject, removeProject, taken } from "../mods/nebula/lib/repos.js";

const chord = { type: "chord" };

test("folded, then the focus key: the board shows and has the keys", () => {
  assert.deepEqual(step(FOLDED, chord), { state: BOARD, act: "show-board" });
});

test("board has the keys, then the focus key: the board folds and the terminal has the keys", () => {
  assert.deepEqual(step(BOARD, chord), { state: FOLDED, act: "fold" });
});

test("shown with the terminal focused, then the focus key: the board takes the keys", () => {
  assert.deepEqual(step(TERMINAL, chord), { state: BOARD, act: "focus-board" });
});

test("pressing the focus key three times walks folded, board, folded", () => {
  let s = FOLDED;
  const seen = [];
  for (let i = 0; i < 3; i++) {
    s = step(s, chord).state;
    seen.push(s);
  }
  assert.deepEqual(seen, [BOARD, FOLDED, BOARD]);
});

test("a launch from the board leaves the keys on the board and asks for them back", () => {
  assert.deepEqual(step(BOARD, { type: "launch" }), { state: BOARD, act: "focus-board" });
});

test("a launch from a terminal leaves the keys with the terminal", () => {
  assert.deepEqual(step(TERMINAL, { type: "launch" }), { state: TERMINAL, act: null });
  assert.deepEqual(step(FOLDED, { type: "launch" }), { state: FOLDED, act: null });
});

test("a click in a terminal while the board has the keys hands them to the terminal", () => {
  assert.deepEqual(step(BOARD, { type: "terminalClick" }), { state: TERMINAL, act: null });
  assert.deepEqual(step(BOARD, { type: "keys", board: false }), { state: TERMINAL, act: null });
});

test("Enter on a row shows the agent and gives the terminal the keys", () => {
  assert.deepEqual(step(BOARD, { type: "enter" }), { state: TERMINAL, act: "focus-terminal" });
});

test("a click on a shown board takes the keys; a hidden board cannot be clicked", () => {
  assert.deepEqual(step(TERMINAL, { type: "rowClick" }), { state: BOARD, act: "focus-board" });
  assert.deepEqual(step(FOLDED, { type: "rowClick" }), { state: FOLDED, act: null });
});

test("Herdr showing or hiding the board outside the chord keeps the state honest", () => {
  assert.deepEqual(step(FOLDED, { type: "visible", shown: true }), { state: TERMINAL, act: null });
  assert.deepEqual(step(BOARD, { type: "visible", shown: false }), { state: FOLDED, act: null });
  assert.deepEqual(step(BOARD, { type: "visible", shown: true }), { state: BOARD, act: null });
});

test("the board reporting it has the keys moves a shown board to board; a folded one stays folded", () => {
  assert.deepEqual(step(TERMINAL, { type: "keys", board: true }), { state: BOARD, act: null });
  assert.deepEqual(step(FOLDED, { type: "keys", board: true }), { state: FOLDED, act: null });
  assert.deepEqual(step(FOLDED, { type: "keys", board: false }), { state: FOLDED, act: null });
});

// ---- rail

const acme = {
  root: "/Users/dev/devl/acme-web",
  name: "acme-web",
  checkouts: [{ path: "/Users/dev/devl/acme-web", branch: "main" }],
};
const dns = { root: "/Users/dev/devl/docs-site", name: "docs-site", checkouts: [{ path: "/Users/dev/devl/docs-site", branch: "main" }] };
const term = (address, cwd, status, extra = {}) => ({ address, cwd, status, state: "live", ...extra });

test("the 10th open tab has no digit shortcut", () => {
  const tiles = Array.from({ length: 10 }, (_, i) => ({ root: `/r/${i}` }));
  assert.equal(digitTile(tiles, "1").root, "/r/0");
  assert.equal(digitTile(tiles, "9").root, "/r/8");
  assert.equal(digitTile(tiles, "0"), null);
  assert.equal(digitTile(tiles, "a"), null);
  assert.equal(digitTile(tiles.slice(0, 2), "3"), null);
});

test("a worktree list becomes checkouts with the main one first", () => {
  const text = [
    "worktree /Users/dev/devl/acme-web",
    "HEAD abc",
    "branch refs/heads/main",
    "",
    "worktree /Users/dev/devl/acme-web-worktrees/checkout-flow",
    "HEAD def",
    "branch refs/heads/checkout-flow",
    "",
    "worktree /tmp/detached",
    "HEAD 123",
    "detached",
    "",
  ].join("\n");
  assert.deepEqual(parseWorktrees(text), [
    { path: "/Users/dev/devl/acme-web", branch: "main" },
    { path: "/Users/dev/devl/acme-web-worktrees/checkout-flow", branch: "checkout-flow" },
    { path: "/tmp/detached", branch: null },
  ]);
});

test("adding a worktree folder of an existing repo resolves to that repo instead of a second tile", () => {
  const store = addProject({}, "/Users/dev/devl/acme-web", { name: "acme-web" });
  const r = resolveAdd(store, "/Users/dev/devl/acme-web/.git");
  assert.equal(r.root, "/Users/dev/devl/acme-web");
  assert.equal(r.existing?.name, "acme-web");
  // what git reports from inside a linked worktree is still the main repo's common dir
  assert.equal(taken(store, r.root), true);
  assert.equal(addProject(store, r.root, { name: "again" }), store);
  assert.equal(projectList(store).length, 1);
});

test("a new repo resolves to itself with no existing tile", () => {
  const r = resolveAdd({}, "/Users/dev/devl/nebula/.git");
  assert.deepEqual(r, { root: "/Users/dev/devl/nebula", existing: null });
});

test("the store is { list, removed }: add by root, remove by root, and a removed root is remembered", () => {
  let store = addProject({}, "/a/one");
  store = addProject(store, "/a/two");
  const [one] = projectList(store);
  assert.deepEqual(one, { root: "/a/one", name: "one" });
  store = removeProject(store, "/a/one/");
  assert.deepEqual(
    projectList(store).map((p) => p.root),
    ["/a/two"],
  );
  assert.deepEqual(store.removed, ["/a/one"]);
  assert.equal(removeProject(store, "/a/one"), store);
  store = addProject(store, "/a/one");
  assert.deepEqual(store.removed, []);
  assert.deepEqual(
    projectList(store).map((p) => p.root),
    ["/a/two", "/a/one"],
  );
});

test("from the terminal of a working agent, the jump key finds the agent that needs you, in board order", () => {
  const cwd = acme.root;
  const terminals = [term("w", cwd, "working"), term("d", cwd, "done"), term("b", dns.root, "blocked")];
  assert.equal(jumpTarget(terminals, [acme, dns], "w", 1), "b");
  assert.equal(jumpTarget(terminals, [acme, dns], "b", 1), "d");
  assert.equal(jumpTarget([term("w", cwd, "working")], [acme], "w", 1), null);
});

test("findNode finds a layout node by id at any depth, else null", () => {
  const tree = { id: "root", children: [{ id: "a", children: [{ id: "deep" }] }, { id: "b" }] };
  assert.equal(findNode(tree, "root"), tree);
  assert.equal(findNode(tree, "deep").id, "deep");
  assert.equal(findNode(tree, "zzz"), null);
  assert.equal(findNode(null, "a"), null);
});

test("an unknown event leaves the state alone", () => {
  assert.deepEqual(step(BOARD, { type: "nonsense" }), { state: BOARD, act: null });
});
