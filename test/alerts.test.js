import test from "node:test";
import assert from "node:assert/strict";
import { projectAlerts, ringOpacity, trackArrivals, awayItems, awayText, AWAY_MAX } from "../mods/nebula/lib/alerts.js";
import { clearKey, RING_MS, waitingRows } from "../mods/nebula/lib/waiting.js";
import { hopping, HOP_MS } from "../mods/nebula/lib/motion.js";

const row = (id, status, changedAt, extra = {}) => ({
  id,
  kind: "agent",
  status,
  changedAt,
  stateSince: changedAt,
  archived: false,
  exited: false,
  title: `s-${id}`,
  prompt: "",
  ...extra,
});

test("a project counts only the needs-you rows that wait: cleared ones are not counted", () => {
  const rows = [row("a", "needs", 100), row("b", "needs", 200), row("c", "working", 300), row("d", "seen", 400)];
  assert.deepEqual(projectAlerts(rows, {}, 1000), { needs: 2, ring: 0 });
  assert.deepEqual(projectAlerts(rows, { a: clearKey(rows[0]) }, 1000), { needs: 1, ring: 0 });
});

test("a finish rings its project for RING_MS and fades over the last minute; a cleared finish does not ring", () => {
  const r = row("a", "unseen", 1000);
  assert.equal(projectAlerts([r], {}, 1000 + 5000).ring, 1);
  assert.equal(projectAlerts([r], {}, 1000 + RING_MS - 30000).ring, 0.5);
  assert.equal(ringOpacity(r, 1000 + RING_MS - 1), 0.2);
  assert.equal(projectAlerts([r], {}, 1000 + RING_MS).ring, 0);
  assert.equal(projectAlerts([r], { a: clearKey(r) }, 1005).ring, 0);
  assert.equal(projectAlerts([row("n", "needs", 1000)], {}, 1005).ring, 0);
});

test("arrivals: a row that enters needs or unseen after the first look; first sight and unchanged rows do not", () => {
  const first = trackArrivals(null, [row("a", "working", 1), row("b", "unseen", 1)], {});
  assert.deepEqual(first.arrived, []);
  const next = trackArrivals(first.state, [row("a", "unseen", 5), row("b", "unseen", 1), row("c", "needs", 5)], {});
  assert.deepEqual(
    next.arrived.map((r) => r.id),
    ["a"],
  ); // c was not seen before; b did not change
  const again = trackArrivals(next.state, [row("a", "unseen", 5)], {});
  assert.deepEqual(again.arrived, []); // once per state change
  const nebula = trackArrivals(first.state, [row("a", "unseen", 5, { kind: "nebula" })], {});
  assert.deepEqual(nebula.arrived, []);
  const cleared = row("a", "unseen", 5);
  assert.deepEqual(trackArrivals(first.state, [cleared], { a: clearKey(cleared) }).arrived, []);
});

test("hop: on its way up for HOP_MS after it began, never for none", () => {
  assert.equal(hopping(1000, 1000 + HOP_MS - 1), true);
  assert.equal(hopping(1000, 1000 + HOP_MS), false);
  assert.equal(hopping(undefined, 5), false);
});

test("away items: what waits and began at or after awayAt, with the agent's line, else the prompt", () => {
  const model = {
    repos: [
      {
        name: "api",
        root: "/r/api",
        rows: [
          row("t1", "unseen", 500, { prompt: "fix the build" }),
          row("t2", "needs", 600),
          row("t3", "unseen", 100), // before awayAt
          row("t4", "unseen", 700, { prompt: "old" }),
        ],
      },
    ],
  };
  const replies = { t2: { key: "needs:600", line: "Which branch?" }, t4: { key: "unseen:1", line: "stale" } };
  const items = awayItems(waitingRows(model, {}), 400, replies);
  assert.deepEqual(
    items.map((i) => [i.id, i.status, i.line]),
    [
      ["t2", "needs", "Which branch?"],
      ["t4", "unseen", "\u203a old"],
      ["t1", "unseen", "\u203a fix the build"],
    ],
  );
  assert.deepEqual(items[0], { id: "t2", root: "/r/api", project: "api", session: "s-t2", status: "needs", since: 600, line: "Which branch?" });
  const many = { repos: [{ name: "x", root: "/x", rows: Array.from({ length: AWAY_MAX + 3 }, (_, i) => row(`m${i}`, "unseen", 900 + i)) }] };
  assert.equal(awayItems(waitingRows(many, {}), 0, {}).length, AWAY_MAX);
});

test("away text: minutes, then hours", () => {
  assert.equal(awayText(14 * 60000), "14 min");
  assert.equal(awayText(60 * 60000), "1 h");
  assert.equal(awayText(65 * 60000), "1 h 5 min");
});

test("a finish rings only if it came after you last had its project in front", async () => {
  const { projectAlerts } = await import("../mods/nebula/lib/alerts.js");
  const r = { id: "a", kind: "agent", status: "unseen", changedAt: 1000, stateSince: 1000, archived: false, exited: false };
  assert.ok(projectAlerts([r], {}, 2000, 0).ring > 0);
  assert.equal(projectAlerts([r], {}, 2000, 1500).ring, 0, "visited after it finished: no check");
  assert.ok(projectAlerts([r], {}, 2000, 500).ring > 0, "visited before it finished: still a check");
});
