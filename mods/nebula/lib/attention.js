// Motion that means something: a status dot pulses only for a few seconds after its state changed (a session
// started needing you, started working, or finished unseen), then holds still ("motion means just changed";
// nebula's one-shot sweep, app::fresh_done). A forever-pulsing dot taught the eye to ignore it. Pure; no herdr
// imports, so node can test it.

// How long a dot pulses after its state changed.
export const FRESH_MS = 5000;

// The states that pulse when they are new.
const PULSING = new Set(["needs", "working", "unseen"]);

/**
 * Whether a state that began `since` ms-epoch is still fresh at `now`: needs you, working or an unseen finish
 * (anything else never pulses). `since` is when the row entered its state (0 or missing: unknown, so not fresh).
 * The window is taken either side of `since`, so a clock a little off pulses a little off-time, never for an hour.
 */
export const freshState = (status, archived, since, now) => PULSING.has(status) && !archived && since > 0 && Math.abs(now - since) < FRESH_MS;

/**
 * Remembers when each row entered its state, for rows whose tab has no change time. `state` is the previous
 * call's state (an empty Map the first time); `rows` are { id, status }.
 * -> { state, at } where `at` is { [id]: ms } for the needs-you, working and unseen rows seen to enter that state.
 * A row in a state at first sight has no time (it got there before we looked, so it is not fresh).
 */
export function trackStates(state, rows, now) {
  const next = new Map(),
    at = {};
  for (const r of rows) {
    const prev = state.get(r.id);
    const since = PULSING.has(r.status) ? (prev?.status === r.status ? prev.since : prev ? now : 0) : 0;
    next.set(r.id, { status: r.status, since });
    if (since > 0) at[r.id] = since;
  }
  return { state: next, at };
}

/**
 * The opacity pulse of a status dot, { from, to, period } for `loop("opacity", ...)`, or null for a still one.
 * Only a `fresh` dot pulses (lib/attention.js freshState): needs-you the loudest, working the gentlest.
 */
export function pulseOf(status, fresh = false) {
  if (!fresh) return null;
  if (status === "needs") return { from: 0.25, to: 1, period: 900 };
  if (status === "working") return { from: 0.55, to: 1, period: 1600 };
  if (status === "unseen") return { from: 0.3, to: 1, period: 700 };
  return null;
}

// The first moments after a row's state changed: a row that needs you nudges sideways once, a fresh unseen finish
// pops its dot once. Both read the row's stateSince (the tab's change time, else the board's note, lib/viewmodel.js).
export const NUDGE_MS = 700;
export const POP_MS = 250;
const within = (since, now, ms) => since > 0 && Math.abs(now - since) < ms;
const live = (row) => !row.archived && !row.exited;

/** Whether a row that needs you is still in its first NUDGE_MS (`since` is when it began needing you). */
export const nudging = (row, now) => row.status === "needs" && live(row) && within(row.stateSince, now, NUDGE_MS);

/** Whether a row that finished unseen is still in its first POP_MS, when its dot is drawn big. */
export const popping = (row, now) => row.status === "unseen" && live(row) && within(row.stateSince, now, POP_MS);
