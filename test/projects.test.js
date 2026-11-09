import test from "node:test";
import assert from "node:assert/strict";
import { groupSessions, repoCounts } from "../mods/nebula/lib/projects.js";

const acme = {
  root: "/Users/dev/devl/acme-web",
  name: "acme-web",
  checkouts: [
    { path: "/Users/dev/devl/acme-web", branch: "main" },
    { path: "/Users/dev/devl/acme-web-worktrees/checkout-flow", branch: "checkout-flow" },
  ],
};
const claude = (address, cwd, status = "working", extra = {}) => ({ address, cwd, status, state: "live", ...extra });

test("a Claude terminal in a subfolder of a linked worktree groups under its repo, checkout checkout-flow", () => {
  const g = groupSessions([claude("t1", "/Users/dev/devl/acme-web-worktrees/checkout-flow/src")], [acme]);
  assert.equal(g.repos[0].name, "acme-web");
  const band = g.repos[0].bands.find((b) => b.sessions.length);
  assert.equal(band.branch, "checkout-flow");
  assert.equal(band.sessions[0].address, "t1");
  assert.deepEqual(g.other, []);
});

test("the same checkout open in two spaces yields one band", () => {
  const cwd = "/Users/dev/devl/acme-web";
  const g = groupSessions([claude("t1", cwd, "working", { space: "s1" }), claude("t2", cwd, "idle", { space: "s2" })], [acme]);
  const bands = g.repos[0].bands.filter((b) => b.sessions.length);
  assert.equal(bands.length, 1);
  assert.deepEqual(bands[0].sessions.map((s) => s.address), ["t1", "t2"]);
});

test("the deepest checkout wins when one sits inside another", () => {
  const repo = { ...acme, checkouts: [...acme.checkouts, { path: "/Users/dev/devl/acme-web/.claude/worktrees/x", branch: "x" }] };
  const g = groupSessions([claude("t1", "/Users/dev/devl/acme-web/.claude/worktrees/x/src")], [repo]);
  assert.equal(g.repos[0].bands.find((b) => b.sessions.length).branch, "x");
});

test("a space in ~/Desktop (no git) lands in Other", () => {
  const g = groupSessions([claude("t1", "/Users/dev/Desktop")], [acme]);
  assert.deepEqual(g.other.map((s) => s.address), ["t1"]);
  assert.equal(g.repos[0].bands.every((b) => b.sessions.length === 0), true);
});

test("a checkout the repo list does not know yet groups by its git common dir", () => {
  const g = groupSessions([claude("t1", "/Users/dev/devl/acme-web-worktrees/new-one", "idle", { commonDir: "/Users/dev/devl/acme-web/.git" })], [acme]);
  const band = g.repos[0].bands.find((b) => b.sessions.length);
  assert.equal(band.path, "/Users/dev/devl/acme-web-worktrees/new-one");
  assert.deepEqual(g.other, []);
});

test("repo counts tally each status and leave sub-agents and plain shells out", () => {
  const cwd = "/Users/dev/devl/acme-web";
  const g = groupSessions(
    [
      claude("t1", cwd, "blocked"),
      claude("t2", cwd, "working"),
      claude("t3", cwd, "working", { parent: "t1" }),
      { address: "t4", cwd, state: "live", program: { shell: true, name: "zsh" } },
    ],
    [acme],
  );
  assert.deepEqual(repoCounts(g.repos[0]), { needs: 1, working: 1, unseen: 0, seen: 0, exited: 0 });
});

test("two sessions in the same checkout the list does not know yet share one band", () => {
  const cwd = "/Users/dev/devl/acme-web-worktrees/new-one";
  const common = { commonDir: "/Users/dev/devl/acme-web/.git" };
  const g = groupSessions([claude("t1", cwd, "idle", common), claude("t2", cwd, "working", common)], [acme]);
  assert.equal(g.repos[0].bands.filter((b) => b.sessions.length).length, 1);
});
