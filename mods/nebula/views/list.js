// The virtual list Tree draws its rows in (a List view drew the same rows and was dropped on 2026-11-25).
import { v_flex, v_virtual_list, Scrollbar } from "gpui-base";
import { itemHeight, drawItem } from "./row.js";

export function virtualList(b, list, t, deep) {
  return (
    v_flex()
      .relative()
      .size_full()
      // Where the press landed, from the right edge: on_item_click names only the row, so the board
      // tells a click on a port cell from one on the row with it (lib/ports.js portAt).
      .on_mouse_down("left", (e) => {
        b.listDown = e.local_position && e.bounds ? { at: Date.now(), fromRight: e.bounds.width - e.local_position.x, fromLeft: e.local_position.x } : null;
      })
      .child(
        v_virtual_list(
          "board-list",
          list.length,
          list.map((i) => itemHeight(i, b)),
          (n) => list[n].key,
          (range) => {
            b.range = range;
            return list
              .slice(range.start, range.end)
              .map((i) => drawItem(i, t, { cursor: b.cursor, deep, pinned: b.pinned, promptLine: b.promptLine, viewing: b.viewing, enters: b.enters }));
          },
        )
          .size_full()
          .px(8)
          .py(6)
          .track_scroll(b.scroll)
          .on_item_click((key, cx) => b.click(key, cx))
          .on_item_secondary_click((key, e, cx) => b.menu(key, e, cx)),
      )
      .child(Scrollbar.vertical("board-list").absolute().inset_0())
  );
}
