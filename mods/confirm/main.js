// Herdr's confirm dialog, from herdr-nebula. Asks before something destructive, opened by Herdr as a dialog
// with props { title, detail, command: { name, args } }; Enter confirms (runs the command), Esc cancels.
// Closing a space or a tab names it with its project's icon from the icon bar, shows its folder, and lists
// the agents it would end with their state (lib.js), instead of a bare "Close space?". Every other
// confirmation looks as Herdr's own.
import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, theme, spaces, agents, shared, home } from "herdr";
import { closing, endsLine, iconOf, tilde } from "./lib.js";

const SIZE = 28;
const SHOWN = 4; // agents listed before "+N more"

function projectIcon(icon, t) {
  if (!icon) return null;
  return icon.path
    ? image(icon.path).size(SIZE).rounded(6).flex_none()
    : div()
        .size(SIZE)
        .rounded(6)
        .flex_none()
        .flex()
        .items_center()
        .justify_center()
        .bg(icon.color)
        .text_size(12)
        .font_semibold()
        .text_color("#ffffff")
        .child(icon.initials);
}

export default class Confirm extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  yes() {
    const p = props();
    closeOverlay(p.overlay);
    run(p.command.name, p.command.args ?? {});
  }

  render(_cx) {
    const t = theme();
    const p = props() ?? {};
    const c = closing(p.command, spaces(), agents());
    const button = (id, label, bg, fg, onClick) =>
      h_flex()
        .id(id)
        .h(32)
        .px(14)
        .items_center()
        .rounded(8)
        .border_1()
        .border_color(id === "no" ? t.input : bg)
        .bg(bg)
        .text_color(fg)
        .cursor_pointer()
        .hover((s) => s.opacity(0.88))
        .on_click(onClick)
        .child(label);
    const title = c ? `Close ${c.name}?` : (p.title ?? "Are you sure?");
    const icon = c ? projectIcon(iconOf(shared("nebula.icons"), c.folder), t) : null;
    const head = h_flex()
      .items_center()
      .gap(10)
      .when(Boolean(icon), (el) => el.child(icon))
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .child(div().truncate().text_size(15).font_semibold().text_color(t.foreground).child(title))
          .when(Boolean(c?.folder), (el) => el.child(div().truncate().text_size(12).text_color(t.muted).child(tilde(c.folder, home())))),
      )
      .child(div().flex_none().text_size(11).text_color(t.muted).child("Esc"));
    const body = c
      ? v_flex()
          .gap(4)
          .child(div().text_color(t.muted).child(endsLine(c)))
          .children(
            c.agents.slice(0, SHOWN).map((a) =>
              h_flex()
                .gap(8)
                .items_center()
                .child(
                  div()
                    .size(8)
                    .rounded_full()
                    .flex_none()
                    .bg(t[a.tone] ?? t.muted),
                )
                .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(a.name))
                .child(
                  div()
                    .flex_none()
                    .text_size(12)
                    .text_color(t[a.tone] ?? t.muted)
                    .child(a.word),
                ),
            ),
          )
          .when(c.agents.length > SHOWN, (el) =>
            el.child(
              div()
                .text_size(12)
                .text_color(t.muted)
                .child(`+${c.agents.length - SHOWN} more`),
            ),
          )
      : div()
          .text_color(t.muted)
          .child(p.detail ?? "");
    return v_flex()
      .id("confirm")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "enter") this.yes();
        else if (e.key === "escape") closeOverlay(props().overlay);
        else return;
        cx.stop_propagation();
      })
      .size_full()
      .min_h(0)
      .p(18)
      .gap(12)
      .rounded(8)
      .bg(t.popover)
      .text_size(13)
      .child(head)
      .child(div().flex_1().min_h(0).overflow_y_scrollbar().child(body))
      .child(
        h_flex()
          .justify_end()
          .gap(8)
          .text_size(12)
          .child(button("no", "Cancel", t.raised, t.foreground, () => closeOverlay(props().overlay)))
          .child(
            c
              ? button("yes", c.kind === "space" ? "Close space" : "Close tab", t.blocked, t.solid_foreground, () => this.yes())
              : button("yes", "Confirm", t.solid, t.solid_foreground, () => this.yes()),
          ),
      );
  }
}
