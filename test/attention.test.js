import test from "node:test";
import assert from "node:assert/strict";
import { FRESH_MS, freshDone, trackUnseen, pulseOf } from "../mods/nebula/lib/attention.js";

// Mirrors nebula's a_fresh_unread_finish_keeps_the_sweep_ticking_for_a_few_seconds
// (crates/nebula-tui/src/event_loop/tests/mod.rs) and app::fresh_done.
const NOW = 1_000_000;

test("an unseen finish is fresh for a few seconds and then holds still", () => {
  assert.equal(freshDone("unseen", false, NOW, NOW), true, "the row pulses");
  assert.equal(freshDone("unseen", false, NOW - 1000, NOW), true);
  assert.equal(freshDone("seen", false, NOW, NOW), false, "read: over");
  assert.equal(freshDone("unseen", false, NOW - FRESH_MS, NOW), false, "settled: an old unread finish is still");
});

test("an unstamped finish, an archived one and a row that is not a finish are never fresh", () => {
  assert.equal(freshDone("unseen", false, 0, NOW), false, "never stamped");
  assert.equal(freshDone("unseen", false, undefined, NOW), false);
  assert.equal(freshDone("unseen", true, NOW, NOW), false, "archived: out of sight");
  for (const status of ["needs", "working", "seen", "exited"]) assert.equal(freshDone(status, false, NOW, NOW), false, status);
});

test("a clock a little ahead still pulses, one an hour ahead does not pulse for an hour", () => {
  assert.equal(freshDone("unseen", false, NOW + 2000, NOW), true, "small skew");
  assert.equal(freshDone("unseen", false, NOW + 3_600_000, NOW), false, "large skew");
});

// Mirrors sweep_ramp_gates_on_live_statuses_a_fresh_finish_and_the_setting.
test("needs-you and working pulse whatever fresh says; an unseen finish only while fresh; the rest are still", () => {
  for (const fresh of [false, true]) {
    assert.ok(pulseOf("needs", fresh));
    assert.ok(pulseOf("working", fresh));
    for (const status of ["seen", "exited", null, undefined]) assert.equal(pulseOf(status, fresh), null, String(status));
  }
  assert.equal(pulseOf("unseen", false), null, "an old finish holds still");
  assert.ok(pulseOf("unseen", true), "just finished, unseen: the pulse");
  assert.equal(pulseOf("unseen"), null);
});

test("needs-you pulses louder than working: a deeper dip, and quicker", () => {
  const needs = pulseOf("needs"),
    working = pulseOf("working");
  assert.ok(needs.from < working.from);
  assert.ok(needs.period < working.period);
  for (const p of [needs, working, pulseOf("unseen", true)]) {
    assert.ok(p.from >= 0 && p.from < p.to && p.to <= 1);
    assert.ok(p.period >= 100, "the host needs a period of at least 100 ms");
  }
});

const rows = (...pairs) => pairs.map(([id, status]) => ({ id, status }));

test("a row seen turning unseen is stamped; one unseen at first sight is not", () => {
  const first = trackUnseen(new Map(), rows(["a", "unseen"], ["b", "working"]), 100);
  assert.deepEqual(first.at, {}, "finished before we looked: not fresh");
  const next = trackUnseen(first.state, rows(["a", "unseen"], ["b", "unseen"]), 200);
  assert.deepEqual(next.at, { b: 200 });
});

test("the stamp stays while the row stays unseen, and goes when it is read", () => {
  let u = trackUnseen(new Map(), rows(["a", "working"]), 100);
  u = trackUnseen(u.state, rows(["a", "unseen"]), 200);
  u = trackUnseen(u.state, rows(["a", "unseen"]), 900);
  assert.deepEqual(u.at, { a: 200 });
  u = trackUnseen(u.state, rows(["a", "seen"]), 1000);
  assert.deepEqual(u.at, {});
  u = trackUnseen(u.state, rows(["a", "unseen"]), 1100);
  assert.deepEqual(u.at, { a: 1100 }, "finishing again is a new finish");
});

test("a row that is gone is forgotten, so it is a first sight when it returns", () => {
  let u = trackUnseen(new Map(), rows(["a", "working"]), 100);
  u = trackUnseen(u.state, rows(), 200);
  u = trackUnseen(u.state, rows(["a", "unseen"]), 300);
  assert.deepEqual(u.at, {});
});
