import test from "node:test";
import assert from "node:assert/strict";
import { reposWith, rootsKey, listCheckouts, resolveFolder, tilde, digitTile, jumpTarget, parseWorktrees, STORE } from "../mods/nebula/lib/repos.js";
import { PROJECTS } from "../mods/nebula/lib/shared.js";

const store = {
  list: [
    { root: "/r/a", name: "a" },
    { root: "/r/b", name: "b" },
  ],
  removed: [],
};
const ok = (stdout) => Promise.resolve({ code: 0, stdout, stderr: "" });

test("the store key is the shared projects value", () => {
  assert.equal(STORE, PROJECTS);
});

test("reposWith gives each project its checkouts, or a lone checkout at its root", () => {
  const out = reposWith(store, {
    "/r/a": [
      { path: "/r/a", branch: "main" },
      { path: "/r/a-worktrees/x", branch: "x" },
    ],
  });
  assert.equal(out[0].checkouts.length, 2);
  assert.deepEqual(out[1], { root: "/r/b", name: "b", checkouts: [{ path: "/r/b", branch: null }] });
  assert.deepEqual(reposWith(undefined, {}), []);
});

test("rootsKey changes with the roots and their order, and is empty for no store", () => {
  assert.equal(rootsKey(store), "/r/a\n/r/b");
  assert.notEqual(rootsKey(store), rootsKey({ list: [...store.list].reverse() }));
  assert.equal(rootsKey(undefined), "");
});

test("listCheckouts parses worktrees; a failed or throwing git gives null", async () => {
  const text = "worktree /r/a\nHEAD abc\nbranch refs/heads/main\n\nworktree /r/a-worktrees/x\nHEAD def\ndetached\n";
  const calls = [];
  const exec = (...args) => {
    calls.push(args);
    return ok(text);
  };
  assert.deepEqual(await listCheckouts(exec, "/r/a"), [
    { path: "/r/a", branch: "main" },
    { path: "/r/a-worktrees/x", branch: null },
  ]);
  assert.deepEqual(calls[0], ["git", ["worktree", "list", "--porcelain"], { cwd: "/r/a" }]);
  assert.equal(await listCheckouts(() => Promise.resolve({ code: 128, stdout: "" }), "/r/a"), null);
  assert.equal(await listCheckouts(() => Promise.reject(new Error("no git")), "/r/a"), null);
});

test("parseWorktrees skips blocks without a path and survives empty input", () => {
  assert.deepEqual(parseWorktrees(undefined), []);
  assert.deepEqual(parseWorktrees("HEAD abc\n\nworktree /p\n"), [{ path: "/p", branch: null }]);
});

test("resolveFolder: inside git it is the main repo, a plain folder is itself, a missing one is an error", async () => {
  assert.deepEqual(await resolveFolder(() => ok("/Users/x/app/.git\n"), "/Users/x/app-worktrees/f"), { root: "/Users/x/app", git: true });
  assert.deepEqual(await resolveFolder(() => Promise.resolve({ code: 128, stdout: "" }), "/Users/x/plain/"), { root: "/Users/x/plain", git: false });
  assert.deepEqual(await resolveFolder(() => Promise.reject(new Error("x")), "/nope"), { error: "No folder at /nope." });
});

test("tilde shortens a path under home and leaves other paths and an empty home alone", () => {
  assert.equal(tilde("/Users/x", "/Users/x"), "~");
  assert.equal(tilde("/Users/x/devl/app", "/Users/x/"), "~/devl/app");
  assert.equal(tilde("/Users/xy/app", "/Users/x"), "/Users/xy/app");
  assert.equal(tilde("/opt/app", "/Users/x"), "/opt/app");
  assert.equal(tilde("/opt/app", ""), "/opt/app");
});

test("digitTile takes 1 to 9 as places in the list; anything else is nothing", () => {
  const tiles = ["a", "b", "c"];
  assert.equal(digitTile(tiles, "1"), "a");
  assert.equal(digitTile(tiles, "3"), "c");
  assert.equal(digitTile(tiles, "4"), null);
  assert.equal(digitTile(tiles, "0"), null);
  assert.equal(digitTile(tiles, "12"), null);
});

test("jumpTarget walks the sessions that need attention in the given direction", () => {
  const repos = [{ root: "/r/a", name: "a", checkouts: [{ path: "/r/a", branch: "main" }] }];
  const terminals = [
    { address: "t1", cwd: "/r/a", status: "blocked", state: "live" },
    { address: "t2", cwd: "/r/a", status: "working", state: "live" },
    { address: "t3", cwd: "/r/a", status: "blocked", state: "live" },
  ];
  assert.equal(jumpTarget(terminals, repos, "t1", 1), "t3");
  assert.equal(jumpTarget(terminals, repos, "t3", 1), "t1");
  assert.equal(jumpTarget(terminals, repos, "t1", -1), "t3");
  assert.equal(jumpTarget([], repos, null, 1), null);
});
