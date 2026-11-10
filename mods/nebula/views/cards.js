import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { listItems } from "../lib/viewmodel.js";
import { NO_MATCH } from "../lib/arrange.js";
import { ALL } from "../lib/tabs.js";
import { ball, badge, drawItem, metaLine, title } from "./row.js";
import { fs } from "../lib/scale.js";

export const items = (model, b) =>
  listItems(model, {
    all: b.tab === ALL,
    empty: b.filter ? NO_MATCH : undefined,
    bands: b.filter ? new Set() : b.bandsFolded,
    folded: b.filter ? new Set() : b.folded,
  });

// The prompt under a card's title: it wraps and stops at three lines (the clip is the line height times three).
const PROMPT_LINES = 3,
  LINE = 1.4;
const promptBlock = (prompt, t) => {
  const size = fs(11);
  return div()
    .min_w(0)
    .max_h(Math.ceil(size * LINE * PROMPT_LINES))
    .overflow_hidden()
    .text_size(size)
    .line_height(LINE)
    .text_color(t.dim)
    .child(`› ${prompt}`);
};

function card(row, t, selected, click, menu, pinned) {
  const meta = metaLine(row, t, 11);
  return h_flex()
    .id(`card-${row.id}`)
    .flex_1()
    .min_w(0)
    .gap(7)
    .p(8)
    .rounded(8)
    .border_1()
    .cursor_pointer()
    .border_color(selected || pinned ? t.accent : row.status === "needs" ? t.ansi1 : t.border)
    .bg(selected ? t.selected : t.raised)
    .when(Boolean(row.prompt), (el) => el.tooltip(row.prompt))
    .on_click((_e, cx) => click(row.id, cx))
    .on_mouse_down("right", (e, cx) => menu(row.id, e, cx))
    .child(
      div()
        .mt(4)
        .child(ball(row.status, t, 8, row.archived, row.fresh)),
    )
    .child(
      v_flex()
        .flex_1()
        .min_w(0)
        .gap(2)
        .child(
          h_flex()
            .gap(6)
            .items_center()
            .child(title(row, t).text_size(fs(13)))
            .when(Boolean(row.badge), (el) => el.child(badge(row.badge, t))),
        )
        .child(
          h_flex()
            .gap(6)
            .items_center()
            .text_size(fs(11))
            .text_color(t.muted)
            .child(
              div()
                .flex_1()
                .min_w(0)
                .when(Boolean(meta), (el) => el.child(meta)),
            )
            .child(
              div()
                .flex_none()
                .text_color(t.dim)
                .child(pinned ? "pinned" : row.age),
            ),
        )
        .when(Boolean(row.prompt), (el) => el.child(promptBlock(row.prompt, t)))
        .children(
          row.subs.map((s) =>
            h_flex()
              .gap(6)
              .items_center()
              .text_size(fs(11))
              .text_color(t.muted)
              .child(div().flex_none().text_color(t.dim).child("└"))
              .child(div().flex_1().min_w(0).truncate().child(s.text))
              .when(Boolean(s.badge), (el) => el.child(badge(s.badge, t))),
          ),
        ),
    );
}

export function body(b, t) {
  const out = [];
  let run = [];
  const flush = () => {
    for (let i = 0; i < run.length; i += 2) {
      const pair = run.slice(i, i + 2);
      out.push(
        h_flex()
          .gap(6)
          .flex_none()
          .px(0)
          .py(3)
          .items_start()
          .children(pair.map((it) => card(it.row, t, b.cursor === it.key, b.click, b.menu, b.pinned === it.row.id)))
          .when(pair.length === 1, (el) => el.child(div().flex_1())),
      );
    }
    run = [];
  };
  for (const it of b.items) {
    if (it.type === "session") run.push(it);
    else if (it.type !== "sub") {
      flush();
      out.push(drawItem(it, t, { cursor: b.cursor, click: b.click, pinned: b.pinned }));
    }
  }
  flush();
  return v_flex().id("board-cards").size_full().px(8).py(6).overflow_y_scrollbar().children(out);
}
