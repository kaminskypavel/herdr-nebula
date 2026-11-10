import test from "node:test";
import assert from "node:assert/strict";
import { SLEEP_CHOICES, SLEEP_DEFAULT, sleepLabel, trackIdle, sleepVerdict, sleepDue, sleepAgent } from "../mods/nebula/lib/sleep.js";
import { mergeSettings } from "../mods/nebula/lib/settings.js";

const MIN = 60000;
const NOW = 10_000_000_000;
const row = (id, extra = {}) => ({ id, address: id, status: "seen", exited: false, session: `claude:s-${id}`, subs: [], changedAt: 0, ...extra });
const due = (rows, o = {}) => sleepDue(rows, { minutes: 15, now: NOW, since: Object.fromEntries(rows.map((r) => [r.id, NOW - 20 * MIN])), ...o });

// Mirrors nebula-core/src/config.rs session_idle_timeout_parses_and_falls_back: the choices,
// off, and a malformed value falling back to the default rather than to off.
test("the sleep setting offers off, 5, 15, 30 and 60 minutes, default 15", () => {
  assert.deepEqual(SLEEP_CHOICES, [0, 5, 15, 30, 60]);
  assert.equal(SLEEP_DEFAULT, 15);
  assert.equal(mergeSettings({}).sleepAfter, 15);
  for (const m of SLEEP_CHOICES) assert.equal(mergeSettings({ sleepAfter: m }).sleepAfter, m);
  assert.equal(mergeSettings({ sleepAfter: 0 }).sleepAfter, 0);
  assert.deepEqual(SLEEP_CHOICES.map(sleepLabel), ["Off", "5 min", "15 min", "30 min", "60 min"]);
});

test("a malformed sleep setting falls back to the default, not to off", () => {
  for (const bad of ["soon", "15", 7, -5, 1.5, null, NaN, [], {}]) assert.equal(mergeSettings({ sleepAfter: bad }).sleepAfter, 15, String(bad));
});

// Mirrors registry.rs idle_reaping_preserves_used_agents_until_they_can_resume: the same table
// of who is kept, with nebula's Running / NeedsFeedback / no id spared.
test("only a done, seen agent with a resumable id is put to sleep", () => {
  const rows = [
    row("resumable"),
    row("missing", { session: null }),
    row("working", { status: "working" }),
    row("needs", { status: "needs" }),
    row("unseen", { status: "unseen" }),
    row("exited", { status: "exited", exited: true }),
    row("subagents", { subs: [{ key: "x" }] }),
    row("nebula", { kind: "nebula", address: null }),
  ];
  assert.deepEqual(due(rows), ["resumable"]);
});

test("hooks recovering makes the same conversation safe to sleep", () => {
  const before = row("a", { session: null });
  assert.deepEqual(due([before]), []);
  assert.deepEqual(due([{ ...before, session: "claude:recovered" }]), ["a"]);
});

test("an agent in view or pinned is never due, whatever its age", () => {
  const rows = [row("a"), row("b"), row("c")];
  assert.deepEqual(due(rows, { inView: new Set(["a"]), pinned: "b" }), ["c"]);
});

// nebula: `if age < timeout { continue }`, so exactly the timeout is reaped.
test("the clock is the setting: just under is spared, exactly at it is due", () => {
  const rows = [row("a")];
  assert.deepEqual(sleepDue(rows, { minutes: 15, now: NOW, since: { a: NOW - 15 * MIN + 1 } }), []);
  assert.deepEqual(sleepDue(rows, { minutes: 15, now: NOW, since: { a: NOW - 15 * MIN } }), ["a"]);
  assert.deepEqual(sleepDue(rows, { minutes: 5, now: NOW, since: { a: NOW - 6 * MIN } }), ["a"]);
  assert.deepEqual(sleepDue(rows, { minutes: 60, now: NOW, since: { a: NOW - 59 * MIN } }), []);
});

test("off sleeps nothing", () => {
  assert.deepEqual(due([row("a")], { minutes: 0 }), []);
  assert.deepEqual(due([row("a")], { minutes: undefined }), []);
});

test("the later of the status change and the out-of-view stamp starts the clock", () => {
  const a = row("a", { changedAt: NOW - 3 * MIN });
  assert.deepEqual(sleepDue([a], { minutes: 15, now: NOW, since: { a: NOW - 60 * MIN } }), []);
  const b = row("b", { changedAt: NOW - 60 * MIN });
  assert.deepEqual(sleepDue([b], { minutes: 15, now: NOW, since: { b: NOW - 3 * MIN } }), []);
  assert.deepEqual(sleepDue([b], { minutes: 15, now: NOW, since: { b: NOW - 30 * MIN } }), ["b"]);
});

test("a row nobody has tracked yet starts aging now", () => {
  assert.deepEqual(sleepDue([row("a", { changedAt: NOW - 60 * MIN })], { minutes: 15, now: NOW }), []);
});

// nebula: in-view sessions get their stamps refreshed instead, so the full timeout starts only
// when the user leaves.
test("tracking: first sight starts now, a status change restarts, being in view restarts", () => {
  let s = trackIdle(new Map(), [{ id: "a", status: "seen" }], new Set(), NOW);
  assert.equal(s.since.a, NOW);
  s = trackIdle(s.state, [{ id: "a", status: "seen" }], new Set(), NOW + 5 * MIN);
  assert.equal(s.since.a, NOW, "out of view and unchanged keeps its stamp");
  s = trackIdle(s.state, [{ id: "a", status: "seen" }], new Set(["a"]), NOW + 6 * MIN);
  assert.equal(s.since.a, NOW + 6 * MIN, "in view restamps");
  s = trackIdle(s.state, [{ id: "a", status: "seen" }], new Set(), NOW + 9 * MIN);
  assert.equal(s.since.a, NOW + 6 * MIN, "the timeout starts when the user left");
  s = trackIdle(s.state, [{ id: "a", status: "working" }], new Set(), NOW + 10 * MIN);
  assert.equal(s.since.a, NOW + 10 * MIN, "a status change restamps");
  s = trackIdle(s.state, [], new Set(), NOW + 11 * MIN);
  assert.equal(s.state.size, 0, "a gone row is forgotten");
});

test("the manual sleep says why it cannot", () => {
  assert.equal(sleepVerdict(row("a")), null);
  assert.equal(sleepVerdict(row("a", { status: "unseen" })), null);
  assert.match(sleepVerdict(row("a", { session: null })), /No session id yet/);
  assert.match(sleepVerdict(row("a", { status: "working" })), /still working/);
  assert.match(sleepVerdict(row("a", { status: "needs" })), /needs you/i);
  assert.match(sleepVerdict(row("a", { subs: [{}] })), /still working/);
  assert.match(sleepVerdict(row("a", { exited: true })), /Already stopped. Enter resumes/);
  assert.match(sleepVerdict(row("a", { exited: true, session: null })), /^Already stopped\.$/);
  assert.match(sleepVerdict(row("a", { kind: "nebula", address: null })), /Only agents running in Herdr/);
});

function io(script) {
  const calls = [];
  const state = { exited: false, ticks: 0 };
  return {
    calls,
    state,
    exited: () => state.exited,
    send: async (t) => {
      calls.push(["send", t]);
      if (script.exitOn === "send") state.exited = true;
    },
    keys: async (...k) => {
      calls.push(["keys", ...k]);
      if (script.exitOn === "keys") state.exited = true;
    },
    mark: async () => calls.push(["mark"]),
    wait: async () => {
      state.ticks++;
      if (script.exitAfterTicks && state.ticks >= script.exitAfterTicks) state.exited = true;
    },
  };
}

test("sleeping types the CLI's own exit, marks once it left and never presses keys", async () => {
  const o = io({ exitOn: "send" });
  assert.equal(await sleepAgent(o), "asleep");
  assert.deepEqual(o.calls, [["send", "/exit"], ["mark"]]);
});

test("a CLI that ignores /exit gets ctrl+c twice, then is marked", async () => {
  const o = io({ exitOn: "keys" });
  assert.equal(await sleepAgent(o), "asleep");
  assert.deepEqual(o.calls, [["send", "/exit"], ["keys", "ctrl+c", "ctrl+c"], ["mark"]]);
});

test("a slow exit within the grace is not interrupted", async () => {
  const o = io({ exitAfterTicks: 3 });
  assert.equal(await sleepAgent(o), "asleep");
  assert.deepEqual(o.calls, [["send", "/exit"], ["mark"]]);
});

test("a CLI that will not leave is reported stuck and not marked", async () => {
  const o = io({});
  assert.equal(await sleepAgent(o), "stuck");
  assert.deepEqual(o.calls, [
    ["send", "/exit"],
    ["keys", "ctrl+c", "ctrl+c"],
  ]);
});

test("an agent that already left is not typed at", async () => {
  const o = io({});
  o.state.exited = true;
  assert.equal(await sleepAgent(o), "gone");
  assert.deepEqual(o.calls, []);
});
