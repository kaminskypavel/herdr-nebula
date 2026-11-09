import { v_flex, v_virtual_list, Scrollbar } from "gpui-base";
import { listItems } from "../lib/viewmodel.js";
import { NO_MATCH } from "../lib/arrange.js";
import { HEIGHT, drawItem } from "./row.js";

export const items = (model, b) => listItems(model, b.root, b.filter ? NO_MATCH : undefined, b.filter ? new Set() : b.bandsFolded);

export function virtualList(b, list, t, deep) {
  return v_flex().relative().size_full()
    .child(v_virtual_list("board-list", list.length, list.map((i) => HEIGHT[i.type]), (n) => list[n].key,
      (range) => {
        b.range = range;
        return list.slice(range.start, range.end).map((i) => drawItem(i, t, { cursor: b.cursor, deep, pinned: b.pinned }));
      })
      .size_full().px(8).py(6).track_scroll(b.scroll).on_item_click((key, cx) => b.click(key, cx))
      .on_item_secondary_click((key, e, cx) => b.menu(key, e, cx)))
    .child(Scrollbar.vertical("board-list").absolute().inset_0());
}

export const body = (b, t) => virtualList(b, b.items, t, false);
