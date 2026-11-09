// The projects picker, a popup (role "projects"): every project in the store with its session
// count and most urgent status, a check on the open ones. Click or Enter opens a closed
// project (it becomes the selected tab and the picker closes) or closes an open one (the
// picker stays). The last row opens the add dialog. Typing filters, up and down move.
// It reads the live sessions the way the board does (buildBoard over the project list), and
// edits the shared open list (lib/open.js).
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { props, closeOverlay, openOverlay, theme, shared, setShared, terminals, agents, panes, spaces } from "herdr";
import { STORE, reposWith } from "./lib/repos.js";
import { buildBoard } from "./lib/viewmodel.js";
import { COLOR } from "./lib/status.js";
import { OPEN, REPO, SUMMARY, ICONS } from "./lib/shared.js";
import { iconFor } from "./lib/icons.js";
import { projectIcon } from "./lib/icon-view.js";
import { summarize, currentOpen, openProject, closeProject, pickerRows, sessionsLabel, PICKER_ROWS_MAX } from "./lib/open.js";
import { escapeKey } from "./ui.js";
import { fs } from "./lib/scale.js";

const ROW_H = 30;
const SEARCH = "mods/nebula/icons/search.svg";
const CHECK = "mods/workspace-chrome/check.svg";

export class Projects {
  init(cx) {
    this.handle = cx.focus_handle();
    this.at = 0;
    this.top = 0;
    this.focusIn = true;
    this.field = InputState.new({ value: "", placeholder: "Search projects" });
    this.field.on("change", (_e, cx) => {
      this.at = 0;
      this.top = 0;
      cx.notify();
    });
    this.field.on("submit", (_e, cx) => this.choose(this.at, cx));
    this.field.on("focus", (_e, cx) => {
      this.focusIn = true;
      cx.notify();
    });
    this.field.on("blur", (_e, cx) => {
      this.focusIn = false;
      cx.notify();
    });
    this.field.focus();
    cx.timer.after(300, () => this.field.focus());
  }

  data() {
    const store = shared(STORE) ?? {};
    const model = buildBoard({ terminals: terminals(), agents: agents(), panes: panes(), spaces: spaces(), repos: reposWith(store, {}) });
    const open = currentOpen(shared(OPEN), model, store);
    const summary = shared(SUMMARY) ?? summarize(model);
    return { open, rows: pickerRows(summary, open, this.field.value()) };
  }

  // Rows 0 to n-1 are projects; -1 is "Add a project", pinned above them.
  choose(i, cx) {
    const { open, rows } = this.data();
    const row = rows[i];
    if (!row) {
      this.add();
      return;
    }
    if (row.open) {
      const shown = open.includes(shared(REPO)) ? shared(REPO) : null; // All (or nothing) is shown when no project tab is selected
      const r = closeProject(open, row.root, shown);
      setShared(OPEN, r.open);
      if (r.select) setShared(REPO, r.select);
      cx.notify();
    } else {
      setShared(OPEN, openProject(open, row.root));
      setShared(REPO, row.root);
      closeOverlay(props()?.overlay);
    }
  }

  // Closes the picker first, as the settings overlay does before it opens another.
  add() {
    closeOverlay(props()?.overlay);
    openOverlay({ mod: "nebula-box", kind: "dialog", modal: true, width: 460, height: 240, props: { role: "add" } });
  }

  move(d, cx) {
    const n = this.data().rows.length + 1;
    this.at = ((this.at + 1 + d + n) % n) - 1;
    if (this.at >= 0 && this.at < this.top) this.top = this.at;
    if (this.at >= this.top + PICKER_ROWS_MAX) this.top = this.at - PICKER_ROWS_MAX + 1;
    cx.notify();
  }

  key(e, cx) {
    if (escapeKey(e, cx, props()?.overlay)) return;
    if (e.key === "down") this.move(1, cx);
    else if (e.key === "up") this.move(-1, cx);
    else return;
    cx.stop_propagation();
  }

  line(t, id, i, children, action) {
    const on = i === this.at;
    return h_flex()
      .id(id)
      .h(ROW_H)
      .flex_none()
      .px(8)
      .gap(8)
      .items_center()
      .rounded(6)
      .cursor_pointer()
      .text_size(fs(13))
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click((_e, cx) => {
        this.at = i;
        action(cx);
      })
      .children(children);
  }

  render() {
    const t = theme(),
      { rows } = this.data(),
      icons = shared(ICONS) ?? {};
    this.at = Math.min(this.at, rows.length - 1);
    const add = this.line(
      t,
      "pk-add",
      -1,
      [
        svg("mods/nebula/icons/plus.svg").size(13).flex_none().text_color(t.muted),
        div().flex_1().min_w(0).truncate().text_color(t.muted).child("Add a project..."),
      ],
      () => this.add(),
    );
    const all = [
      ...rows.map((p, i) =>
        this.line(
          t,
          `pk-${p.root}`,
          i,
          [
            projectIcon({
              icon: iconFor(icons, p.root, p.name),
              ring: i === this.at ? t.selected : t.popover,
              badge: div()
                .size(7)
                .rounded_full()
                .bg(t[COLOR[p.status]] ?? t.unknown),
            }),
            div().flex_1().min_w(0).truncate().text_color(t.foreground).child(p.name),
            div().flex_none().text_size(fs(11)).text_color(t.dim).child(sessionsLabel(p.count)),
            p.open ? svg(CHECK).size(12).flex_none().text_color(t.accent) : div().w(12).flex_none(),
          ],
          (cx) => this.choose(i, cx),
        ),
      ),
    ];
    return (
      v_flex()
        .id("projects")
        .track_focus(this.handle)
        .on_key_down((e, cx) => this.key(e, cx))
        .size_full()
        .p(8)
        .gap(6)
        .bg(t.popover)
        .text_color(t.foreground)
        .child(
          h_flex()
            .h(32)
            .flex_none()
            .px(10)
            .gap(8)
            .items_center()
            .rounded(6)
            .border_1()
            .border_color(this.focusIn ? t.accent : t.input)
            .bg(t.background)
            .child(svg(SEARCH).size(13).flex_none().text_color(t.dim))
            .child(Input.new(this.field).flex_1().min_w(0).h_full().text_size(fs(12.5)).text_color(t.foreground)),
        )
        .child(add)
        // A popup sizes to its content, so the list needs a real height (a flex_1 list collapses to 0).
        .child(
          v_flex()
            .id("pk-list")
            .flex_none()
            .h(Math.min(all.length, PICKER_ROWS_MAX) * (ROW_H + 1))
            .gap(1)
            .overflow_y_scrollbar()
            .children(all),
        )
    );
  }
}
