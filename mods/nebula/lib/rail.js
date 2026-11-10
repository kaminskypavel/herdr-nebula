// What the icon bar draws for the project tabs: the open projects in their shared order, each with
// its most urgent status, and which tab is selected. Pure; no herdr imports, so node can test it.
//
// summary: the per-project list ([{ root, name, status, needs }], lib/open.js summarize), open: the open
// roots in tab order, selected: the shared "nebula.repo" value (a root, ALL or nothing).
import { ALL, tabOf } from "./tabs.js";

// -> { all (the All tab is selected), items: [{ root, name, status, on }] }. A root missing from the
// summary is left out. The order is the open list's: picking a project never moves it.
export function railTabs({ summary, open, selected }) {
  const tab = tabOf(open, selected),
    by = new Map(summary.map((p) => [p.root, p]));
  const items = open
    .filter((r) => by.has(r))
    .map((root) => ({ root, name: by.get(root).name, status: by.get(root).status, needs: by.get(root).needs ?? 0, on: root === tab }));
  return { all: tab === ALL, items };
}

// The ⌘ number rule: only the first 9 project tabs have a key (⌘1 to ⌘9). n is the tab's place from 1.
// The digit is always drawn: "show the numbers while ⌘ is held" is not possible, because Herdr reports
// modifier changes (on_modifiers_changed) only on the keyboard focus path, and while you type in an
// agent the terminal has it, so the icon bar never hears ⌘.
// -> { tip (the tooltip: "name  ⌘n", or just the name), num (the digit drawn in the gutter, or null) }.
export const tabHint = (name, n) => (n <= 9 ? { tip: `${name}  \u2318${n}`, num: n } : { tip: name, num: null });

// The count in a tab's red pill: the number of sessions that need you, "9+" past nine.
export const pillText = (n) => (n > 9 ? "9+" : String(n));
