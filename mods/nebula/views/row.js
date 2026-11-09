// The lines every view draws: a session, a sub-agent under it, a worktree band, a repo
// header and a repo's summary row. They only draw; lib/viewmodel.js decides what is
// there. A virtual list's renderer takes no handlers, so `click` is optional: the plain
// views (Cards, Columns) pass it, the lists answer on_item_click in the board instead.
import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { COLOR } from "../lib/status.js";
import { bandParts, summaryParts } from "../lib/viewmodel.js";
import { rowMeta } from "../lib/rowmeta.js";

// Row heights, for the virtual lists, which place rows by stated sizes.
export const HEIGHT = { repo: 28, band: 32, session: 26, sub: 22, divider: 34, summary: 24, empty: 40 };

const tone = (status, t) => t[COLOR[status]] ?? t.unknown;

export function ball(status, t, size = 8) {
  const b = div().size(size).rounded_full().flex_none().bg(tone(status, t));
  return status === "working" ? b.loop("opacity", { from: 0.35, to: 1, period: 1200 }) : b;
}

const age = (text, color) => div().flex_none().text_size(12).text_color(color).child(text);

// The agent's icon (12px, dim like the text) and its model and effort; null when there is nothing to say.
// The text shrinks and truncates, so a long value never pushes the age off.
export function metaLine(row, t, size = 12) {
  const { icon, text } = rowMeta(row);
  if (!icon && !text) return null;
  return h_flex().min_w(0).items_center().gap(5).text_size(size).text_color(t.dim)
    .when(Boolean(icon), (el) => el.child(svg(icon).size(12).flex_none().text_color(t.dim)))
    .when(Boolean(text), (el) => el.child(div().min_w(0).truncate().child(text)));
}

export const badge = (text, t) => div().flex_none().px(4).rounded(3).border(1).border_color(t.border).text_size(10).text_color(t.dim).child(text);

export function sessionLine(row, t, { selected, indent = 14, click = null, pinned = false }) {
  const dim = row.exited || row.archived, meta = metaLine(row, t);
  return h_flex().h(HEIGHT.session).flex_none().items_center().gap(10).pl(indent).pr(10).rounded(6).text_size(13)
    .when(selected, (el) => el.bg(t.selected))
    .when(!selected, (el) => el.hover((s) => s.bg(t.hover)))
    .when(pinned, (el) => el.border_1().border_color(t.accent))
    .when(Boolean(row.prompt), (el) => el.tooltip(row.prompt))
    .when(Boolean(click), (el) => el.id(`session-${row.id}`).cursor_pointer().on_click((_e, cx) => click(row.id, cx)))
    .child(ball(row.status, t))
    .child(div().min_w(0).truncate().text_color(dim ? t.dim : t.foreground).child(row.title))
    .when(Boolean(row.badge), (el) => el.child(badge(row.badge, t)))
    .when(Boolean(meta), (el) => el.child(meta))
    .child(div().flex_1())
    .child(age(pinned ? "pinned" : row.age, selected ? t.muted : t.dim));
}

export function subLine(sub, t, { indent = 30 }) {
  return h_flex().h(HEIGHT.sub).flex_none().items_center().gap(6).pl(indent + sub.lines.length * 10).pr(10).text_size(11.5)
    .tooltip(sub.badge ? `${sub.text}\nModel: ${sub.badge}` : sub.text)
    .child(ball(sub.status, t, 6))
    .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(sub.text))
    .when(Boolean(sub.badge), (el) => el.child(badge(sub.badge, t)))
    .when(Boolean(sub.age), (el) => el.child(age(sub.age, t.dim).text_size(11)));
}

export function bandLine(band, t, { indent = 10 }) {
  const parts = bandParts(band);
  return h_flex().h(HEIGHT.band).flex_none().pt(4).items_center().gap(8).pl(indent).pr(10).text_size(11).text_color(t.muted)
    .child(div().flex_none().child(band.label))
    .when(parts.length > 0, (el) => el.child(div().flex_none().text_color(t.dim).child(parts.join(" "))))
    .child(div().flex_1().h(1).bg(t.border));
}

export const chip = (p, t) =>
  h_flex().gap(4).items_center().text_size(11).text_color(tone(p.status, t)).child(ball(p.status, t)).child(div().child(String(p.n)));

const chips = (repo, t) => h_flex().gap(8).items_center().flex_none().children(summaryParts(repo).map((p) => chip(p, t)));

export function repoLine(repo, t, { folded, selected, click = null }) {
  return h_flex().h(HEIGHT.repo).flex_none().items_center().gap(8).px(10).rounded(6).text_size(13)
    .when(selected, (el) => el.bg(t.selected))
    .when(!selected, (el) => el.hover((s) => s.bg(t.hover)))
    .when(Boolean(click), (el) => el.id(`repo-${repo.root}`).cursor_pointer().on_click((_e, cx) => click(`repo:${repo.root}`, cx)))
    .child(div().w(10).flex_none().text_size(11).text_color(t.dim).child(folded ? "▸" : "▾"))
    .child(div().min_w(0).truncate().font_semibold().text_color(t.foreground).child(repo.name))
    .child(div().flex_1())
    .child(chips(repo, t));
}

export function summaryLine(repo, t, { selected, click = null }) {
  const parts = summaryParts(repo);
  return h_flex().h(HEIGHT.summary).flex_none().items_center().gap(10).pl(14).pr(10).rounded(6).text_size(12)
    .when(selected, (el) => el.bg(t.selected))
    .when(!selected, (el) => el.hover((s) => s.bg(t.hover)))
    .when(Boolean(click), (el) => el.id(`summary-${repo.root}`).cursor_pointer().on_click((_e, cx) => click(`repo:${repo.root}`, cx)))
    .child(div().w(118).flex_none().truncate().text_color(t.muted).child(repo.name))
    .children(parts.map((p) => h_flex().gap(4).items_center().flex_none().text_size(11).text_color(tone(p.status, t))
      .child(ball(p.status, t, 6)).child(div().child(`${p.n} ${p.label}`))))
    .when(parts.length === 0, (el) => el.child(div().text_size(11).text_color(t.dim).child("no sessions")));
}

export const dividerLine = (text, t) => h_flex().h(HEIGHT.divider).flex_none().pt(10).items_center().gap(8).pl(10).pr(10).text_size(11).text_color(t.dim)
  .child(div().flex_none().child(text)).child(div().flex_1().h(1).bg(t.border));

export const emptyLine = (text, t) => h_flex().h(HEIGHT.empty).flex_none().items_center().px(14).text_size(12).text_color(t.dim).child(text);

export function drawItem(item, t, { cursor, deep = false, click = null, pinned = null }) {
  const selected = cursor === item.key;
  switch (item.type) {
    case "repo": return repoLine(item.repo, t, { folded: item.folded, selected, click });
    case "band": return bandLine(item.band, t, { indent: deep ? 24 : 10 });
    case "session": return sessionLine(item.row, t, { selected, indent: deep ? 32 : 14, click, pinned: item.row.id === pinned });
    case "sub": return subLine(item.sub, t, { indent: deep ? 48 : 30 });
    case "summary": return summaryLine(item.repo, t, { selected, click });
    case "divider": return dividerLine(item.text, t);
    default: return emptyLine(item.text ?? "", t);
  }
}
