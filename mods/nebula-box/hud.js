// The project name flashed in the middle of the window when ⌘1 to ⌘9 picks a project (role "hud";
// props: { root, name, n, at }). A frameless window, so it never takes the keyboard; the rail closes it 900 ms after
// `at`. It rises and fades in at the start and fades out from 700 ms, so it is gone when the rail closes it.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { props, theme, shared } from "herdr";
import { ICONS, SETTINGS } from "./lib/shared.js";
import { mergeSettings } from "./lib/settings.js";
import { setReduceMotion, animate, hudPhase, HUD_RISE, ENTER, FADE } from "./lib/motion.js";
import { iconFor } from "./lib/icons.js";
import { projectIcon } from "./lib/icon-view.js";
import { fs } from "./lib/scale.js";

export class Hud {
  init(cx) {
    this.phase = 0;
    // The phase changes twice in the flash's life (lib/motion.js hudPhase), so a tick redraws only then.
    cx.timer.every(40, (cx) => {
      const phase = this.phaseNow();
      if (phase !== this.phase) {
        this.phase = phase;
        cx.notify();
      }
    });
  }

  phaseNow() {
    const at = props()?.at;
    return at > 0 ? hudPhase(Date.now() - at) : 1;
  }

  render() {
    const t = theme(),
      p = props() ?? {};
    const still = setReduceMotion(mergeSettings(shared(SETTINGS)).reduceMotion),
      phase = still ? 1 : this.phase;
    return animate(
      h_flex()
        .id("hud")
        .relative()
        .top(phase === 0 ? HUD_RISE : 0)
        .opacity(phase === 2 || phase === 0 ? 0 : 1),
      (el) => el.transition("top", ENTER).transition("opacity", FADE),
    )
      .size_full()
      .px(16)
      .gap(12)
      .items_center()
      .rounded(12)
      .border_1()
      .border_color(t.border)
      .bg(t.popover)
      .shadow_lg()
      .text_color(t.foreground)
      .child(projectIcon({ icon: iconFor(shared(ICONS) ?? {}, p.root, p.name), size: 28 }))
      .child(
        div()
          .flex_1()
          .min_w(0)
          .truncate()
          .text_size(fs(15))
          .font_semibold()
          .child(p.name ?? ""),
      )
      .child(
        div()
          .flex_none()
          .text_size(fs(12))
          .text_color(t.muted)
          .child(`⌘${p.n ?? ""}`),
      );
  }
}
