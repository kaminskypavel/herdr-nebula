import test from "node:test";
import assert from "node:assert/strict";
import { statusOf, withSeen, liveAgentsIn, COLOR } from "../mods/nebula/lib/status.js";

test("Herdr statuses blocked, working, done and idle map to needs you, working, unseen and seen", () => {
  assert.equal(statusOf({ status: "blocked" }), "needs");
  assert.equal(statusOf({ status: "working" }), "working");
  assert.equal(statusOf({ status: "done" }), "unseen");
  assert.equal(statusOf({ status: "idle" }), "seen");
});

test("an agent error counts as needing you", () => {
  assert.equal(statusOf({ status: "error" }), "needs");
});

test("a labeled terminal whose foreground program is zsh maps to exited", () => {
  const t = { labels: { "nebula.board": "1" }, program: { key: "shell", name: "zsh", shell: true } };
  assert.equal(statusOf(t), "exited");
});

test("a labeled terminal whose agent still reports status keeps that status", () => {
  const t = { status: "working", labels: { "nebula.board": "1" }, program: { key: "claude", name: "Claude Code", shell: false } };
  assert.equal(statusOf(t), "working");
});

test("a labeled terminal that never reports status shows exited", () => {
  assert.equal(statusOf({ labels: { "nebula.board": "1" }, program: { key: "program", name: "pi", shell: false } }), "exited");
});

test("a plain shell terminal that nobody launched from the board is not a session", () => {
  assert.equal(statusOf({ program: { key: "shell", name: "zsh", shell: true } }), null);
});

test("each status has a theme color; exited uses the theme's unknown", () => {
  assert.deepEqual(COLOR, { needs: "ansi1", working: "ansi3", unseen: "ansi6", seen: "ansi2", exited: "unknown" });
});

test("withSeen: a done agent you looked at reads idle, the rest stay as the core says", () => {
  const ts = [
    { address: "t1", status: "done" },
    { address: "t2", status: "done" },
    { address: "t3", status: "working" },
  ];
  const out = withSeen(ts, [
    { address: "t1", status: "idle" },
    { address: "t2", status: "done" },
  ]);
  assert.deepEqual(
    out.map((t) => t.status),
    ["idle", "done", "working"],
  );
});

test("liveAgentsIn counts a tab's running agents, not its shells or stopped ones", () => {
  const tab = { "herdr.tab": "tb1" };
  const ts = [
    { status: "working", labels: tab, state: "live" },
    { status: "idle", labels: tab, state: "live" },
    { status: null, labels: tab, state: "live", program: { name: "zsh", shell: true } },
    { status: "idle", labels: { "herdr.tab": "tb2" }, state: "live" },
  ];
  assert.equal(liveAgentsIn(ts, "tb1"), 2);
  assert.equal(liveAgentsIn(ts, "tb3"), 0);
});
