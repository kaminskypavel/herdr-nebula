// The open projects: the tabs of the board. Shared "nebula.open" is an ordered array of
// project roots; the project store (nebula.projects) stays the full list. Pure; no herdr
// imports, so node can test it. The board is the one that starts and prunes the list
// (syncOpen); the picker, the add and remove dialogs only edit it.
//
// A "summary" is buildBoard's model reduced to one entry per project:
// [{ root, name, count, needs, status }], status being the most urgent one (viewmodel's rollup)
// and needs the number of Herdr sessions waiting on you.
import { isCleared } from "./waiting.js";
import { OTHER, rollup } from "./viewmodel.js";
import { STATUS_ORDER } from "./status.js";
import { projectList } from "./repos.js";
import { norm } from "./projects.js";

const real = (model) => model.repos.filter((r) => r.root !== OTHER);

export const summarize = (model) =>
  real(model).map((r) => ({
    root: r.root,
    name: r.name,
    count: r.rows.length,
    needs: r.rows.filter((x) => x.kind !== "nebula" && x.status === "needs").length,
    status: rollup(r.rows),
  }));

// The open list cut to roots still in the store (spelled as the store spells them), no repeats.
export function cleanOpen(open, store) {
  const roots = projectList(store).map((p) => p.root),
    out = [];
  for (const o of Array.isArray(open) ? open : []) {
    const hit = roots.find((r) => norm(r) === norm(o));
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}

// First run: the projects with a live Herdr session (not grey, not a nebula row), else the first project.
export function initialOpen(model, store) {
  const live = real(model)
    .filter((r) => r.rows.some((x) => x.kind !== "nebula" && STATUS_ORDER.includes(x.status)))
    .map((r) => r.root);
  const listed = cleanOpen(live, store);
  return listed.length
    ? listed
    : projectList(store)
        .slice(0, 1)
        .map((p) => p.root);
}

const needing = (model) =>
  real(model).flatMap((r) => r.rows.filter((x) => x.kind !== "nebula" && x.status === "needs").map((x) => ({ root: r.root, id: x.id })));

// Whether a closed project has an agent that needs you and was not cleared with e (lib/waiting.js), for the + dot.
export const closedNeeding = (model, open, cleared = {}) =>
  real(model).some((r) => !open.includes(r.root) && r.rows.some((x) => x.kind !== "nebula" && x.status === "needs" && !isCleared(cleared, x)));

// The open list for this moment. open: the stored value (undefined on first run); seen: the
// ids that needed you at the last call (null at the first call). A session that newly needs
// you in a closed project opens it as a tab; one that was already waiting when the tab was
// closed does not, so closing stays closed. -> { open, seen, changed }; open is null while
// there is no project to open.
export function syncOpen(open, model, store, seen = null) {
  let list = Array.isArray(open) ? cleanOpen(open, store) : null;
  if (list === null) {
    if (!projectList(store).length) return { open: null, seen: null, changed: false };
    list = initialOpen(model, store);
  }
  const now = needing(model);
  if (seen) for (const n of now) if (!seen.has(n.id) && !list.includes(n.root)) list = [n.root, ...list];
  const changed = !Array.isArray(open) || JSON.stringify(open) !== JSON.stringify(list);
  return { open: list, seen: new Set(now.map((n) => n.id)), changed };
}

// The list as it stands, for the dialogs that edit it (never null).
export const currentOpen = (open, model, store) => syncOpen(open, model, store).open ?? [];

// A newly opened project goes first, so it is on top of the icon bar.
export const openProject = (open, root) => (open.includes(root) ? open : [root, ...open]);

// Closing a tab: -> { open, select }. select is the root to show when the closed tab was
// the selected one (its right neighbor, else its left), else null.
export function closeProject(open, root, selected) {
  const i = open.indexOf(root);
  if (i < 0) return { open, select: null };
  const next = open.filter((r) => r !== root);
  return { open: next, select: selected === root ? (next[i] ?? next[i - 1] ?? null) : null };
}

// The board's model cut to the open projects, in tab order, plus the Other group of stray sessions.
export function onlyOpen(model, open) {
  const byRoot = new Map(model.repos.map((r) => [r.root, r]));
  return { ...model, repos: [...open.map((r) => byRoot.get(r)).filter(Boolean), ...model.repos.filter((r) => r.root === OTHER)] };
}

// The picker's rows: every project that matches the query, with whether it is open.
export function pickerRows(summary, open, query = "") {
  const q = String(query).trim().toLowerCase();
  return summary.filter((p) => !q || p.name.toLowerCase().includes(q) || p.root.toLowerCase().includes(q)).map((p) => ({ ...p, open: open.includes(p.root) }));
}

// The picker's count column: "1 session", "5 sessions", nothing for none.
export const sessionsLabel = (n) => (n ? `${n} session${n === 1 ? "" : "s"}` : "");

const PICKER_ROW = 30;
export const PICKER_ROWS_MAX = 9;
// Popup height for a picker over n projects: search field, the rows (up to PICKER_ROWS_MAX), the add row.
export const pickerHeight = (n) => 18 + 40 + Math.min(Math.max(n, 1), PICKER_ROWS_MAX) * PICKER_ROW + 40;
