// The project name flashed in the middle of the window when ⌘1 to ⌘9 picks a project (role "hud";
// props: { root, name, n }). A frameless window, so it never takes the keyboard; the rail closes it.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { props, theme, shared } from "herdr";
import { ICONS } from "./lib/shared.js";
import { iconFor } from "./lib/icons.js";
import { projectIcon } from "./lib/icon-view.js";

export class Hud {
  init() {}

  render() {
    const t = theme(), p = props() ?? {};
    return h_flex().id("hud").size_full().px(16).gap(12).items_center().rounded(12).border_1().border_color(t.border)
      .bg(t.popover).shadow_lg().text_color(t.foreground)
      .child(projectIcon({ icon: iconFor(shared(ICONS) ?? {}, p.root, p.name), size: 28 }))
      .child(div().flex_1().min_w(0).truncate().text_size(15).font_semibold().child(p.name ?? ""))
      .child(div().flex_none().text_size(12).text_color(t.dim).child(`⌘${p.n ?? ""}`));
  }
}
