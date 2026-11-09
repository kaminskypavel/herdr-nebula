// Rename a session: one field, Enter saves, Esc cancels. The name goes to the session's
// tab with `herdr-app do tab.rename`; a tab name the title hook did not write is the
// user's, so the board keeps it as the title.
// props: { tab, name (the current title, empty while the session is unnamed) }.
import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { props, closeOverlay, theme } from "herdr";
import { button, dialogTitle, escapeKey, doCmd } from "./ui.js";
import { fs } from "./lib/scale.js";

export class Rename {
  init(cx) {
    this.error = null;
    this.busy = false;
    this.focused = true;
    this.handle = cx.focus_handle();
    const name = props()?.name ?? "";
    this.input = InputState.new({ value: name, placeholder: "Session name" });
    if (name) this.input.set_selected_range({ start: 0, end: name.length });
    this.input.on("submit", (_e, cx) => this.submit(cx));
    this.input.on("change", (_e, cx) => {
      this.error = null;
      cx.notify();
    });
    this.input.on("focus", (_e, cx) => {
      this.focused = true;
      cx.notify();
    });
    this.input.on("blur", (_e, cx) => {
      this.focused = false;
      cx.notify();
    });
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
  }

  submit(cx) {
    const p = props() ?? {},
      name = this.input.value().trim();
    if (this.busy || !p.tab) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      const r = await doCmd("tab.rename", { id: p.tab, name });
      this.busy = false;
      if (r.code === 0) closeOverlay(p.overlay);
      else {
        this.error = (r.stderr || r.stdout || "Rename failed.").trim();
        cx.notify();
      }
    });
  }

  render() {
    const t = theme(),
      overlay = props()?.overlay;
    return v_flex()
      .id("rename")
      .track_focus(this.handle)
      .on_key_down((e, cx) => escapeKey(e, cx, overlay))
      .w_full()
      .min_h(0)
      .p(20)
      .gap(14)
      .bg(t.popover)
      .text_color(t.foreground)
      .child(dialogTitle(t, "Rename session"))
      .child(
        Input.new(this.input)
          .h(36)
          .px(10)
          .rounded(9)
          .border_1()
          .border_color(this.error ? t.blocked : this.focused ? t.accent : t.input)
          .bg(t.background)
          .text_size(fs(13))
          .text_color(t.foreground),
      )
      .when(Boolean(this.error), (el) => el.child(div().text_size(fs(12)).text_color(t.blocked).child(this.error)))
      .child(
        h_flex()
          .pt(4)
          .gap(8)
          .justify_end()
          .child(button(t, "rn-cancel", "Cancel", "plain", () => closeOverlay(overlay)))
          .child(button(t, "rn-save", this.busy ? "Saving…" : "Save", "primary", (_e, cx) => this.submit(cx))),
      );
  }
}
