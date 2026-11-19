// What the board shows of its model: the filter and the sort. Pure; no herdr imports.
// buildBoard (lib/viewmodel.js) makes the model, `arrange` returns a copy of it with
// the filter applied and the chosen order, and tags it with `sort` and `filter` so
// columnsModel and projectColumns follow the same sort.
import { STATUS_ORDER, tally } from "./status.js";

export const SORTS = ["status", "name", "manual"];
// The sort button's word and its tooltip: Status puts what needs you first, Name is alphabetical, Manual is the
// order ⌥↑ and ⌥↓ made (lib/arrange.js moveRow).
export const SORT_TITLE = { status: "Urgent", name: "A–Z", manual: "Manual" };
export const SORT_TIP = { status: "Sort: urgent first", name: "Sort: by name", manual: "Sort: your order (⌥↑ ⌥↓ move)" };

export const NO_MATCH = "No matches";

export const cleanSort = (v) => (SORTS.includes(v) ? v : "status");

// Where a row sits in its band: live rows, then archived ones, then nebula's own.
// A band's rows in groups, whatever the sort: running, then stopped or asleep, then archived, then nebula's.
export const rowGroup = (r) => (r.kind === "nebula" ? 3 : r.archived ? 2 : r.exited ? 1 : 0);

const fold = (s) => String(s ?? "").toLowerCase();

// Case-insensitive, stable on ties (Array.prototype.sort is stable).
export const byName = (get) => (a, b) => fold(get(a)).localeCompare(fold(get(b)));

// Index in STATUS_ORDER of the most urgent status among the rows; all grey (exited,
// nebula) or no rows sorts last.
const urgency = (rows) => {
  const have = new Set(rows.map((r) => r.status)),
    i = STATUS_ORDER.findIndex((s) => have.has(s));
  return i < 0 ? STATUS_ORDER.length : i;
};

// 0 for a band holding a live session that needs you, else 1: Array.prototype.sort is stable, so equal bands keep their order.
const needsFirst = (band) => (band.rows.some((r) => r.status === "needs" && !r.archived && r.kind !== "nebula") ? 0 : 1);

// Filter: a project whose name matches keeps everything. Otherwise a session stays when
// its title, or its worktree's label or branch, matches; bands and projects left empty hide,
// except an empty band whose own label or branch matches (it is what was looked for).
// Sort "status": sessions as buildBoard ordered them (needs you ... grey last), projects by
// their most urgent status, and inside a project the worktrees with a session that needs you first
// (otherwise in the order they came). Sort "name": projects, worktrees and sessions alphabetical.
export function arrange(model, { filter = "", sort = "status", order = [] } = {}) {
  const q = fold(filter).trim(),
    has = (s) => fold(s).includes(q),
    byTitle = byName((r) => r.title),
    // Manual: the saved order; a session not in it yet keeps its place after the ordered ones (sort is stable).
    at = new Map((Array.isArray(order) ? order : []).map((id, i) => [id, i])),
    byOrder = (a, b) => (at.get(a.id) ?? Infinity) - (at.get(b.id) ?? Infinity) || 0,
    within = sort === "name" ? byTitle : sort === "manual" ? byOrder : null;
  const repos = [];
  for (const repo of model.repos) {
    const whole = !q || has(repo.name);
    let bands = [];
    for (const b of repo.bands) {
      const all = whole || has(b.label) || has(b.branch);
      const rows = all ? b.rows : b.rows.filter((r) => has(r.title));
      if (rows.length || !q || all) bands.push({ ...b, rows: within ? [...rows].sort((a, b) => rowGroup(a) - rowGroup(b) || within(a, b)) : rows });
    }
    if (q && !whole && !bands.length) continue;
    if (sort === "name") bands = [...bands].sort(byName((b) => b.label));
    else if (sort === "status") bands = [...bands].sort((a, b) => needsFirst(a) - needsFirst(b));
    const rows = bands.flatMap((b) => b.rows);
    repos.push({ ...repo, bands, rows, counts: tally(rows.map((r) => r.status)) });
  }
  if (sort === "name") repos.sort(byName((r) => r.name));
  else if (sort === "status") repos.sort((a, b) => urgency(a.rows) - urgency(b.rows));
  return { ...model, repos, sort, filter: q };
}

/**
 * The saved order after moving session `id` one place up (dir -1) or down (dir 1) among its band's rows as shown,
 * staying inside its group (running, stopped, archived). `arranged` is the model as the board shows it. Returns the
 * new order (the band's rows, in their new order, go to the end), or null when the row cannot move that way.
 */
export function moveRow(order, arranged, id, dir) {
  for (const repo of arranged.repos)
    for (const band of repo.bands) {
      const i = band.rows.findIndex((r) => r.id === id);
      if (i < 0) continue;
      const j = i + dir,
        other = band.rows[j];
      if (!other || rowGroup(other) !== rowGroup(band.rows[i])) return null;
      const ids = band.rows.map((r) => r.id);
      [ids[i], ids[j]] = [ids[j], ids[i]];
      const mine = new Set(ids);
      return [...order.filter((x) => !mine.has(x)), ...ids];
    }
  return null;
}
