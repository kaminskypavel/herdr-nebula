// Sleeping idle agents to free their memory. A sleeping agent is one whose CLI was asked to
// exit: its terminal stays, as a shell in the same folder, marked nebula.asleep, and a resume
// (lib/resume.js) brings the conversation back. Eligibility mirrors nebula's idle reaper
// (nebula-daemon registry/sessions.rs reap_idle_sessions_after): the clock starts when the user
// stops looking, agents that are working, waiting on you or have no resumable id are spared.
// Pure apart from sleepAgent, whose effects come in through `io`. No herdr imports.
import { EXIT_TEXT, EXIT_KEYS } from "./resume.js";

// Minutes; 0 is off. Settings offers exactly these (lib/settings.js).
export const SLEEP_CHOICES = [0, 5, 15, 30, 60];
export const SLEEP_DEFAULT = 15;
export const SWEEP_MS = 60000;
export const TRACK_MS = 5000;
// How long the CLI gets to leave after its own exit command, and again after ctrl+c.
export const EXIT_GRACE_MS = 4000;
const POLL_MS = 500;

export const sleepLabel = (m) => (m > 0 ? `${m} min` : "Off");

/**
 * Remembers since when each row has been in its status and out of view. `state` is the
 * previous call's Map (empty the first time); `rows` are { id, status }; `inView` a Set of ids
 * the user can see now (the active tab's terminals, the pinned one). A row in view, or whose
 * status just changed, restarts at `now`: the idle clock starts when the user leaves, and a
 * row first seen starts aging now (nebula: "a missing stamp starts aging now").
 * -> { state, since } where `since` is { [id]: ms }.
 */
export function trackIdle(state, rows, inView, now) {
  const next = new Map(),
    since = {};
  for (const r of rows) {
    const prev = state.get(r.id);
    const at = prev && prev.status === r.status && !inView.has(r.id) ? prev.since : now;
    next.set(r.id, { status: r.status, since: at });
    since[r.id] = at;
  }
  return { state: next, since };
}

/**
 * Why this row cannot sleep, or null when it can (the manual `z`; the sweep adds the idle
 * and view tests). A row without a session id has nothing to resume, which is what nebula
 * spares ("missing hooks must not turn an idle timeout into a new conversation").
 */
export function sleepVerdict(row) {
  if (!row?.address || row.kind === "nebula") return "Only agents running in Herdr can sleep.";
  if (row.exited) return row.session ? "Already stopped. Enter resumes it." : "Already stopped.";
  if (!row.session) return "No session id yet. Send a prompt first: only a conversation that can be resumed may sleep.";
  if (row.status === "needs") return "It needs you. Answer it first.";
  if (row.status === "working" || row.subs?.length) return "It is still working. Let it finish first.";
  return null;
}

/**
 * The ids the sweep puts to sleep: agents that are done and seen (not working, not needing
 * you, not unseen), resumable, not in view and not pinned, idle for `minutes` since the later
 * of their last status change (`changedAt`) and `since[id]` (lib/sleep.js trackIdle).
 * `minutes` 0 turns it off.
 */
export function sleepDue(rows, { minutes, now, inView = new Set(), pinned = null, since = {} }) {
  if (!(minutes > 0)) return [];
  return rows
    .filter((r) => {
      if (r.status !== "seen" || sleepVerdict(r) || inView.has(r.id) || r.id === pinned) return false;
      const from = Math.max(r.changedAt || 0, since[r.id] ?? now);
      return now - from >= minutes * 60000;
    })
    .map((r) => r.id);
}

/**
 * Stops the CLI and keeps the shell: types its own exit command, and if it is still running
 * after the grace, presses ctrl+c twice and waits again. `io`: { exited() -> bool (fresh),
 * send(text), keys(...names), mark(), wait(ms) }. Marks only once the CLI has left. -> "asleep" |
 * "gone" (it had left already, nothing typed) | "stuck" (still running, nothing marked).
 */
export async function sleepAgent(io) {
  if (io.exited()) return "gone";
  const left = async () => {
    for (let t = 0; t < EXIT_GRACE_MS; t += POLL_MS) {
      await io.wait(POLL_MS);
      if (io.exited()) return true;
    }
    return false;
  };
  await io.send(EXIT_TEXT);
  if (!(await left())) {
    await io.keys(...EXIT_KEYS);
    if (!(await left())) return "stuck";
  }
  await io.mark();
  return "asleep";
}
