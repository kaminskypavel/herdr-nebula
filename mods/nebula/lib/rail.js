// What the icon bar draws for the project tabs: the open projects in their shared order, each with
// its most urgent status, and which tab is selected. Pure; no herdr imports, so node can test it.
//
// summary: the per-project list ([{ root, name, status }], lib/open.js summarize), open: the open
// roots in tab order, selected: the shared "nebula.repo" value (a root, ALL or nothing).
import { ALL, tabOf } from "./tabs.js";

// -> { all (the All tab is selected), items: [{ root, name, status, on }] }. A root missing from the
// summary is left out. The order is the open list's: picking a project never moves it.
export function railTabs({ summary, open, selected }) {
  const tab = tabOf(open, selected), by = new Map(summary.map((p) => [p.root, p]));
  const items = open.filter((r) => by.has(r)).map((root) => ({ root, name: by.get(root).name, status: by.get(root).status, on: root === tab }));
  return { all: tab === ALL, items };
}

