// What waits on you: agents that need you or finished unseen, minus the ones you cleared with `e` on the board.
// One rule for the board's Up next card, its status line, ⌘], the icon bar's counts and rings, the welcome-back
// card and the macOS notification, so they always agree. Pure; no herdr imports, so node can test it.
//
// A row here is the board's (lib/viewmodel.js): { id, kind, status, archived, exited, changedAt, stateSince }.
// cleared: the shared "nebula.cleared" map { [row id]: clearKey(row) }. A cleared row comes back when it changes
// state (its key moves on), so clearing never hides a new question.

// How long a finish rings its project's icon.
export const RING_MS = 10 * 60 * 1000;
// How long the window must be in the background before coming back shows the welcome-back card.
export const AWAY_MS = 60 * 1000;

// The key that clearing stores: the state and when the tab entered it (Herdr's tab change time, the same in
// every mod; the board's own note would differ between the board and the icon bar).
export const clearKey = (row) => `${row.status}:${row.changedAt || 0}`;
export const isCleared = (cleared, row) => Boolean(cleared) && cleared[row.id] === clearKey(row);

/** The cleared map after clearing `rows`, keeping only ids still in `liveIds` (so it never grows without end). */
export function clearRows(cleared, rows, liveIds) {
  const keep = liveIds ? new Set(liveIds) : null;
  const next = Object.fromEntries(Object.entries(cleared ?? {}).filter(([id]) => !keep || keep.has(id)));
  for (const r of rows) next[r.id] = clearKey(r);
  return next;
}

const live = (r) => r.kind !== "nebula" && !r.archived && !r.exited;

/** Whether a row waits on you: live, needs you or finished unseen, and not cleared. */
export const waits = (row, cleared) => live(row) && (row.status === "needs" || row.status === "unseen") && !isCleared(cleared, row);

/**
 * Everything waiting across a model's projects, the Up next order: needs you first, then finished, newest first
 * within each (stable on ties). -> [{ row, project, root }].
 */
export function waitingRows(model, cleared) {
  const hits = [];
  for (const repo of model.repos) for (const row of repo.rows) if (waits(row, cleared)) hits.push({ row, project: repo.name, root: repo.root });
  const when = ({ row }) => row.changedAt || row.stateSince || 0;
  const rank = ({ row }) => (row.status === "needs" ? 0 : 1);
  return hits.sort((a, b) => rank(a) - rank(b) || when(b) - when(a));
}

/** Whether a waiting finish still rings its project's icon: finished unseen less than RING_MS ago. */
export const ringing = (row, now) => row.status === "unseen" && (row.changedAt || row.stateSince) > 0 && now - (row.changedAt || row.stateSince) < RING_MS;
