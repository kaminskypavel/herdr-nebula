// Continue a session in another worktree (role "continue"; props: { id, title, from, to, path }), opened by a drop on
// a worktree or the menu's "Continue in <worktree>". A new session starts there, told where this one got to; this one
// is archived (it sleeps, restorable) unless you keep both. The board does the work (shared nebula.rowAction).
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, theme, setShared } from "herdr";
import { ROW_ACTION } from "./lib/shared.js";
import { button, dialogTitle, escapeKey } from "./ui.js";
import { fs } from "./lib/scale.js";

export class Continue {
  init(cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(300, () => this.handle.focus());
  }

  // mode: "archive" (continue there, archive this one) or "keep" (both run).
  go(mode) {
    const p = props() ?? {};
    closeOverlay(p.overlay);
    setShared(ROW_ACTION, { id: p.id, action: `continue-go:${mode}:${p.path}`, n: Date.now() });
  }

  render() {
    const t = theme(),
      p = props() ?? {};
    return v_flex()
      .id("continue")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (escapeKey(e, cx, p.overlay)) return;
        if (e.key === "enter") {
          this.go(e.modifiers?.shift ? "keep" : "archive");
          cx.stop_propagation();
        }
      })
      .size_full()
      .p(20)
      .gap(14)
      .bg(t.popover)
      .text_color(t.foreground)
      .child(dialogTitle(t, `Continue in ${p.to ?? ""}?`))
      .child(
        v_flex()
          .gap(3)
          .child(
            div()
              .min_w(0)
              .truncate()
              .text_size(fs(13))
              .font_medium()
              .child(p.title ?? ""),
          )
          .child(
            div()
              .text_size(fs(12))
              .text_color(t.muted)
              .child(
                `A new session starts in ${p.to ?? ""}, told what this one was doing and that its changes are in ${p.from ?? ""}. Archive this one (it sleeps, u brings it back), or keep both.`,
              ),
          ),
      )
      .child(div().flex_1())
      .child(
        h_flex()
          .gap(8)
          .justify_end()
          .child(button(t, "cn-cancel", "Cancel", "plain", () => closeOverlay(p.overlay)))
          .child(button(t, "cn-keep", "Keep both", "plain", () => this.go("keep")))
          .child(button(t, "cn-go", "Continue, archive this", "primary", () => this.go("archive"))),
      );
  }
}
