import test from "node:test";
import assert from "node:assert/strict";
import { FRESH_MS, NUDGE_MS, POP_MS, freshState, trackStates, pulseOf, nudging, popping } from "../mods/nebula/lib/attention.js";

// Mirrors nebula's a_fresh_unread_finish_keeps_the_sweep_ticking_for_a_few_seconds
// (crates/nebula-tui/src/event_loop/tests/mod.rs) and app::fresh_done.
const NOW = 1_000_000;

test("a state that just began is fresh for a few seconds and then holds still", () => {
  for (const status of ["unseen", "needs", "working"]) {
    assert.equal(freshState(status, false, NOW, NOW), true, `${status}: the dot pulses`);
    assert.equal(freshState(status, false, NOW - 1000, NOW), true);
    assert.equal(freshState(status, false, NOW - FRESH_MS, NOW), false, `${status}: settled`);
    assert.equal(freshState(status, false, NOW - 3_600_000, NOW), false, `${status}: an hour in is still`);
  }
  assert.equal(freshState("seen", false, NOW, NOW), false, "read: over");
});

test("an unstamped state, an archived one and a state that never pulses are never fresh", () => {
  assert.equal(freshState("unseen", false, 0, NOW), false, "never stamped");
  assert.equal(freshState("needs", false, undefined, NOW), false);
  assert.equal(freshState("unseen", true, NOW, NOW), false, "archived: out of sight");
  for (const status of ["seen", "exited", null]) assert.equal(freshState(status, false, NOW, NOW), false, String(status));
});

test("a clock a little ahead still pulses, one an hour ahead does not pulse for an hour", () => {
  assert.equal(freshState("needs", false, NOW + 2000, NOW), true, "small skew");
  assert.equal(freshState("needs", false, NOW + 3_600_000, NOW), false, "large skew");
});

// Mirrors sweep_ramp_gates_on_live_statuses_a_fresh_finish_and_the_setting.
test("no dot pulses unless it is fresh; then needs-you, working and an unseen finish do, the rest are still", () => {
  for (const status of ["needs", "working", "unseen", "seen", "exited", null, undefined]) {
    assert.equal(pulseOf(status), null, `${status}: a settled dot holds still`);
    assert.equal(pulseOf(status, false), null);
  }
  for (const status of ["needs", "working", "unseen"]) assert.ok(pulseOf(status, true), status);
  for (const status of ["seen", "exited", null, undefined]) assert.equal(pulseOf(status, true), null, String(status));
});

test("needs-you pulses louder than working: a deeper dip, and quicker", () => {
  const needs = pulseOf("needs", true),
    working = pulseOf("working", true);
  assert.ok(needs.from < working.from);
  assert.ok(needs.period < working.period);
  for (const p of [needs, working, pulseOf("unseen", true)]) {
    assert.ok(p.from >= 0 && p.from < p.to && p.to <= 1);
    assert.ok(p.period >= 100, "the host needs a period of at least 100 ms");
  }
});

const rows = (...pairs) => pairs.map(([id, status]) => ({ id, status }));

test("a row seen entering a state is stamped; one already in it at first sight is not", () => {
  const first = trackStates(new Map(), rows(["a", "unseen"], ["b", "working"]), 100);
  assert.deepEqual(first.at, {}, "got there before we looked: not fresh");
  const next = trackStates(first.state, rows(["a", "unseen"], ["b", "unseen"], ["c", "needs"]), 200);
  assert.deepEqual(next.at, { b: 200 }, "c is new to the list, so it is a first sight");
  const later = trackStates(next.state, rows(["a", "needs"], ["b", "unseen"], ["c", "needs"]), 300);
  assert.deepEqual(later.at, { a: 300, b: 200 }, "a started needing you; c was already there");
});

test("the stamp stays while the row stays in the state, and goes when it leaves it", () => {
  let u = trackStates(new Map(), rows(["a", "working"]), 100);
  u = trackStates(u.state, rows(["a", "unseen"]), 200);
  u = trackStates(u.state, rows(["a", "unseen"]), 900);
  assert.deepEqual(u.at, { a: 200 });
  u = trackStates(u.state, rows(["a", "seen"]), 1000);
  assert.deepEqual(u.at, {});
  u = trackStates(u.state, rows(["a", "unseen"]), 1100);
  assert.deepEqual(u.at, { a: 1100 }, "finishing again is a new finish");
  u = trackStates(u.state, rows(["a", "needs"]), 1200);
  assert.deepEqual(u.at, { a: 1200 }, "needing you is a new state");
});

test("a row that is gone is forgotten, so it is a first sight when it returns", () => {
  let u = trackStates(new Map(), rows(["a", "working"]), 100);
  u = trackStates(u.state, rows(), 200);
  u = trackStates(u.state, rows(["a", "unseen"]), 300);
  assert.deepEqual(u.at, {});
});

test("a row nudges only in the first moments after it began needing you", () => {
  const row = (over) => ({ status: "needs", stateSince: NOW, ...over });
  assert.equal(nudging(row(), NOW), true);
  assert.equal(nudging(row(), NOW + NUDGE_MS - 1), true);
  assert.equal(nudging(row(), NOW + NUDGE_MS), false, "settled: the bar breathes instead");
  assert.equal(nudging(row({ stateSince: 0 }), NOW), false, "no change time: it was already waiting");
  assert.equal(nudging(row({ stateSince: undefined }), NOW), false);
  for (const status of ["working", "unseen", "seen", "exited"]) assert.equal(nudging(row({ status }), NOW), false, status);
  assert.equal(nudging(row({ archived: true }), NOW), false);
  assert.equal(nudging(row({ exited: true }), NOW), false);
});

test("a done dot is drawn big only for its first moments after the finish", () => {
  const row = (over) => ({ status: "unseen", stateSince: NOW, ...over });
  assert.equal(popping(row(), NOW), true);
  assert.equal(popping(row(), NOW + POP_MS - 1), true);
  assert.equal(popping(row(), NOW + POP_MS), false, "back to size");
  assert.equal(popping(row({ stateSince: 0 }), NOW), false, "finished before we looked");
  for (const status of ["needs", "working", "seen", "exited"]) assert.equal(popping(row({ status }), NOW), false, status);
  assert.equal(popping(row({ archived: true }), NOW), false);
  assert.ok(POP_MS < NUDGE_MS);
});
