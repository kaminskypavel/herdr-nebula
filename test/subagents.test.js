import test from "node:test";
import assert from "node:assert/strict";
import { hookSubs, subRow, duration, byParent, tree } from "../mods/nebula/lib/subagents.js";

const label = (o) => JSON.stringify({ at: 1000, ...o });

test("a sub-agent label with a description and model yields that text and badge", () => {
  const [h] = hookSubs({ "nebula.sub.a1": label({ type: "general-purpose", desc: "Doc review: coherence", model: "haiku" }) });
  assert.deepEqual(subRow(h), { text: "Doc review: coherence", badge: "haiku" });
});

test("a sub-agent label without them falls back to its type and no badge", () => {
  const [h] = hookSubs({ "nebula.sub.a1": label({ type: "Explore" }) });
  assert.deepEqual(subRow(h), { text: "Explore", badge: "" });
});

test("labels that are not sub-agents or not JSON are skipped, oldest first", () => {
  const subs = hookSubs({
    "nebula.board": "1",
    "nebula.sub.bad": "{nope",
    "nebula.sub.b": label({ type: "B", at: 2000 }),
    "nebula.sub.a": label({ type: "A", at: 1000 }),
  });
  assert.deepEqual(
    subs.map((s) => s.type),
    ["A", "B"],
  );
});

test("a sub-agent older than 12 hours is dropped when the clock is given", () => {
  const labels = { "nebula.sub.old": label({ type: "Old", at: 1000 }) };
  assert.equal(hookSubs(labels, 1000 + 13 * 3600000).length, 0);
  assert.equal(hookSubs(labels, 1000 + 3600000).length, 1);
});

test("durations read as <1m, minutes, hours and days", () => {
  assert.deepEqual([30000, 5 * 60000, 3 * 3600000, 50 * 3600000].map(duration), ["<1m", "5m", "3h", "2d"]);
});

test("terminal sub-agents nest under their parent, depth first", () => {
  const all = [
    { address: "a", state: "live" },
    { address: "b", parent: "a", state: "live" },
    { address: "c", parent: "b", state: "live" },
    { address: "d", parent: "a", state: "live" },
  ];
  assert.deepEqual(
    tree(byParent(all), "a").map((r) => [r.k.address, r.lines.join("")]),
    [
      ["b", "├"],
      ["c", "│└"],
      ["d", "└"],
    ],
  );
});
