// The General workspace (Settings › Board, experimental): a tab for questions and research that belong to no
// project. Its sessions share one hidden folder herdr-nebula makes, ~/.config/herdr-nebula/general, so they run
// somewhere and Claude keeps one memory for them. While the setting is on, General is a project on the list,
// open and first among the pins; off, it leaves all three. Pure; no herdr imports.
import { addProject, removeProject, taken } from "./repos.js";

export const GENERAL_DIR = ".config/herdr-nebula/general";
export const GENERAL_NAME = "General";
export const GENERAL_ICON = "mods/nebula/icons/message-circle.svg";
export const generalRoot = (home) => `${home}/${GENERAL_DIR}`;
export const isGeneral = (root) => String(root ?? "").endsWith(`/${GENERAL_DIR}`);

/** -> { store, open, pinned } that put General on or take it off, or null when it is already as `on` asks. */
export function generalStep({ on, root, store, open, pinned }) {
  const has = taken(store, root),
    without = (list) => (list ?? []).filter((r) => r !== root);
  if (on && !has) return { store: addProject(store, root, { name: GENERAL_NAME }), open: [root, ...without(open)], pinned: [root, ...without(pinned)] };
  if (!on && has) return { store: removeProject(store, root), open: without(open), pinned: without(pinned) };
  return null;
}
