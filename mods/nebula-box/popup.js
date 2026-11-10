// herdr-nebula's own popup (role "popup"): a small frameless window the icon bar opens near its bottom edge for
// update news ("herdr-nebula v0.2.0 is ready" with Update and What changed). It is ours, not Herdr's toast mod:
// Herdr restores its shipped mods on every start, so a replaced toast would not last. props: { title, body,
// level, actions: [{ label, name, args?, primary? }] }; level "error" draws a red border. The icon bar closes it.
import { div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, theme, run, closeOverlay } from "herdr";
import { LOGO } from "./lib/update.js";
import { fs } from "./lib/scale.js";

export class Popup {
  init() {}

  render() {
    const t = theme(),
      p = props() ?? {},
      close = () => closeOverlay(p.overlay);
    const stop = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation()); // controls do not drag the window
    return h_flex()
      .id("nebula-popup")
      .size_full()
      .px(14)
      .gap(12)
      .items_center()
      .rounded(12)
      .border_1()
      .border_color(p.level === "error" ? t.error : t.border)
      .bg(t.popover)
      .child(image(LOGO).size(30).rounded(8).flex_none())
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .child(
            div()
              .truncate()
              .font_semibold()
              .text_size(fs(13))
              .text_color(t.foreground)
              .child(p.title ?? ""),
          )
          .when(Boolean(p.body), (el) => el.child(div().truncate().text_size(fs(12)).text_color(t.muted).child(p.body))),
      )
      .children(
        (p.actions ?? []).map((a, i) =>
          stop(
            div()
              .id(`pop-act-${i}`)
              .h(26)
              .px(12)
              .flex()
              .flex_none()
              .items_center()
              .rounded(13)
              .text_size(fs(12))
              .font_semibold()
              .cursor_pointer()
              .when(Boolean(a.primary), (b) => b.bg(t.accent).text_color(t.accent_foreground))
              .when(!a.primary, (b) => b.text_color(t.accent).hover((s) => s.bg(t.hover)))
              .on_click(() => {
                if (a.name) run(a.name, a.args ?? {});
                close();
              })
              .child(a.label),
          ),
        ),
      )
      .child(
        stop(
          div()
            .id("pop-close")
            .flex_none()
            .px(4)
            .text_size(fs(13))
            .text_color(t.muted)
            .cursor_pointer()
            .hover((s) => s.text_color(t.foreground))
            .on_click(() => close())
            .child("×"),
        ),
      );
  }
}
