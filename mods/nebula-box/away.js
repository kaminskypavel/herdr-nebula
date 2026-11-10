// The welcome-back card (role "away", a dialog): what began waiting on you while the window was in the background.
// The icon bar opens it when the window comes back after a while (lib/alerts.js awayItems builds props().items:
// { id, root, project, session, status, since, line }). Each row is a project icon, the session's title, a tag
// (asks: it needs you, done: it finished), its age and, under it, `project · what the agent said`. Up and down pick,
// Enter or a click goes to that agent, Esc closes.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, theme, shared, run, closeOverlay } from "herdr";
import { ICONS } from "./lib/shared.js";
import { iconFor } from "./lib/icons.js";
import { projectIcon } from "./lib/icon-view.js";
import { duration } from "./lib/subagents.js";
import { awayText, AWAY_ROW } from "./lib/alerts.js";
import { dialogTitle, escapeKey } from "./ui.js";
import { fs, rh } from "./lib/scale.js";

export class Away {
  init(cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.at = 0;
  }

  items() {
    return Array.isArray(props()?.items) ? props().items : [];
  }

  // Goes to agent `i`: the same focus command ⌘] uses, then closes the card.
  go(i) {
    const hit = this.items()[i];
    if (!hit) return;
    closeOverlay(props()?.overlay);
    run("agent.focus", { terminal: hit.id });
  }

  key(e, cx) {
    if (escapeKey(e, cx, props()?.overlay)) return;
    const n = this.items().length;
    if (e.key === "down" && n) this.at = (this.at + 1) % n;
    else if (e.key === "up" && n) this.at = (this.at - 1 + n) % n;
    else if (e.key === "enter") this.go(this.at);
    else return;
    cx.stop_propagation();
    cx.notify();
  }

  // A small label: asks (it needs you, red) or done (it finished, cyan).
  tag(t, status) {
    const color = status === "needs" ? t.ansi1 : t.ansi6;
    return div()
      .flex_none()
      .px(5)
      .rounded(4)
      .border_1()
      .border_color(color)
      .text_size(fs(11))
      .text_color(color)
      .child(status === "needs" ? "asks" : "done");
  }

  row(t, hit, i, icons, now) {
    const on = i === this.at;
    return h_flex()
      .id(`aw-${hit.id}`)
      .h(rh(AWAY_ROW))
      .flex_none()
      .px(10)
      .gap(10)
      .items_center()
      .rounded(8)
      .cursor_pointer()
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click(() => this.go(i))
      .child(projectIcon({ icon: iconFor(icons, hit.root, hit.project), size: 28 }))
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .gap(2)
          .child(
            h_flex()
              .gap(8)
              .items_center()
              .child(div().flex_1().min_w(0).truncate().text_size(fs(13)).font_semibold().text_color(t.foreground).child(hit.session))
              .child(this.tag(t, hit.status))
              .child(
                div()
                  .flex_none()
                  .text_size(fs(11))
                  .text_color(t.muted)
                  .child(hit.since > 0 ? duration(Math.max(0, now - hit.since)) : ""),
              ),
          )
          .child(
            div()
              .truncate()
              .text_size(fs(12))
              .text_color(t.muted)
              .child(hit.line ? `${hit.project} · ${hit.line}` : hit.project),
          ),
      );
  }

  render() {
    const t = theme(),
      icons = shared(ICONS) ?? {},
      items = this.items(),
      now = Date.now();
    this.at = Math.min(this.at, Math.max(items.length - 1, 0));
    return v_flex()
      .id("away")
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.key(e, cx))
      .size_full()
      .p(20)
      .gap(12)
      .bg(t.popover)
      .text_color(t.foreground)
      .text_size(fs(13))
      .child(dialogTitle(t, `While you were away · ${awayText(Number(props()?.away) || 0)}`))
      .child(
        v_flex()
          .id("aw-list")
          .flex_1()
          .min_h(0)
          .gap(2)
          .overflow_y_scrollbar()
          .children(items.map((hit, i) => this.row(t, hit, i, icons, now))),
      )
      .child(div().flex_none().text_size(fs(12)).text_color(t.muted).child("↩ go · ↑↓ pick · Esc later"));
  }
}
