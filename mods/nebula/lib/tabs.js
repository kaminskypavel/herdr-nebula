// The tab rule: the selected tab scopes every view. All shows every open project (and the
// Other group of stray sessions, only there); a project tab shows that project alone. Pure;
// no herdr imports, so node can test it.
//
// `model` is the board's model cut to the open projects (onlyOpen in lib/open.js), `open` the
// open roots in tab order and `selected` the shared "nebula.repo" value: a root, ALL or nothing.
import { OTHER, bandPaths } from "./viewmodel.js";
import { ALL } from "./shared.js";

export { ALL };

// The tab to show: the selected root while it is open, else All (also on first run).
export const tabOf = (open, selected) => (open.includes(selected) ? selected : ALL);

// The model for a tab: all of it on All, else just that project (none when it is not in the model).
export const scopeModel = (model, tab) => (tab === ALL ? model : { ...model, repos: model.repos.filter((r) => r.root === tab) });

// The tab a digit key picks: 0 is All, 1 to 9 the open projects in order, anything else null.
export const tabKey = (open, key) => (key === "0" ? ALL : /^[1-9]$/.test(key) ? open[Number(key) - 1] ?? null : null);

// Where showing a session of project `root` (OTHER for a stray one) takes the board, from
// tab `tab`: { tab, open }. A project tab moves to the session's project, an Other session
// moves to All, All stays; `open` says the project is closed and must be opened first.
export function landOn(tab, open, root) {
  const stray = root === OTHER;
  return { tab: stray || tab === ALL ? ALL : root, open: !stray && !open.includes(root) };
}

const rowsOf = (model) => model.repos.flatMap((r) => r.rows);

// Whether the board follows the focused terminal. `terminal` is the focused one (null when a mod pane or
// nothing is), `last` the last one seen. Only a change of terminal counts, and not while the board has
// the keys (then `last` stays, so the change is still seen once the keys leave). -> { last, id }:
// id is the session to show (a Herdr terminal the board knows), else null.
export function followFocus({ terminal, last, boardKeys, model }) {
  if (!terminal || terminal === last || boardKeys) return { last, id: null };
  const known = rowsOf(model).some((r) => r.id === terminal && r.kind !== "nebula");
  return { last: terminal, id: known ? terminal : null };
}

// Collapse all / Expand all for what is shown. All folds the project headers; a project tab folds
// its bands. Expanding also opens every band. -> { folded, bands } (new Sets).
export function foldAllState({ folded, bands }, repos, fold, tab) {
  const roots = repos.map((r) => r.root), paths = repos.flatMap(bandPaths);
  const set = (from, items, on) => { const out = new Set(from); for (const i of items) on ? out.add(i) : out.delete(i); return out; };
  if (tab === ALL) return { folded: set(folded, roots, fold), bands: fold ? new Set(bands) : set(bands, paths, false) };
  return { folded: fold ? new Set(folded) : set(folded, roots, false), bands: set(bands, paths, fold) };
}
