// CloseTab asks before ⌘W closes a tab whose agent is still running (role "close-tab"; props: { tab, name, agents }).
// Herdr itself only asks before closing a workspace's last tab, and closing a tab ends its agent. Enter closes it,
// A archives it instead (it keeps running, out of the way), Esc keeps it.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, theme, run } from "herdr";
import { button, dialogTitle, escapeKey } from "./ui.js";
import { fs } from "./lib/scale.js";

export class CloseTab {
  init(cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(300, () => this.handle.focus());
  }

  // The command first, then close: a closed dialog's code stops.
  act(name) {
    const p = props() ?? {};
    run(name, name === "tab.close" ? { id: p.tab, confirmed: true } : { id: p.tab });
    closeOverlay(p.overlay);
  }

  render() {
    const t = theme(),
      p = props() ?? {},
      n = Number(p.agents) || 1;
    return v_flex()
      .id("close-tab")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (escapeKey(e, cx, p.overlay)) return;
        if (e.key === "enter") this.act("tab.close");
        else if (e.key === "a") this.act("tab.settle");
        else return;
        cx.stop_propagation();
      })
      .size_full()
      .p(20)
      .gap(14)
      .bg(t.popover)
      .text_color(t.foreground)
      .child(dialogTitle(t, `Close ${p.name || "this tab"}?`))
      .child(
        div()
          .text_size(fs(12))
          .text_color(t.muted)
          .child(`${n === 1 ? "Its agent stops" : `Its ${n} agents stop`}. Archive keeps ${n === 1 ? "it" : "them"} running, out of the way (A).`),
      )
      .child(div().flex_1())
      .child(
        h_flex()
          .gap(8)
          .justify_end()
          .child(button(t, "ct-cancel", "Cancel", "plain", () => closeOverlay(p.overlay)))
          .child(button(t, "ct-archive", "Archive", "plain", () => this.act("tab.settle")))
          .child(button(t, "ct-close", "Close", "danger", () => this.act("tab.close"))),
      );
  }
}
