import { treeItems } from "../lib/viewmodel.js";
import { virtualList } from "./list.js";

export const items = (model, b) => treeItems(model, b.folded);

export const body = (b, t) => virtualList(b, b.items, t, true);
