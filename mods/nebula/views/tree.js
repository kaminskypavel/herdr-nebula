import { treeItems, listItems } from "../lib/viewmodel.js";
import { NO_MATCH } from "../lib/arrange.js";
import { ALL } from "../lib/tabs.js";
import { virtualList } from "./list.js";

// All: projects, their worktrees and sessions. A project tab: its worktrees only, since the header above already
// names the project (the 2026-11-22 session-rows pick, B).
export const items = (model, b) =>
  b.tab === ALL
    ? treeItems(model, b.filter ? new Set() : b.folded, b.filter ? NO_MATCH : undefined, b.filter ? new Set() : b.bandsFolded)
    : listItems(model, { empty: b.filter ? NO_MATCH : undefined, bands: b.filter ? new Set() : b.bandsFolded });

export const body = (b, t) => virtualList(b, b.items, t, b.tab === ALL);
