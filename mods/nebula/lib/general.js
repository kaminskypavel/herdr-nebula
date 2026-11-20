// The General workspace (Settings › General, experimental): a tab for questions and research that belong to no
// project. Its sessions share one folder: by default a hidden one herdr-nebula makes, ~/.config/herdr-nebula/general,
// or the folder picked in Settings. While the setting is on, General is a project on the list (marked general: true),
// open and first among the pins; off, it leaves all three; a new folder moves it. Pure; no herdr imports.
import { addProject, removeProject, projectList } from "./repos.js";
import { norm } from "./projects.js";

export const GENERAL_DIR = ".config/herdr-nebula/general";
export const GENERAL_NAME = "General";
export const GENERAL_ICON = "mods/nebula/icons/message-circle.svg";
export const generalRoot = (home) => `${home}/${GENERAL_DIR}`;
export const isGeneral = (root) => String(root ?? "").endsWith(`/${GENERAL_DIR}`);

/** The folder General runs in: the one picked in Settings (`dir`), else the hidden default. */
export const generalFolder = (home, dir) => (dir ? norm(dir) : generalRoot(home));

const marked = (p) => p.general === true || isGeneral(p.root);

/**
 * -> { store, open, pinned } that make General match the setting (on, in folder `root`), or null when it already does.
 * Off, or a General left in another folder, leaves the list, the open tabs and the pins.
 */
export function generalStep({ on, root, store, open, pinned }) {
  const list = projectList(store),
    here = (r) => norm(r) === norm(root),
    drop = list.filter((p) => marked(p) && (!on || !here(p.root))).map((p) => p.root),
    add = on && !list.some((p) => marked(p) && here(p.root));
  if (!drop.length && !add) return null;
  let next = store;
  for (const r of drop) next = removeProject(next, r);
  if (add) {
    next = addProject(next, root, { name: GENERAL_NAME });
    next = { ...next, list: projectList(next).map((p) => (here(p.root) ? { ...p, name: GENERAL_NAME, general: true } : p)) };
  }
  const keep = (l) => (l ?? []).filter((r) => !drop.includes(r) && !here(r));
  return { store: next, open: on ? [norm(root), ...keep(open)] : keep(open), pinned: on ? [norm(root), ...keep(pinned)] : keep(pinned) };
}
