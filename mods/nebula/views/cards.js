import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { listItems } from "../lib/viewmodel.js";
import { NO_MATCH } from "../lib/arrange.js";
import { ALL } from "../lib/tabs.js";
import { rowDot, badge, drawItem, entering, metaLine, nudged, portLinks, title, ageColor } from "./row.js";
import { rowLook } from "../lib/rowstyle.js";
import { clampLines, subSummary } from "../lib/prompt.js";
import { fs, rh } from "../lib/scale.js";

export const items = (model, b) =>
  listItems(model, {
    all: b.tab === ALL,
    empty: b.filter ? NO_MATCH : undefined,
    bands: b.filter ? new Set() : b.bandsFolded,
    folded: b.filter ? new Set() : b.folded,
  });

// Every card is the same size, whatever it holds (the user asked for even cards): a fixed height worked out from the
// text scale, never from content. Top to bottom: the title line (dot, title, age), the meta line (agent icon, model,
// ports), the body (at most BODY_LINES lines, always room for all of them) and the sub-agents' one-line summary.
// Shorter content leaves blank space inside the card.
const BODY_LINES = 2,
  LINE = 1.4,
  PAD = 8,
  GAP = 2,
  TITLE_H = 18,
  META_H = 16,
  SUBS_H = 14;
const bodyLine = () => Math.ceil(fs(11) * LINE);
export const cardHeight = () => 2 * (PAD + 1) + rh(TITLE_H) + rh(META_H) + BODY_LINES * bodyLine() + rh(SUBS_H) + 3 * GAP;

// How many characters of the body fit a line of a card on a board `width` px wide: two cards a row, with their
// padding and the gap between them. An estimate (11 px text is about 0.55 em a character); each line also truncates.
export const bodyChars = (width) => Math.max(12, Math.floor(((width - 16 - 6) / 2 - 2 * (PAD + 1)) / (fs(11) * 0.55)));

// A card's body: what the agent said (a row that needs you or finished unseen, once read), else its last prompt as
// "› prompt". Cut to BODY_LINES lines; GPUI has no line clamp, so each line is its own truncating line in a box of fixed height.
function bodyBlock(row, t, width) {
  const text = row.said || (row.prompt ? `› ${row.prompt}` : "");
  return v_flex()
    .min_w(0)
    .h(BODY_LINES * bodyLine())
    .flex_none()
    .overflow_hidden()
    .text_size(fs(11))
    .line_height(LINE)
    .text_color(t.muted)
    .children((text ? clampLines(text, bodyChars(width ?? 560), BODY_LINES).split("\n") : []).map((l) => div().min_w(0).truncate().child(l)));
}

function card(row, t, selected, click, menu, pinned, openPort, enter, width) {
  const meta = metaLine(row, t, 11, selected),
    ports = portLinks(row, t, openPort),
    look = rowLook(row),
    subs = subSummary(row.subs);
  return entering(nudged(v_flex(), row), enter, `card-${row.id}`)
    .id(`card-${row.id}`)
    .flex_1()
    .min_w(0)
    .h(cardHeight())
    .gap(GAP)
    .p(PAD)
    .overflow_hidden()
    .rounded(8)
    .border_1()
    .cursor_pointer()
    .border_color(selected || pinned ? t.accent : row.status === "needs" ? t.ansi1 : t.border)
    .bg(selected ? t.selected : t.raised)
    .when(Boolean(row.prompt), (el) => el.tooltip(row.prompt))
    .on_click((_e, cx) => click(row.id, cx))
    .on_mouse_down("right", (e, cx) => menu(row.id, e, cx))
    .child(
      h_flex()
        .h(rh(TITLE_H))
        .flex_none()
        .gap(6)
        .items_center()
        .child(rowDot(row, t))
        .child(
          div()
            .flex_1()
            .min_w(0)
            .flex()
            .child(title(row, t, look).text_size(fs(13))),
        )
        .when(Boolean(row.badge), (el) => el.child(badge(row.badge, t)))
        .child(
          div()
            .flex_none()
            .text_size(fs(11))
            .text_color(ageColor(look, t, t.muted))
            .when(look.ageTone === "needs", (el) => el.font_semibold())
            .child(pinned && look.ageTone !== "needs" ? "pinned" : look.ageText),
        ),
    )
    .child(
      h_flex()
        .h(rh(META_H))
        .flex_none()
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
        .when(Boolean(ports), (el) => el.child(ports)),
    )
    .child(bodyBlock(row, t, width))
    .child(
      div()
        .h(rh(SUBS_H))
        .flex_none()
        .min_w(0)
        .truncate()
        .text_size(fs(11))
        .text_color(t.muted)
        .when(Boolean(subs), (el) => el.child(subs)),
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
          .children(
            pair.map((it) => card(it.row, t, b.cursor === it.key, b.click, b.menu, b.pinned === it.row.id, b.openPort, b.enters?.get(it.row.id), b.width)),
          )
          .when(pair.length === 1, (el) => el.child(div().flex_1())),
      );
    }
    run = [];
  };
  for (const it of b.items) {
    if (it.type === "session") run.push(it);
    else if (it.type !== "sub") {
      flush();
      out.push(drawItem(it, t, { cursor: b.cursor, click: b.click, menu: b.menu, pinned: b.pinned, viewing: b.viewing, enters: b.enters }));
    }
  }
  flush();
  return v_flex().id("board-cards").size_full().px(8).py(6).overflow_y_scrollbar().children(out);
}
