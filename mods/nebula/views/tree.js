import { treeItems } from "../lib/viewmodel.js";
import { NO_MATCH } from "../lib/arrange.js";
import { virtualList } from "./list.js";

export const items = (model, b) => treeItems(model, b.filter ? new Set() : b.folded, b.filter ? NO_MATCH : undefined, b.filter ? new Set() : b.bandsFolded);

export const body = (b, t) => virtualList(b, b.items, t, true);
