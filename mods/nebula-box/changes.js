// What changed in herdr-nebula (role "changes"), opened by the update popup's What changed, About and Settings:
// the CHANGELOG sections newer than the installed version when an update waits, else the installed version's
// own (shared "nebula.update", filled by the icon bar's update check; lib/update.js). Esc closes it.
import { div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, theme, shared, exec, run, window, closeOverlay } from "herdr";
import { UPDATE } from "./lib/shared.js";
import { updateState, LOGO, noteLines } from "./lib/update.js";
import { button, escapeKey } from "./ui.js";
import { fs } from "./lib/scale.js";

const RELEASES = "https://github.com/kaminskypavel/herdr-nebula/releases";

export class Changes {
  init(cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  render() {
    const t = theme(),
      report = shared(UPDATE) ?? {},
      ready = updateState(report) === "available",
      sections = ready && report.notes?.length ? report.notes : report.currentNotes ? [{ version: report.version, text: report.currentNotes }] : [];
    const title = ready ? `New in herdr-nebula ${report.latestVersion || ""}`.trim() : `herdr-nebula ${report.version || ""}`.trim();
    const draw = (line, i) =>
      line.kind === "head"
        ? div().id(`h-${i}`).pt(10).text_size(fs(13)).font_semibold().text_color(t.foreground).child(line.text)
        : line.kind === "item"
          ? h_flex()
              .id(`i-${i}`)
              .gap(8)
              .items_start()
              .child(div().flex_none().mt(7).size(4).rounded_full().bg(t.accent))
              .child(div().flex_1().min_w(0).text_color(t.foreground).child(line.text))
          : div().id(`t-${i}`).text_color(t.muted).child(line.text);
    return v_flex()
      .id("changes")
      .track_focus(this.handle)
      .on_key_down((e, cx) => escapeKey(e, cx, props()?.overlay))
      .size_full()
      .p(20)
      .gap(12)
      .bg(t.popover)
      .text_color(t.foreground)
      .text_size(fs(13))
      .child(
        h_flex()
          .gap(12)
          .items_center()
          .child(image(LOGO).size(36).rounded(9).flex_none())
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .child(div().text_size(fs(15)).font_semibold().child(title))
              .child(
                div()
                  .text_size(fs(12))
                  .text_color(t.muted)
                  .child(ready ? `Installed: ${report.version || report.head}` : "What this version brought"),
              ),
          )
          .child(div().flex_none().text_size(fs(11)).text_color(t.muted).child("Esc")),
      )
      .child(
        v_flex()
          .id("changes-body")
          .flex_1()
          .min_h(0)
          .gap(6)
          .overflow_y_scrollbar()
          .when(!sections.length, (el) => el.child(div().text_color(t.muted).child("No release notes yet. Check for updates, or see the releases on GitHub.")))
          .children(
            sections.flatMap((s, si) => [
              div()
                .id(`v-${si}`)
                .pt(si ? 14 : 0)
                .text_size(fs(12))
                .font_semibold()
                .text_color(t.accent)
                .child(s.version),
              ...noteLines(s.text).map((l, i) => draw(l, `${si}-${i}`)),
            ]),
          ),
      )
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .pt(10)
          .border_t(1)
          .border_color(t.border)
          .child(
            div()
              .id("all-releases")
              .flex_1()
              .text_size(fs(12))
              .text_color(t.accent)
              .cursor_pointer()
              .hover((s) => s.underline())
              .on_click((_e, cx) => {
                cx.spawn(async () => {
                  await exec(window()?.platform === "macos" ? "open" : "xdg-open", [RELEASES]).catch(() => null);
                });
              })
              .child("All releases on GitHub"),
          )
          .child(button(t, "ch-close", "Close", "plain", () => closeOverlay(props()?.overlay)))
          .when(ready, (el) =>
            el.child(
              button(t, "ch-update", "Update", "primary", () => {
                run("nebula.update", {});
                closeOverlay(props()?.overlay);
              }),
            ),
          ),
      );
  }
}
