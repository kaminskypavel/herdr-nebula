// RemoveProject asks before a project leaves the list (role "remove-project";
// props: { root, name }). The folder and its worktrees stay on disk.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, theme, shared, setShared } from "herdr";
import { STORE, removeProject } from "./lib/repos.js";
import { OPEN } from "./lib/shared.js";
import { button, dialogTitle, escapeKey } from "./ui.js";
import { fs } from "./lib/scale.js";

export class RemoveProject {
  init(cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(300, () => this.handle.focus());
  }

  submit() {
    const p = props() ?? {},
      store = shared(STORE) ?? {};
    setShared(STORE, removeProject(store, p.root));
    const open = shared(OPEN);
    if (Array.isArray(open))
      setShared(
        OPEN,
        open.filter((r) => r !== p.root),
      );
    closeOverlay(p.overlay);
  }

  render() {
    const t = theme(),
      p = props() ?? {};
    return v_flex()
      .id("remove-project")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (escapeKey(e, cx, p.overlay)) return;
        if (e.key === "enter") {
          this.submit();
          cx.stop_propagation();
        }
      })
      .size_full()
      .p(20)
      .gap(14)
      .bg(t.popover)
      .text_color(t.foreground)
      .child(dialogTitle(t, "Remove this project?"))
      .child(
        v_flex()
          .gap(3)
          .child(
            div()
              .min_w(0)
              .truncate()
              .text_size(fs(13))
              .font_medium()
              .child(p.name ?? ""),
          )
          .child(div().text_size(fs(12)).text_color(t.dim).child("The folder and its worktrees stay on disk. Add it back from the + button.")),
      )
      .child(div().flex_1())
      .child(
        h_flex()
          .gap(8)
          .justify_end()
          .child(button(t, "rp-cancel", "Cancel", "plain", () => closeOverlay(p.overlay)))
          .child(button(t, "rp-remove", "Remove", "danger", () => this.submit())),
      );
  }
}
