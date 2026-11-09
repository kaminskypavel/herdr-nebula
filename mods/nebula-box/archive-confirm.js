// ArchiveConfirm is the small confirm the board opens for `a` while "ask before
// archiving" is on (role "archive-confirm"; props: { title, tab }).
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, theme, run } from "herdr";
import { tabCommand } from "./lib/actions.js";
import { button, dialogTitle, escapeKey } from "./ui.js";

export class ArchiveConfirm {
  init(cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(300, () => this.handle.focus());
  }

  submit() {
    const p = props() ?? {}, c = tabCommand("archive", p.tab);
    closeOverlay(p.overlay);
    run(c.name, c.args);
  }

  render() {
    const t = theme(), p = props() ?? {};
    return v_flex().id("archive-confirm").track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (escapeKey(e, cx, p.overlay)) return;
        if (e.key === "enter") { this.submit(); cx.stop_propagation(); }
      })
      .size_full().p(20).gap(14).bg(t.popover).text_color(t.foreground)
      .child(dialogTitle(t, "Archive this session?"))
      .child(v_flex().gap(3)
        .child(div().min_w(0).truncate().text_size(13).font_medium().child(p.title ?? ""))
        .child(div().text_size(12).text_color(t.dim).child("Hides the tab. The agent keeps running and the tab returns when it needs you.")))
      .child(div().flex_1())
      .child(h_flex().gap(8).justify_end()
        .child(button(t, "ac-cancel", "Cancel", "plain", () => closeOverlay(p.overlay)))
        .child(button(t, "ac-archive", "Archive", "primary", () => this.submit())));
  }
}
