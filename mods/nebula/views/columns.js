import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { columnsModel, projectItems } from "../lib/viewmodel.js";
import { ball, badge, metaLine, portLinks, title, ageColor } from "./row.js";
import { rowLook } from "../lib/rowstyle.js";
import { fs } from "../lib/scale.js";

export const items = (model, b) =>
  b?.pc
    ? projectItems(b.pc)
    : columnsModel(model)
        .flatMap((c) => c.rows)
        .map((row) => ({ key: row.id, type: "session", row }));

const MODES = [
  { id: "status", title: "By status" },
  { id: "projects", title: "By project" },
];

function mini(row, t, selected, click, menu, pinned, openPort) {
  const ports = portLinks(row, t, openPort);
  return v_flex()
    .id(`mini-${row.id}`)
    .flex_none()
    .gap(1)
    .px(6)
    .py(4)
    .rounded(6)
    .cursor_pointer()
    .when(selected, (el) => el.bg(t.selected))
    .when(!selected, (el) => el.bg(t.raised).hover((s) => s.bg(t.hover)))
    .when(pinned, (el) => el.border_1().border_color(t.accent))
    .when(Boolean(row.prompt), (el) => el.tooltip(row.prompt))
    .on_click((_e, cx) => click(row.id, cx))
    .on_mouse_down("right", (e, cx) => menu(row.id, e, cx))
    .child(
      h_flex()
        .gap(6)
        .items_center()
        .child(title(row, t).text_size(fs(12)))
        .when(Boolean(row.badge), (el) => el.child(badge(row.badge, t))),
    )
    .child(
      h_flex()
        .min_w(0)
        .gap(6)
        .child(
          div()
            .flex_1()
            .min_w(0)
            .truncate()
            .text_size(fs(11))
            .text_color(t.dim)
            .child(pinned ? `${row.where} · pinned` : row.where),
        )
        .when(Boolean(ports), (el) => el.child(ports)),
    );
}

function modeSwitch(b, t) {
  return h_flex()
    .flex_none()
    .px(8)
    .pt(6)
    .child(
      h_flex()
        .border_1()
        .border_color(t.border)
        .rounded(6)
        .p(1)
        .bg(t.background)
        .children(
          MODES.map((m) => {
            const on = m.id === b.colMode;
            return h_flex()
              .id(`columns-mode-${m.id}`)
              .h(22)
              .px(10)
              .items_center()
              .rounded(4)
              .text_size(fs(12))
              .cursor_pointer()
              .text_color(on ? t.foreground : t.muted)
              .when(on, (el) => el.bg(t.selected))
              .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
              .on_mouse_down("left", (_e, cx) => {
                cx.stop_propagation();
                b.handle.focus();
                b.setMode(m.id, cx);
              })
              .child(div().child(m.title));
          }),
        ),
    );
}

function statusBody(b, t) {
  const cols = columnsModel(b.model);
  return v_flex()
    .id("board-columns")
    .flex_1()
    .min_h(0)
    .px(8)
    .py(6)
    .overflow_y_scrollbar()
    .child(
      h_flex()
        .gap(6)
        .items_start()
        .children(
          cols.map((c) =>
            v_flex()
              .flex_1()
              .min_w(0)
              .gap(4)
              .child(
                h_flex()
                  .gap(6)
                  .items_center()
                  .px(2)
                  .pb(4)
                  .text_size(fs(12))
                  .font_semibold()
                  .text_color(t.foreground)
                  .child(ball(c.status, t))
                  .child(div().min_w(0).truncate().child(`${c.title} ${c.rows.length}`)),
              )
              .children(c.rows.map((r) => mini(r, t, b.cursor === r.id, b.click, b.menu, b.pinned === r.id, b.openPort))),
          ),
        ),
    );
}

// A project or a worktree: status ball (its most urgent session), name, session count.
function navRow(id, key, name, status, count, selected, focused, t, click) {
  return h_flex()
    .id(id)
    .flex_none()
    .h(26)
    .items_center()
    .gap(8)
    .px(8)
    .rounded(6)
    .cursor_pointer()
    .text_size(fs(13))
    .when(selected, (el) => el.bg(focused ? t.selected : t.raised))
    .when(!selected, (el) => el.hover((s) => s.bg(t.hover)))
    .on_click((_e, cx) => click(key, cx))
    .child(ball(status, t))
    .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(name))
    .child(div().flex_none().text_size(fs(11)).text_color(t.dim).child(String(count)));
}

// A session: title on the first line, agent icon, model, effort and age under it, so it fits a narrow column.
function sessionRowLine(row, t, selected, focused, click, menu, pinned, openPort) {
  const meta = metaLine(row, t, 11),
    ports = portLinks(row, t, openPort),
    look = rowLook(row);
  return v_flex()
    .id(`pcs-${row.id}`)
    .relative()
    .flex_none()
    .gap(1)
    .px(8)
    .py(4)
    .rounded(6)
    .cursor_pointer()
    .when(selected, (el) => el.bg(focused ? t.selected : t.raised))
    .when(!selected, (el) => el.hover((s) => s.bg(t.hover)))
    .when(pinned, (el) => el.border_1().border_color(t.accent))
    .when(Boolean(row.prompt), (el) => el.tooltip(row.prompt))
    .on_click((_e, cx) => click(row.id, cx))
    .on_mouse_down("right", (e, cx) => menu(row.id, e, cx))
    .when(look.bar === "needs", (el) => el.child(div().absolute().left(0).top(6).bottom(6).w(3).rounded(2).bg(t.ansi1)))
    .child(
      h_flex()
        .gap(8)
        .items_center()
        .child(ball(row.status, t, 8, row.archived, row.fresh))
        .child(title(row, t, look).flex_1().text_size(fs(13)))
        .when(Boolean(row.badge), (el) => el.child(badge(row.badge, t))),
    )
    .child(
      h_flex()
        .pl(16)
        .min_w(0)
        .items_center()
        .gap(5)
        .text_size(fs(11))
        .text_color(t.dim)
        .when(Boolean(meta), (el) => el.child(meta))
        .when(Boolean(meta), (el) => el.child(div().flex_none().child("·")))
        .child(
          div()
            .flex_none()
            .text_color(ageColor(look, t, t.dim))
            .when(look.ageTone === "needs", (el) => el.font_semibold())
            .child(pinned && look.ageTone !== "needs" ? "pinned" : look.ageText),
        )
        .when(Boolean(ports), (el) => el.child(ports)),
    );
}

function column(i, title, rows, empty, focused, t) {
  return v_flex()
    .flex_1()
    .min_w(0)
    .h_full()
    .pl(i ? 6 : 0)
    .pr(6)
    .when(i > 0, (el) => el.border_l(1).border_color(t.border))
    .child(
      div()
        .flex_none()
        .px(8)
        .pb(4)
        .text_size(fs(11))
        .font_semibold()
        .text_color(focused ? t.foreground : t.dim)
        .child(title),
    )
    .child(
      v_flex()
        .id(`pcol-${i}`)
        .flex_1()
        .min_h(0)
        .gap(2)
        .overflow_y_scrollbar()
        .children(rows.length ? rows : [div().px(8).text_size(fs(12)).text_color(t.dim).child(empty)]),
    );
}

// On a project tab the model is that project alone: no PROJECTS column, the other two shift left (col stays 1 and 2).
function projectsBody(b, t) {
  const { pc, col } = b,
    sel = pc.sel,
    at = pc.scoped ? 1 : 0;
  return h_flex()
    .flex_1()
    .min_h(0)
    .px(8)
    .py(6)
    .when(!pc.scoped, (el) =>
      el.child(
        column(
          0,
          "PROJECTS",
          pc.projects.map((p) => navRow(`proj-${p.key}`, `proj:${p.key}`, p.name, p.status, p.count, p.key === sel.project, col === 0, t, b.click)),
          "No projects",
          col === 0,
          t,
        ),
      ),
    )
    .child(
      column(
        1 - at,
        "WORKTREES",
        pc.worktrees.map((w) => navRow(`wt-${w.key}`, `wt:${w.key}`, w.label, w.status, w.count, w.key === sel.worktree, col === 1, t, b.click)),
        "No sessions",
        col === 1,
        t,
      ),
    )
    .child(
      column(
        2 - at,
        "SESSIONS",
        pc.sessions.map((r) => sessionRowLine(r, t, b.cursor === r.id, col === 2, b.click, b.menu, b.pinned === r.id, b.openPort)),
        "No sessions",
        col === 2,
        t,
      ),
    );
}

export const body = (b, t) =>
  v_flex()
    .id("board-columns-root")
    .size_full()
    .child(modeSwitch(b, t))
    .child(b.pc ? projectsBody(b, t) : statusBody(b, t));
