import test from "node:test";
import assert from "node:assert/strict";
import { clearKey, isCleared, clearRows, waits, waitingRows, ringing, RING_MS } from "../mods/nebula/lib/waiting.js";

const row = (id, status, changedAt, extra = {}) => ({ id, kind: "agent", status, changedAt, stateSince: changedAt, archived: false, exited: false, ...extra });

test("Up next: needs you first, then finished, newest first; cleared, seen, archived and nebula rows stay out", () => {
  const model = {
    repos: [
      { name: "api", root: "/r/api", rows: [row("t1", "unseen", 100), row("t2", "needs", 50), row("t3", "seen", 300)] },
      {
        name: "web",
        root: "/r/web",
        rows: [row("t4", "unseen", 200), row("t5", "needs", 80), row("t6", "unseen", 400, { archived: true }), row("t7", "unseen", 500, { kind: "nebula" })],
      },
    ],
  };
  assert.deepEqual(
    waitingRows(model, {}).map((x) => x.row.id),
    ["t5", "t2", "t4", "t1"],
  );
  assert.deepEqual(
    waitingRows(model, { t5: clearKey(model.repos[1].rows[1]) }).map((x) => x.row.id),
    ["t2", "t4", "t1"],
  );
  assert.equal(waitingRows(model, {})[0].project, "web");
});

test("a cleared row comes back when it changes state", () => {
  const r = row("t1", "unseen", 100);
  const cleared = clearRows({}, [r]);
  assert.equal(isCleared(cleared, r), true);
  assert.equal(waits(r, cleared), false);
  assert.equal(waits({ ...r, status: "needs", changedAt: 150 }, cleared), true);
  assert.equal(waits({ ...r, changedAt: 160 }, cleared), true);
});

test("clearing drops ids that are gone, so the map never grows without end", () => {
  assert.deepEqual(Object.keys(clearRows({ old: "unseen:1", t2: "needs:5" }, [row("t1", "unseen", 9)], ["t1", "t2"])).sort(), ["t1", "t2"]);
});

test("a finish rings its project for RING_MS, then stops; needs you never rings", () => {
  assert.equal(ringing(row("t1", "unseen", 1000), 1000 + RING_MS - 1), true);
  assert.equal(ringing(row("t1", "unseen", 1000), 1000 + RING_MS), false);
  assert.equal(ringing(row("t1", "needs", 1000), 1001), false);
  assert.equal(ringing(row("t1", "unseen", 0), 5), false);
});
