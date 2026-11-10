// Ported from nebula's nebula-fuzzy crate tests (crates/nebula-fuzzy/src/lib.rs).
import test from "node:test";
import assert from "node:assert/strict";
import { fuzzyMatch, rank, rankBy } from "../mods/nebula/lib/fuzzy.js";

test("an empty query matches everything with no positions", () => {
  const m = fuzzyMatch("", "anything");
  assert.equal(m.score, 0);
  assert.deepEqual(m.positions, []);
});

test("a subsequence matches and reports positions (ties keep the leftmost start)", () => {
  assert.deepEqual(fuzzyMatch("srv", "src/server.rs").positions, [0, 1, 7]);
});

test("the best start prefers the filename run", () => {
  assert.deepEqual(fuzzyMatch("serv", "src/server.rs").positions, [4, 5, 6, 7]);
});

test("a missing char fails", () => {
  assert.equal(fuzzyMatch("xyz", "src/server.rs"), null);
  assert.equal(fuzzyMatch("abc", "ab"), null);
});

test("the match is case-insensitive", () => {
  assert.ok(fuzzyMatch("READ", "readme.md"));
  assert.ok(fuzzyMatch("read", "README.md"));
});

test("a consecutive run beats a scattered match", () => {
  const run = fuzzyMatch("serv", "src/server.rs"),
    scattered = fuzzyMatch("serv", "s_e_r_v.rs");
  assert.ok(run.score > scattered.score);
});

test("a segment start beats mid-word", () => {
  assert.ok(fuzzyMatch("ui", "src/ui.rs").score > fuzzyMatch("ui", "build.rs").score);
});

test("space-separated terms match independently", () => {
  const m = fuzzyMatch("neb #10", "nebula/#10 Credit Codex and Cursor in the README");
  assert.deepEqual(m.positions, [0, 1, 2, 7, 8, 9]);
});

test("terms may appear in any order", () => {
  assert.ok(fuzzyMatch("#10 neb", "nebula/#10 Credit Codex"));
  assert.ok(fuzzyMatch("requests show", "nebula/main/Show Open Pull Requests"));
});

test("every term must match", () => {
  assert.equal(fuzzyMatch("neb #11", "nebula/#10 Credit Codex"), null);
  assert.equal(fuzzyMatch("neb zzz", "nebula/#10 Credit Codex"), null);
});

test("positions are ascending and deduped across overlapping terms", () => {
  assert.deepEqual(fuzzyMatch("ne neb", "nebula/main").positions, [0, 1, 2]);
});

test("a whitespace-only query matches everything, in order", () => {
  const m = fuzzyMatch("   ", "anything");
  assert.equal(m.score, 0);
  assert.deepEqual(m.positions, []);
  assert.deepEqual(rank("  ", ["a-longer-one", "ab"]), [
    { index: 0, positions: [] },
    { index: 1, positions: [] },
  ]);
});

test("a trailing space behaves like the bare term", () => {
  assert.deepEqual(fuzzyMatch("serv ", "src/server.rs"), fuzzyMatch("serv", "src/server.rs"));
});

test("multi-term ranking floats the row that matches both", () => {
  const rows = [
    "nebula/main/Show Open Pull Requests",
    "nebula/worktree-readme-tweak/Readme Tweak Pull Request",
    "nebula/#10 Credit Codex and Cursor in the README tagline",
  ];
  const ranked = rank("neb #10", rows);
  assert.equal(ranked.length, 1, "only the #10 row has both terms");
  assert.equal(ranked[0].index, 2);
});

test("rankBy lists an empty query in key order and breaks ties by key", () => {
  assert.deepEqual(
    rankBy("", ["b", "a", "c"], (i) => [2, 0, 1][i]).map((r) => r.index),
    [1, 2, 0],
    "key order, not original order",
  );
  assert.equal(rankBy("main", ["demo/main", "demo/main/agent-1"], (i) => [1, 0][i])[0].index, 1, "equal scores: the key decides, not the text length");
  assert.equal(rankBy("read", ["feat/unread", "feat/read"], (i) => i)[0].index, 1, "a better score still beats a better key");
});

test("rank breaks equal scores by shorter text, then original order", () => {
  assert.deepEqual(
    rank("a", ["xa", "a", "ya"]).map((r) => r.index),
    [1, 0, 2],
  );
});
