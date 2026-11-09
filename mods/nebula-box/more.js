// The +N list of the project tabs, a popup (role "tabs-more", props.roots): the projects that did not fit
// the tab row, each with its icon and status dot, name and session count. Click or Enter selects the
// project (the board then makes it the first tab); Up and Down move; Esc closes.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, theme, shared, setShared } from "herdr";
import { COLOR } from "./lib/status.js";
import { LABEL } from "./lib/viewmodel.js";
import { ICONS, REPO, SUMMARY } from "./lib/shared.js";
import { iconFor } from "./lib/icons.js";
import { projectIcon } from "./lib/icon-view.js";
import { MORE_ROWS_MAX } from "./lib/tablayout.js";

const ROW_H = 30;

export class TabsMore {
  init(cx) {
    this.at = 0;
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  rows() {
    const summary = shared(SUMMARY) ?? [];
    return (props()?.roots ?? []).map((root) => summary.find((p) => p.root === root)).filter(Boolean);
  }

  choose(i) {
    const row = this.rows()[i];
    closeOverlay(props()?.overlay);
    if (row) setShared(REPO, row.root);
  }

  render() {
    const t = theme(), rows = this.rows(), icons = shared(ICONS) ?? {};
    this.at = Math.min(this.at, Math.max(rows.length - 1, 0));
    return v_flex().id("tabs-more").track_focus(this.handle).size_full().p(8).bg(t.popover).text_color(t.foreground)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % rows.length;
        else if (e.key === "up") this.at = (this.at + rows.length - 1) % rows.length;
        else if (e.key === "enter") this.choose(this.at);
        else if (e.key === "escape") closeOverlay(props()?.overlay);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      // A popup sizes to its content, so the list needs a real height (a flex_1 list collapses to 0).
      .child(v_flex().id("more-list").flex_none().h(Math.min(Math.max(rows.length, 1), MORE_ROWS_MAX) * (ROW_H + 1)).gap(1).overflow_y_scrollbar()
        .children(rows.map((p, i) => h_flex().id(`more-${p.root}`).h(ROW_H).flex_none().px(8).gap(9).items_center().rounded(6).cursor_pointer().text_size(13)
          .when(i === this.at, (el) => el.bg(t.selected))
          .when(i !== this.at, (el) => el.hover((s) => s.bg(t.hover)))
          .on_click(() => this.choose(i))
          .child(projectIcon({
            icon: iconFor(icons, p.root, p.name), ring: i === this.at ? t.selected : t.popover,
            badge: div().size(7).rounded_full().bg(t[COLOR[p.status]] ?? t.unknown),
          }))
          .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(p.name))
          .child(div().flex_none().text_size(11).text_color(t.dim).child(p.count ? `${p.count} · ${LABEL[p.status] ?? p.status}` : "")))));
  }
}
