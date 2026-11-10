// About herdr-nebula, opened by the nebula logo at the top of the icon bar (role "about"): the logo, what it
// is, the installed version and its update state (shared "nebula.update", lib/update.js), the repo link,
// Check for updates, and the credit to nebula. Esc closes it.
import { div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, theme, shared, exec, run, window, closeOverlay } from "herdr";
import { UPDATE } from "./lib/shared.js";
import { updateLine, updateState } from "./lib/update.js";
import { button, escapeKey } from "./ui.js";
import { fs } from "./lib/scale.js";

const REPO_URL = "https://github.com/kaminskypavel/herdr-nebula";
const NEBULA_URL = "https://github.com/AgentSystemLabs/nebula";
export const LOGO = "mods/nebula/icons/nebula-logo.png";

const open = (url, cx) =>
  cx.spawn(async () => {
    await exec(window()?.platform === "macos" ? "open" : "xdg-open", [url]).catch(() => null);
  });

export class About {
  init(cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  render() {
    const t = theme(),
      report = shared(UPDATE),
      ready = updateState(report ?? {}) === "available";
    const link = (id, label, url, glyph) =>
      h_flex()
        .id(id)
        .gap(6)
        .items_center()
        .cursor_pointer()
        .text_color(t.accent)
        .hover((s) => s.underline())
        .on_click((_e, cx) => open(url, cx))
        .when(Boolean(glyph), (el) => el.child(svg(glyph).size(13).flex_none()))
        .child(label);
    return v_flex()
      .id("about")
      .track_focus(this.handle)
      .on_key_down((e, cx) => escapeKey(e, cx, props()?.overlay))
      .size_full()
      .p(22)
      .gap(14)
      .items_center()
      .bg(t.popover)
      .text_color(t.foreground)
      .text_size(fs(13))
      .child(image(LOGO).size(72).rounded(16))
      .child(
        v_flex()
          .items_center()
          .gap(4)
          .child(div().text_size(fs(15)).font_semibold().child("herdr-nebula"))
          .child(div().text_color(t.muted).child("Mission control for your coding agents, inside Herdr")),
      )
      .child(
        div()
          .text_size(fs(12))
          .text_color(t.muted)
          .child(report ? updateLine(report) : "Version not checked yet"),
      )
      .child(
        h_flex()
          .gap(8)
          .child(
            ready
              ? button(t, "ab-update", "Update now", "primary", () => {
                  run("nebula.update", {});
                  closeOverlay(props()?.overlay);
                })
              : button(t, "ab-check", "Check for updates", "plain", () => run("nebula.checkupdate", {})),
          ),
      )
      .child(div().flex_1())
      .child(
        v_flex()
          .items_center()
          .gap(6)
          .text_size(fs(12))
          .child(link("ab-repo", "kaminskypavel/herdr-nebula", REPO_URL, "icons/gh.svg"))
          .child(
            h_flex()
              .gap(4)
              .text_color(t.muted)
              .child("Built on")
              .child(link("ab-nebula", "nebula", NEBULA_URL, null))
              .child("by Cody Seibert (MIT)"),
          ),
      );
  }
}
