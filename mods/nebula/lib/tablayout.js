// How the project tabs fit the board's width. Pure; no herdr imports, so node can test it.
// Widths are estimates (13px text is about CHAR px per character), matching board.js's tabRow.
//
// Everything fits: All, then every tab in full (icon, name, x). Else: All, the selected tab in full,
// the other tabs icon-only, then +. Else the icon-only tabs that do not fit fold into a "+N" button.
import { STATUS_ORDER } from "./status.js";

export const CHAR = 7;
export const ICON = 18;
const EDGE = 34 + 10; // the row's left padding (clear of the window buttons) and right padding
const GAP = 2;
const ADD = 26; // the + button
export const ALL_W = 41; // 10 + "All" + 10
export const ICON_TAB = 30; // 6 + icon + 6
const MAX_TAB = 150;

export const fullWidth = (name) => Math.min(MAX_TAB, 10 + ICON + 6 + String(name).length * CHAR + 6 + 16 + 5);
export const foldWidth = (n) => 8 + 8 + 5 + (String(n).length + 1) * CHAR + 8; // padding, dot, gap, "+N"

// tabs: [{ root, name }] in tab order; selected: a root or null (All).
// -> { full: [root] (shown with name and x; in compact modes the selected one), icons: [root], folded: [root] }.
// full + icons are in display order; the selected tab comes first among the projects.
export function fitTabs({ width = Infinity, tabs, selected = null }) {
  const room = width - EDGE - ADD - GAP;
  const need = (widths) => ALL_W + widths.reduce((sum, w) => sum + GAP + w, 0);
  const roots = tabs.map((t) => t.root);
  if (need(tabs.map((t) => fullWidth(t.name))) <= room) return { full: roots, icons: [], folded: [] };
  const sel = tabs.find((t) => t.root === selected);
  const head = sel ? [fullWidth(sel.name)] : [];
  const rest = tabs.filter((t) => t !== sel).map((t) => t.root);
  const full = sel ? [sel.root] : [];
  if (need([...head, ...rest.map(() => ICON_TAB)]) <= room) return { full, icons: rest, folded: [] };
  if (!rest.length) return { full, icons: [], folded: [] };
  let keep = rest.length - 1;
  while (keep > 0 && need([...head, ...rest.slice(0, keep).map(() => ICON_TAB), foldWidth(rest.length - keep)]) > room) keep--;
  return { full, icons: rest.slice(0, keep), folded: rest.slice(keep) };
}

// The most urgent of some statuses: red (needs) over yellow (working) over blue (unseen) over green (seen), else grey.
export const urgent = (statuses) => STATUS_ORDER.find((s) => statuses.includes(s)) ?? "exited";

const ROW = 30;
export const MORE_ROWS_MAX = 9;
// Popup height for the +N list of n projects: padding and an explicit list height (a popup sizes to its content).
export const moreHeight = (n) => 18 + Math.min(Math.max(n, 1), MORE_ROWS_MAX) * (ROW + 1);
