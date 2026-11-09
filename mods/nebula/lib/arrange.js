// What the board shows of its model: the filter and the sort. Pure; no herdr imports.
// buildBoard (lib/viewmodel.js) makes the model, `arrange` returns a copy of it with
// the filter applied and the chosen order, and tags it with `sort` and `filter` so
// columnsModel and projectColumns follow the same sort.
import { STATUS_ORDER, tally } from "./status.js";

export const SORTS = ["status", "name"];
export const SORT_TITLE = { status: "Status", name: "Name" };

export const NO_MATCH = "No matches";

export const cleanSort = (v) => (SORTS.includes(v) ? v : "status");

// Where a row sits in its band: live rows, then archived ones, then nebula's own.
export const rowGroup = (r) => (r.kind === "nebula" ? 2 : r.archived ? 1 : 0);

const fold = (s) => String(s ?? "").toLowerCase();

// Case-insensitive, stable on ties (Array.prototype.sort is stable).
export const byName = (get) => (a, b) => fold(get(a)).localeCompare(fold(get(b)));

// Index in STATUS_ORDER of the most urgent status among the rows; all grey (exited,
// nebula) or no rows sorts last.
const urgency = (rows) => {
  const i = STATUS_ORDER.findIndex((s) => rows.some((r) => r.status === s));
  return i < 0 ? STATUS_ORDER.length : i;
};

// Filter: a project whose name matches keeps everything. Otherwise a session stays when
// its title, or its worktree's label or branch, matches; bands and projects left empty hide.
// Sort "status": sessions as buildBoard ordered them (needs you ... grey last), projects by
// their most urgent status. Sort "name": projects, worktrees and sessions alphabetical.
export function arrange(model, { filter = "", sort = "status" } = {}) {
  const q = fold(filter).trim(), has = (s) => fold(s).includes(q), byTitle = byName((r) => r.title);
  const repos = [];
  for (const repo of model.repos) {
    const whole = !q || has(repo.name);
    let bands = [];
    for (const b of repo.bands) {
      const all = whole || has(b.label) || has(b.branch);
      const rows = all ? b.rows : b.rows.filter((r) => has(r.title));
      if (rows.length || !q) bands.push({ ...b, rows: sort === "name" ? [...rows].sort((a, b) => rowGroup(a) - rowGroup(b) || byTitle(a, b)) : rows });
    }
    if (q && !whole && !bands.length) continue;
    if (sort === "name") bands = [...bands].sort(byName((b) => b.label));
    const rows = bands.flatMap((b) => b.rows);
    repos.push({ ...repo, bands, rows, counts: tally(rows.map((r) => r.status)) });
  }
  repos.sort(sort === "name" ? byName((r) => r.name) : (a, b) => urgency(a.rows) - urgency(b.rows));
  return { ...model, repos, sort, filter: q };
}
