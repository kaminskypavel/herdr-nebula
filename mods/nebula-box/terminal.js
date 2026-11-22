// OpenTerminal asks before Ctrl+T on the board opens a shell (role "terminal"; props: { folder, label, checkouts }).
// Enter or Open terminal starts it in that folder, as a tab in the workspace already showing it (lib/launch.js
// planTerminal), and focuses it; Esc or Cancel does nothing.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, theme, exec, run, notify, spaces, panes } from "herdr";
import { planTerminal, runSteps, placedSpaces } from "./lib/launch.js";
import { button, dialogTitle, escapeKey } from "./ui.js";
import { fs } from "./lib/scale.js";

export class OpenTerminal {
  init(cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(300, () => this.handle.focus());
  }

  submit() {
    const p = props() ?? {};
    closeOverlay(p.overlay);
    const steps = planTerminal({ folder: p.folder, checkouts: p.checkouts ?? [{ path: p.folder, branch: null }], spaces: placedSpaces(spaces(), panes()) });
    runSteps(steps, exec).then((r) => {
      if (r.error) notify({ title: "Could not open a terminal", body: r.error, level: "error", timeout: 5000 });
      else if (r.terminal) run("pane.focus", { terminal: r.terminal });
    });
  }

  render() {
    const t = theme(),
      p = props() ?? {};
    return v_flex()
      .id("open-terminal")
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
      .child(dialogTitle(t, `Open a terminal in ${p.label ?? "this folder"}?`))
      .child(
        div()
          .min_w(0)
          .truncate()
          .text_size(fs(12))
          .text_color(t.muted)
          .child(p.where ?? p.folder ?? ""),
      )
      .child(div().flex_1())
      .child(
        h_flex()
          .gap(8)
          .justify_end()
          .child(button(t, "ot-cancel", "Cancel", "plain", () => closeOverlay(p.overlay)))
          .child(button(t, "ot-open", "Open terminal", "primary", () => this.submit())),
      );
  }
}
