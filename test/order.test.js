import test from "node:test";
import assert from "node:assert/strict";
import { nextAttention } from "../mods/nebula/lib/order.js";

const row = (id, status) => ({ id, status });

test("from a working agent with one blocked and one done agent elsewhere, the walk returns the blocked one, then the done one, then nothing", () => {
  let rows = [row("w", "working"), row("d", "unseen"), row("b", "needs")];
  assert.equal(nextAttention(rows, "w"), "b");
  assert.equal(nextAttention(rows, "b"), "d");
  // the blocked agent was answered and the done one was looked at
  rows = [row("w", "working"), row("d", "seen"), row("b", "working")];
  assert.equal(nextAttention(rows, "d"), null);
});

test("needs you comes before unseen even when unseen is closer", () => {
  const rows = [row("a", "working"), row("u", "unseen"), row("n", "needs")];
  assert.equal(nextAttention(rows, "a"), "n");
});

test("forward and backward walks wrap around the board order", () => {
  const rows = [row("n1", "needs"), row("x", "working"), row("n2", "needs")];
  assert.equal(nextAttention(rows, "n2"), "n1");
  assert.equal(nextAttention(rows, "n1", -1), "n2");
  assert.equal(nextAttention(rows, "x", -1), "n1");
});

test("a walk that starts on nothing in the list begins at the top", () => {
  assert.equal(nextAttention([row("a", "needs"), row("b", "needs")], null), "a");
});
