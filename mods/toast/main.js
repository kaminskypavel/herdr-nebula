// Herdr's notifications, from herdr-nebula. Same look and click as Herdr's own toast (anything can post
// one with notify({ title, body, level, icon, action }); a click runs its action and dismisses it), but
// Herdr's agent alerts ("Claude Code finished" over "space / tab") say which session and what it said:
// "build-wizard finished" over "libby-agent-monorepo · <the agent's last reply>" (lib.js). The reply
// comes from the conversation the prompt hook saved on the terminal; until it is read, or without one,
// the second line holds the session's last prompt.
import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme, terminals, exec } from "herdr";
import { agentLines, terminalOf, sessionOf, TRANSCRIPT, lastReply, gist } from "./lib.js";

const DOT = { error: "blocked", warning: "working", success: "done", info: "accent" };

export default class Toast extends View {
  init(_props, cx) {
    this.reply = null;
    const p = props() ?? {},
      term = terminalOf(p, terminals()),
      s = sessionOf(term?.labels?.["nebula.session"]);
    if (!s) return;
    cx.spawn(async (cx) => {
      const r = await exec("/bin/sh", ["-c", TRANSCRIPT[s.app], "sh", s.id], { timeout: 5000 }).catch(() => null);
      const said = r?.code === 0 ? gist(lastReply(r.stdout)) : null;
      if (said) {
        this.reply = said;
        cx.notify();
      }
    });
  }

  render(_cx) {
    const t = theme();
    const p = props() ?? {};
    const lines = agentLines(p, terminalOf(p, terminals()), this.reply) ?? { title: p.title ?? "", body: p.body ?? "" };
    return h_flex()
      .id("toast")
      .size_full()
      .px(18)
      .gap(12)
      .items_center()
      .bg(t.popover)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => {
        if (p.action?.name) run(p.action.name, p.action.args ?? {});
        closeOverlay(p.overlay);
      })
      .child(
        p.icon
          ? image(p.icon).w(18).h(18).flex_none()
          : div()
              .size(8)
              .rounded(4)
              .flex_none()
              .bg(t[DOT[p.level] ?? "accent"]),
      )
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .overflow_hidden()
          .child(div().truncate().font_semibold().text_size(13).text_color(t.foreground).child(lines.title))
          .when(Boolean(lines.body), (el) => el.child(div().truncate().text_size(12).text_color(t.muted).child(lines.body))),
      );
  }
}
