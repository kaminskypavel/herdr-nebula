// Herdr's notifications, from herdr-nebula. Same look and click as Herdr's own toast (anything can post
// one with notify({ title, body, level, icon, action }); a click runs its action and dismisses it), but
// Herdr's agent alerts ("Claude Code finished" over "space / tab") say which session, what happened and
// what it said: "build-wizard [done]" over "libby-agent-monorepo · <the agent's last reply>" (lib.js), or
// "[needs you]" over the question it asked, beside the project's icon from the icon bar with the status
// dot. The reply comes from the conversation the prompt hook saved on the terminal; until it is read, or
// without one, the second line holds the session's last prompt.
import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme, terminals, exec, shared } from "herdr";
import { agentLines, terminalOf, sessionOf, TRANSCRIPT, lastReply, replyLine, eventOf, iconOf, DOT_OF } from "./lib.js";

const DOT = { error: "blocked", warning: "working", success: "done", info: "accent" };
const SIZE = 28;

// The project's icon (its picture, else initials on its color) with the agent's status dot at the
// corner, as the icon bar draws it.
function projectIcon(icon, dot, t) {
  const face = icon.path
    ? image(icon.path).size(SIZE).rounded(6)
    : div()
        .size(SIZE)
        .rounded(6)
        .flex()
        .items_center()
        .justify_center()
        .bg(icon.color)
        .text_size(12)
        .font_semibold()
        .text_color("#ffffff")
        .child(icon.initials);
  const badge = div().absolute().right(-3).bottom(-3).size(11).rounded_full().bg(t.popover).flex().items_center().justify_center();
  return div()
    .relative()
    .size(SIZE)
    .flex_none()
    .child(face)
    .child(badge.child(div().size(7).rounded_full().bg(t[dot])));
}

export default class Toast extends View {
  init(_props, cx) {
    this.reply = null;
    const p = props() ?? {},
      term = terminalOf(p, terminals()),
      s = sessionOf(term?.labels?.["nebula.session"]);
    if (!s) return;
    cx.spawn(async (cx) => {
      const r = await exec("/bin/sh", ["-c", TRANSCRIPT[s.app], "sh", s.id], { timeout: 5000 }).catch(() => null);
      const said = r?.code === 0 ? replyLine(lastReply(r.stdout), eventOf(p.title)) : null;
      if (said) {
        this.reply = said;
        cx.notify();
      }
    });
  }

  render(_cx) {
    const t = theme();
    const p = props() ?? {};
    const term = terminalOf(p, terminals()),
      agent = agentLines(p, term, this.reply),
      lines = agent ?? { name: p.title ?? "", tag: null, tone: null, body: p.body ?? "" },
      icon = agent ? iconOf(shared("nebula.icons"), term.cwd) : null;
    const lead = icon
      ? projectIcon(icon, DOT_OF[eventOf(p.title)], t)
      : p.icon
        ? image(p.icon).w(18).h(18).flex_none()
        : div()
            .size(8)
            .rounded(4)
            .flex_none()
            .bg(t[DOT[p.level] ?? "accent"]);
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
      .child(lead)
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .overflow_hidden()
          .child(
            h_flex()
              .min_w(0)
              .gap(8)
              .items_center()
              .child(div().min_w(0).truncate().font_semibold().text_size(13).text_color(t.foreground).child(lines.name))
              .when(Boolean(lines.tag), (el) =>
                el.child(
                  div()
                    .flex_none()
                    .px(5)
                    .rounded(4)
                    .border_1()
                    .border_color(t[lines.tone])
                    .text_size(11)
                    .font_semibold()
                    .text_color(t[lines.tone])
                    .child(lines.tag),
                ),
              ),
          )
          .when(Boolean(lines.body), (el) => el.child(div().truncate().text_size(12).text_color(t.muted).child(lines.body))),
      );
  }
}
