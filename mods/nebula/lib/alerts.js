// What the icon bar says about waiting agents, apart from the window that draws it: each project's red count and
// finish ring, the rows that just started waiting (the bounce and the macOS notification), and the welcome-back
// card's items. All of it reads lib/waiting.js, so the bar, the board and ⌘] agree. Pure; no herdr imports, so
// node can test it.
import { waits, ringing, clearKey, RING_MS } from "./waiting.js";

// The ring dims over its last minute, so it fades out instead of vanishing.
const FADE_MS = 60 * 1000;

/** The ring's opacity for a finish still ringing at `now`: 1, then down to 0.2 over the last minute (steps of 0.1). */
export function ringOpacity(row, now) {
  const left = RING_MS - (now - (row.changedAt || row.stateSince));
  return left >= FADE_MS ? 1 : Math.max(0.2, Math.round((left / FADE_MS) * 10) / 10);
}

/** A project's alerts from its rows: { needs (agents that need you), ring (the ring's opacity, 0 for none) }. */
export function projectAlerts(rows, cleared, now) {
  let needs = 0,
    ring = 0;
  for (const r of rows) {
    if (!waits(r, cleared)) continue;
    if (r.status === "needs") needs++;
    else if (ringing(r, now)) ring = Math.max(ring, ringOpacity(r, now));
  }
  return { needs, ring };
}

/**
 * The rows that began waiting since the last call. `prev` is the last call's state (null the first time, which
 * only takes a look), `rows` the board's rows. A row seen for the first time never counts: it got there before
 * we looked. -> { state, arrived: [row] }.
 */
export function trackArrivals(prev, rows, cleared) {
  const state = new Map(rows.map((r) => [r.id, r.status]));
  const arrived = prev ? rows.filter((r) => prev.has(r.id) && prev.get(r.id) !== r.status && waits(r, cleared)) : [];
  return { state, arrived };
}

// The welcome-back card lists at most this many rows (the dialog's height is fitted to them).
export const AWAY_MAX = 8;

// The line under a row on the card: what the agent last said when that reply is for the state it is in now, else
// its last prompt, else nothing.
function lineOf(row, replies) {
  const r = replies?.[row.id];
  if (r?.line && r.key === clearKey(row)) return r.line;
  return row.prompt ? `› ${row.prompt}` : "";
}

/**
 * The rows for the welcome-back card: what waits (`hits` is lib/waiting.js waitingRows, in its order) and began
 * waiting at or after `awayAt`. -> [{ id, root, project, session, status, since, line }].
 */
export function awayItems(hits, awayAt, replies) {
  return hits
    .filter(({ row }) => (row.changedAt || row.stateSince || 0) >= awayAt)
    .slice(0, AWAY_MAX)
    .map(({ row, project, root }) => ({
      id: row.id,
      root,
      project,
      session: row.title,
      status: row.status,
      since: row.changedAt || row.stateSince || 0,
      line: lineOf(row, replies),
    }));
}

/** How long the user was away, as the card's header says it: "14 min", "1 h 5 min". */
export function awayText(ms) {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 60)} h`;
}
