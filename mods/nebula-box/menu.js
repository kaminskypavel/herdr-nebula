// The right-click menu on a session row, a pointer popup: the row actions with their keys.
// props: { id (the session), archived, tab, launch (it has a launch label to repeat), exited, session
// (its conversation id is known: it can resume), ports (it listens on: each gets an Open item) }.
// A choice goes to the board through the shared value nebula.rowAction ({ id, action, n }),
// so the board does the work in one place whether a key or the menu asked.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, setShared, theme } from "herdr";
import { ROW_ACTION } from "./lib/shared.js";
import { actionsFor } from "./lib/actions.js";
import { fs } from "./lib/scale.js";

export class Menu {
  init(cx) {
    this.at = 0;
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  items() {
    const p = props() ?? {};
    return actionsFor(
      { kind: p.kind, archived: Boolean(p.archived), tab: p.tab ?? null, address: p.id, exited: Boolean(p.exited), session: p.session ?? null, ports: p.ports },
      Boolean(p.launch),
    );
  }

  choose(i) {
    const it = this.items()[i],
      p = props() ?? {};
    closeOverlay(p.overlay);
    if (it && p.id) setShared(ROW_ACTION, { id: p.id, action: it.id, n: Date.now() });
  }

  render() {
    const t = theme(),
      list = this.items();
    return v_flex()
      .id("row-menu")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .p(5)
      .bg(t.popover)
      .text_size(fs(13))
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % list.length;
        else if (e.key === "up") this.at = (this.at + list.length - 1) % list.length;
        else if (e.key === "enter") this.choose(this.at);
        else if (e.key === "escape") closeOverlay(props()?.overlay);
        else return;
        cx.notify();
      })
      .children(
        list.map((a, i) =>
          v_flex()
            .when(Boolean(a.sep), (el) => el.child(div().mx(7).my(4).h(1).bg(t.border)))
            .child(
              h_flex()
                .id(`row-menu-${a.id}`)
                .h(31)
                .px(8)
                .gap(9)
                .rounded(7)
                .items_center()
                .cursor_pointer()
                .text_color(a.danger ? t.blocked : t.foreground)
                .when(i === this.at, (el) => el.bg(t.selected))
                .hover((s) => s.bg(t.hover))
                .on_click(() => this.choose(i))
                .child(div().flex_1().child(a.label))
                .child(div().flex_none().text_size(fs(11)).text_color(t.muted).child(a.key)),
            ),
        ),
      );
  }
}
