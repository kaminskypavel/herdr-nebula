// The lines every view draws: a session, a sub-agent under it, a worktree band and a repo
// header. They only draw; lib/viewmodel.js decides what is
// there. A virtual list's renderer takes no handlers, so `click` is optional: the plain
// views (Cards, Columns) pass it, the lists answer on_item_click in the board instead.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { COLOR } from "../lib/status.js";
import { bandStats, bandSummary, summaryParts, vacantHint, BAND_COLOR } from "../lib/viewmodel.js";
import { rowMeta } from "../lib/rowmeta.js";
import { rowText } from "../lib/prompt.js";
import { pulseOf } from "../lib/attention.js";
import { fs, rh } from "../lib/scale.js";

// Row heights, for the virtual lists, which place rows by stated sizes.
// `sessionTall` is a session row with the prompt line under its title.
export const HEIGHT = { repo: 28, band: 32, session: 26, sessionTall: 40, vacant: 26, sub: 22, shelf: 22, empty: 40 };

// The stated height of an item in a virtual list; opts: { promptLine } (the setting).
export const itemHeight = (item, opts = {}) =>
  rh(item.type === "session" && rowText(item.row, opts.promptLine !== false).sub ? HEIGHT.sessionTall : HEIGHT[item.type]);

const tone = (status, t) => t[COLOR[status]] ?? t.unknown;

// `hollow` (an archived session) draws a ring instead of a filled dot. Needs-you pulses red, working
// pulses gently and `fresh` (an unseen finish only seconds old) pulses for those seconds (lib/attention.js).
export function ball(status, t, size = 8, hollow = false, fresh = false) {
  const b = div()
    .size(size)
    .rounded_full()
    .flex_none()
    .when(hollow, (el) => el.border(1.5).border_color(tone(status, t)))
    .when(!hollow, (el) => el.bg(tone(status, t)));
  const pulse = hollow ? null : pulseOf(status, fresh);
  return pulse ? b.loop("opacity", pulse) : b;
}

// The right-hand words of a row; `moon` puts a small moon before them (an asleep agent).
const age = (text, color, moon = false) =>
  h_flex()
    .flex_none()
    .items_center()
    .gap(4)
    .text_size(fs(12))
    .text_color(color)
    .when(moon, (el) => el.child(svg("mods/nebula/icons/moon.svg").size(11).flex_none()))
    .child(text);

// The agent's icon (12px, dim like the text) and its model and effort; null when there is nothing to say.
// The text shrinks and truncates, so a long value never pushes the age off.
export function metaLine(row, t, size = 12) {
  const { icon, text } = rowMeta(row);
  if (!icon && !text) return null;
  return h_flex()
    .min_w(0)
    .items_center()
    .gap(5)
    .text_size(fs(size))
    .text_color(t.dim)
    .when(Boolean(icon), (el) => el.child(svg(icon).size(12).flex_none().text_color(t.dim)))
    .when(Boolean(text), (el) => el.child(div().min_w(0).truncate().child(text)));
}

// A session's title: dim when exited or archived; an archived one is italic with an archive icon before it.
export function title(row, t) {
  const text = div()
    .min_w(0)
    .truncate()
    .text_color(row.exited || row.archived ? t.dim : t.foreground)
    .when(row.archived, (el) => el.italic())
    .child(row.title);
  return row.archived
    ? h_flex().min_w(0).items_center().gap(5).child(svg("mods/nebula/icons/archive.svg").size(12).flex_none().text_color(t.dim)).child(text)
    : text;
}

export const badge = (text, t) => div().flex_none().px(4).rounded(3).border(1).border_color(t.border).text_size(fs(10)).text_color(t.dim).child(text);

export function sessionLine(row, t, { selected, indent = 14, click = null, pinned = false, promptLine = true }) {
  const meta = metaLine(row, t);
  const text = rowText(row, promptLine);
  return h_flex()
    .h(rh(text.sub ? HEIGHT.sessionTall : HEIGHT.session))
    .flex_none()
    .items_center()
    .gap(10)
    .pl(indent)
    .pr(10)
    .rounded(6)
    .text_size(fs(13))
    .when(selected, (el) => el.bg(t.selected))
    .when(!selected, (el) => el.hover((s) => s.bg(t.hover)))
    .when(pinned, (el) => el.border_1().border_color(t.accent))
    .when(Boolean(row.prompt), (el) => el.tooltip(row.prompt))
    .when(Boolean(click), (el) =>
      el
        .id(`session-${row.id}`)
        .cursor_pointer()
        .on_click((_e, cx) => click(row.id, cx)),
    )
    .child(ball(row.status, t, 8, row.archived, row.fresh))
    .child(
      v_flex()
        .flex_1()
        .min_w(0)
        .child(
          h_flex()
            .min_w(0)
            .items_center()
            .gap(10)
            .child(title({ ...row, title: text.title }, t))
            .when(Boolean(row.badge), (el) => el.child(badge(row.badge, t)))
            .when(Boolean(meta), (el) => el.child(meta)),
        )
        .when(Boolean(text.sub), (el) => el.child(div().min_w(0).truncate().text_size(fs(11.5)).text_color(t.dim).child(text.sub))),
    )
    .child(age(pinned ? "pinned" : row.age, selected ? t.muted : t.dim, !pinned && row.asleep));
}

// The line under a band with no session: it can hold the cursor, `p` and `d` act on it.
export function vacantLine(item, t, { selected, indent = 14, click = null }) {
  return h_flex()
    .h(rh(HEIGHT.vacant))
    .flex_none()
    .items_center()
    .pl(indent)
    .pr(10)
    .rounded(6)
    .text_size(fs(11.5))
    .text_color(selected ? t.muted : t.dim)
    .when(selected, (el) => el.bg(t.selected))
    .when(!selected, (el) => el.hover((s) => s.bg(t.hover)))
    .when(Boolean(click), (el) =>
      el
        .id(`vacant-${item.band.path}`)
        .cursor_pointer()
        .on_click((_e, cx) => click(item.key, cx)),
    )
    .child(div().min_w(0).truncate().child(vacantHint(item.band)));
}

export function subLine(sub, t, { indent = 30 }) {
  return h_flex()
    .h(rh(HEIGHT.sub))
    .flex_none()
    .items_center()
    .gap(6)
    .pl(indent + sub.lines.length * 10)
    .pr(10)
    .text_size(fs(11.5))
    .tooltip(sub.badge ? `${sub.text}\nModel: ${sub.badge}` : sub.text)
    .child(ball(sub.status, t, 6))
    .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(sub.text))
    .when(Boolean(sub.badge), (el) => el.child(badge(sub.badge, t)))
    .when(Boolean(sub.age), (el) => el.child(age(sub.age, t.dim).text_size(fs(11))));
}

export function bandLine(band, t, { indent = 10, folded = false, click = null }) {
  const parts = bandStats(band);
  return h_flex()
    .h(rh(HEIGHT.band))
    .flex_none()
    .pt(4)
    .items_center()
    .gap(8)
    .pl(indent)
    .pr(10)
    .text_size(fs(11))
    .text_color(t.muted)
    .when(Boolean(click), (el) =>
      el
        .id(`band-${band.path}`)
        .cursor_pointer()
        .on_click((_e, cx) => click(`band:${band.path}`, cx)),
    )
    .child(
      div()
        .w(10)
        .flex_none()
        .text_size(fs(11))
        .text_color(t.dim)
        .child(folded ? "▸" : "▾"),
    )
    .child(div().flex_none().child(band.label))
    .when(parts.length > 0, (el) =>
      el.child(
        h_flex()
          .flex_none()
          .gap(5)
          .children(parts.map((p) => div().flex_none().text_color(t[BAND_COLOR[p.kind]]).child(p.text))),
      ),
    )
    .child(div().flex_1().h(1).bg(t.border))
    .when(folded, (el) =>
      el.child(
        h_flex()
          .gap(8)
          .items_center()
          .flex_none()
          .children(bandSummary(band).map((p) => chip(p, t))),
      ),
    );
}

export const chip = (p, t) =>
  h_flex()
    .gap(4)
    .items_center()
    .text_size(fs(11))
    .text_color(tone(p.status, t))
    .child(ball(p.status, t))
    .child(div().child(String(p.n)));

const chips = (repo, t) =>
  h_flex()
    .gap(8)
    .items_center()
    .flex_none()
    .children(summaryParts(repo).map((p) => chip(p, t)));

export function repoLine(repo, t, { folded, selected, click = null }) {
  return h_flex()
    .h(rh(HEIGHT.repo))
    .flex_none()
    .items_center()
    .gap(8)
    .px(10)
    .rounded(6)
    .text_size(fs(13))
    .when(selected, (el) => el.bg(t.selected))
    .when(!selected, (el) => el.hover((s) => s.bg(t.hover)))
    .when(Boolean(click), (el) =>
      el
        .id(`repo-${repo.root}`)
        .cursor_pointer()
        .on_click((_e, cx) => click(`repo:${repo.root}`, cx)),
    )
    .child(
      div()
        .w(10)
        .flex_none()
        .text_size(fs(11))
        .text_color(t.dim)
        .child(folded ? "▸" : "▾"),
    )
    .child(div().min_w(0).truncate().font_semibold().text_color(t.foreground).child(repo.name))
    .child(div().flex_1())
    .child(chips(repo, t));
}

export const shelfLine = (text, t) =>
  h_flex()
    .h(rh(HEIGHT.shelf))
    .flex_none()
    .pt(6)
    .items_center()
    .gap(8)
    .pl(14)
    .pr(10)
    .text_size(fs(10))
    .text_color(t.dim)
    .child(div().flex_none().child(text))
    .child(div().flex_1().h(1).bg(t.border));

export const emptyLine = (text, t) => h_flex().h(rh(HEIGHT.empty)).flex_none().items_center().px(14).text_size(fs(12)).text_color(t.dim).child(text);

export function drawItem(item, t, { cursor, deep = false, click = null, pinned = null, promptLine = true }) {
  const selected = cursor === item.key;
  switch (item.type) {
    case "repo":
      return repoLine(item.repo, t, { folded: item.folded, selected, click });
    case "band":
      return bandLine(item.band, t, { indent: deep ? 24 : 10, folded: item.folded, click });
    case "session":
      return sessionLine(item.row, t, { selected, indent: deep ? 32 : 14, click, pinned: item.row.id === pinned, promptLine });
    case "vacant":
      return vacantLine(item, t, { selected, indent: deep ? 32 : 14, click });
    case "sub":
      return subLine(item.sub, t, { indent: deep ? 48 : 30 });
    case "shelf":
      return shelfLine(item.text, t);
    default:
      return emptyLine(item.text ?? "", t);
  }
}
