import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, theme, keys, window, exec } from "herdr";
import { groupShortcuts } from "./lib/settings.js";
import { escapeKey } from "./ui.js";

const REPO_URL = "https://github.com/kaminskypavel/herdr-nebula";

export class Help {
  init(cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(300, () => this.handle.focus());
  }

  render() {
    const t = theme(),
      groups = groupShortcuts(keys(), window()?.platform === "macos");
    const column = (n) =>
      v_flex()
        .flex_1()
        .min_w(0)
        .gap(1)
        .children(
          groups
            .filter((g) => g.col === n)
            .map((g) =>
              v_flex()
                .gap(1)
                .pb(6)
                .child(div().px(8).pt(6).pb(2).text_size(11.5).font_semibold().text_color(t.accent).child(g.group))
                .children(
                  g.rows.map((r) =>
                    h_flex()
                      .px(8)
                      .h(24)
                      .gap(10)
                      .items_center()
                      .child(div().flex_none().font_semibold().text_size(12.5).text_color(t.foreground).child(r.keys))
                      .child(div().flex_1())
                      .child(div().min_w(0).truncate().text_size(12).text_color(t.muted).child(r.text)),
                  ),
                ),
            ),
        );
    return v_flex()
      .id("help")
      .track_focus(this.handle)
      .on_key_down((e, cx) => escapeKey(e, cx, props()?.overlay))
      .size_full()
      .p(16)
      .gap(8)
      .bg(t.popover)
      .text_color(t.foreground)
      .text_size(13)
      .child(div().font_semibold().text_size(15).child("Shortcuts"))
      .child(h_flex().flex_1().min_h(0).gap(16).items_start().child(column(0)).child(column(1)))
      .child(
        h_flex()
          .items_center()
          .gap(12)
          .pt(8)
          .border_t(1)
          .border_color(t.border)
          .child(div().flex_1().text_size(11.5).text_color(t.dim).child("Esc close"))
          .child(
            h_flex()
              .id("repo-link")
              .h(28)
              .px(10)
              .gap(8)
              .items_center()
              .rounded(7)
              .border_1()
              .border_color(t.input)
              .cursor_pointer()
              .text_size(12)
              .text_color(t.muted)
              .hover((st) => st.bg(t.hover).text_color(t.foreground))
              .tooltip(REPO_URL)
              .on_click((_e, cx) => {
                cx.spawn(async () => {
                  await exec("open", [REPO_URL]).catch(() => null);
                });
              })
              .child(svg("icons/gh.svg").size(14).flex_none())
              .child(div().child("kaminskypavel/herdr-nebula"))
              .child(div().w(1).h(14).bg(t.border))
              .child(svg("mods/nebula/icons/star.svg").size(13).flex_none().text_color(t.working))
              .child(div().child("Star")),
          ),
      );
  }
}
