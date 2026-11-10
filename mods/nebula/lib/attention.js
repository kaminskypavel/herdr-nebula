// Motion that means something: a session needing you pulses red, a working one pulses
// gently, and a session that has just finished unseen pulses for a few seconds, then holds
// still ("motion means live, or just changed"; nebula's one-shot sweep, app::fresh_done).
// Pure; no herdr imports, so node can test it.

// How long a fresh unseen finish pulses.
export const FRESH_MS = 5000;

/**
 * Whether a finish `since` ms-epoch is still fresh at `now`. `since` is when the row
 * became unseen (0 or missing: unknown). The window is taken either side of `since`, so a
 * clock a little off pulses a little off-time, never for an hour.
 */
export const freshDone = (status, archived, since, now) => status === "unseen" && !archived && since > 0 && Math.abs(now - since) < FRESH_MS;

/**
 * Remembers when each row turned unseen, for rows whose tab has no change time. `state` is
 * the previous call's state (an empty Map the first time); `rows` are { id, status }.
 * -> { state, at } where `at` is { [id]: ms } for the unseen rows seen to turn unseen. A row
 * unseen at first sight has no time (it finished before we looked, so it is not fresh).
 */
export function trackUnseen(state, rows, now) {
  const next = new Map(),
    at = {};
  for (const r of rows) {
    const prev = state.get(r.id);
    const since = r.status === "unseen" ? (prev?.status === "unseen" ? prev.since : prev ? now : 0) : 0;
    next.set(r.id, { status: r.status, since });
    if (since > 0) at[r.id] = since;
  }
  return { state: next, at };
}

/**
 * The opacity pulse of a status dot, { from, to, period } for `loop("opacity", ...)`, or
 * null for a still one. Needs-you is the loudest, working keeps a subtler pulse, and an
 * unseen finish pulses only while `fresh`.
 */
export function pulseOf(status, fresh = false) {
  if (status === "needs") return { from: 0.25, to: 1, period: 900 };
  if (status === "working") return { from: 0.55, to: 1, period: 1600 };
  if (status === "unseen" && fresh) return { from: 0.3, to: 1, period: 700 };
  return null;
}
