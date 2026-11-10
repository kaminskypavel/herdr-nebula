// The jump palette (role "jump", a dialog): every live session of every project, open or closed,
// as `project / title` with its status dot and age. With no text it lists in attention order
// (lib/jump.js); typing fuzzy-filters. Enter lands on the agent: the project's tab is selected
// (the board opens a closed project) and the agent gets the keys. The first Esc clears the
// query, the second closes. Opened by `/` on the board and by cmd-J anywhere.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { props, closeOverlay, theme, shared, setShared, run, terminals, agents, panes, spaces } from "herdr";
import { STORE, reposWith } from "./lib/repos.js";
import { buildBoard } from "./lib/viewmodel.js";
import { COLOR } from "./lib/status.js";
import { GOTO } from "./lib/shared.js";
import { REFOCUS_MS } from "./lib/focus.js";
import { jumpRows, rankJump, windowTop, JUMP_ROWS, JUMP_ROW_H, JUMP_FIELD_H } from "./lib/jump.js";
import { focusCommand } from "./lib/preview.js";
import { fs, rh } from "./lib/scale.js";

const SEARCH = "mods/nebula/icons/search.svg";

export class Jump {
  init(cx) {
    this.handle = cx.focus_handle();
    this.at = 0;
    this.top = 0;
    this.focusIn = true;
    this.field = InputState.new({ value: "", placeholder: "Jump to an agent" });
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

  // Every project in the store, not only the open ones: the board's model over the full list.
  list() {
    const model = buildBoard({ terminals: terminals(), agents: agents(), panes: panes(), spaces: spaces(), repos: reposWith(shared(STORE) ?? {}, {}) });
    return rankJump(jumpRows(model), this.field.value());
  }

  // Lands on session `i` of the list: the board puts its cursor and tab on it (it opens a closed project), the
  // agent gets the keys. The overlay's own timers end with it, so the refocus asks outlive it ({ owner: null }).
  choose(i, cx) {
    const hit = this.list()[i];
    if (!hit) return;
    const pane = panes().find((p) => p.terminal === hit.id)?.pane ?? null;
    closeOverlay(props()?.overlay);
    setShared(GOTO, { id: hit.id, n: Math.random() });
    const c = focusCommand({ address: hit.id, pane });
    const ask = () => run(c.name, c.args);
    ask();
    for (const ms of REFOCUS_MS) cx.timer.after(ms, ask, { owner: null });
  }

  move(d, cx) {
    const n = this.list().length;
    if (!n) return;
    this.at = (this.at + d + n) % n;
    this.top = windowTop(this.top, this.at);
    cx.notify();
  }

  key(e, cx) {
    if (e.key === "escape") {
      if (this.field.value()) {
        this.field.set_value("");
        this.at = 0;
        this.top = 0;
        cx.notify();
      } else closeOverlay(props()?.overlay);
      cx.stop_propagation();
      return;
    }
    if (e.key === "down") this.move(1, cx);
    else if (e.key === "up") this.move(-1, cx);
    else return;
    cx.stop_propagation();
  }

  line(t, hit, i) {
    const on = i === this.at;
    return h_flex()
      .id(`jp-${hit.id}`)
      .h(rh(JUMP_ROW_H))
      .flex_none()
      .px(10)
      .gap(10)
      .items_center()
      .rounded(6)
      .cursor_pointer()
      .text_size(fs(13))
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click((_e, cx) => this.choose(i, cx))
      .child(
        div()
          .size(8)
          .flex_none()
          .rounded_full()
          .bg(t[COLOR[hit.status]] ?? t.unknown),
      )
      .child(div().flex_none().max_w(200).truncate().text_color(t.muted).child(hit.project))
      .child(div().flex_none().text_color(t.dim).child("/"))
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(hit.title))
      .child(div().flex_none().text_size(fs(11)).text_color(t.muted).child(hit.age));
  }

  render() {
    const t = theme(),
      list = this.list();
    this.at = Math.min(this.at, Math.max(list.length - 1, 0));
    this.top = windowTop(this.top, this.at);
    const shown = list.slice(this.top, this.top + JUMP_ROWS);
    return v_flex()
      .id("jump")
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.key(e, cx))
      .size_full()
      .p(8)
      .gap(6)
      .bg(t.popover)
      .text_color(t.foreground)
      .child(
        h_flex()
          .h(rh(JUMP_FIELD_H))
          .flex_none()
          .px(10)
          .gap(8)
          .items_center()
          .rounded(6)
          .border_1()
          .border_color(this.focusIn ? t.accent : t.input)
          .bg(t.background)
          .child(svg(SEARCH).size(13).flex_none().text_color(t.dim))
          .child(Input.new(this.field).flex_1().min_w(0).h_full().text_size(fs(12)).text_color(t.foreground))
          .child(
            div()
              .flex_none()
              .text_size(fs(11))
              .text_color(t.muted)
              .child(list.length ? `${this.at + 1}/${list.length}` : "Esc"),
          ),
      )
      .child(
        v_flex()
          .id("jp-list")
          .flex_none()
          .h(JUMP_ROWS * (rh(JUMP_ROW_H) + 1))
          .gap(1)
          .overflow_hidden()
          .children(shown.map((hit, n) => this.line(t, hit, this.top + n)))
          .when(!list.length, (el) => el.child(div().p(10).text_size(fs(12)).text_color(t.muted).child("No agents match"))),
      );
  }
}
