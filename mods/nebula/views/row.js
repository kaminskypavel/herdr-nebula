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
import { pulseOf, nudging } from "../lib/attention.js";
import { animate, reduced, BOB, BREATHE, NUDGE, STAR, STAR_MS } from "../lib/motion.js";
import { rowLook } from "../lib/rowstyle.js";
import { fs, rh } from "../lib/scale.js";
import { portUrl } from "../lib/ports.js";

const PORTS_SHOWN = 3;

// Row heights, for the virtual lists, which place rows by stated sizes.
// `sessionTall` is a session row with the prompt line under its title.
export const HEIGHT = { repo: 28, band: 32, session: 26, sessionTall: 42, vacant: 26, sub: 22, shelf: 24, empty: 40 };

// The stated height of an item in a virtual list; opts: { promptLine } (the setting).
export const itemHeight = (item, opts = {}) =>
  rh(item.type === "session" && rowText(item.row, opts.promptLine !== false).sub ? HEIGHT.sessionTall : HEIGHT[item.type]);

const tone = (status, t) => t[COLOR[status]] ?? t.unknown;

// `hollow` (an archived session) draws a ring instead of a filled dot. A `fresh` dot (a state only seconds
// old: needs you, working, an unseen finish) pulses for those seconds (lib/attention.js).
export function ball(status, t, size = 8, hollow = false, fresh = false) {
  const b = div()
    .size(size)
    .rounded_full()
    .flex_none()
    .when(hollow, (el) => el.border(1.5).border_color(tone(status, t)))
    .when(!hollow, (el) => el.bg(tone(status, t)));
  const pulse = hollow ? null : pulseOf(status, fresh);
  return pulse ? animate(b, (el) => el.loop("opacity", pulse)) : b;
}

// A working row's dot: Claude Code's star spinner in the working color, in the same box as the dot. Still
// (the plain dot) when the row is archived or motion is reduced.
export function rowDot(row, t, size = 8) {
  if (row.status !== "working" || row.archived || reduced()) return ball(row.status, t, size, row.archived, row.fresh);
  return div().size(size).flex_none().flex().items_center().justify_center().text_size(fs(11)).line_height(1).text_color(t.ansi3).frames(STAR, STAR_MS);
}

// The color of a row's age: red for needs you, cyan for an unseen finish, else `plain` (what the view uses).
export const ageColor = (look, t, plain) => (look.ageTone === "needs" ? t.ansi1 : look.ageTone === "unseen" ? t.ansi6 : plain);

// The right-hand words of a row; `moon` puts a small moon before them (an asleep agent); `bold` for needs you.
const age = (text, color, moon = false, bold = false) =>
  h_flex()
    .flex_none()
    .items_center()
    .gap(4)
    .text_size(fs(12))
    .text_color(color)
    .when(bold, (el) => el.font_semibold())
    .when(moon, (el) => el.child(svg("mods/nebula/icons/moon.svg").size(11).flex_none()))
    .child(text);

// The agent's icon; while the row works it bobs 2px up and down, on a wrapper so the line does not move.
const agentGlyph = (row, icon, t) => {
  const glyph = svg(icon).size(12).flex_none().text_color(t.muted);
  if (row.status !== "working" || row.archived) return glyph;
  return animate(div().relative().size(12).flex_none().child(glyph), (el) => el.loop("top", BOB));
};

// The agent's icon (12px, muted like the text) and its model and effort; null when there is nothing to say,
// and when the row is neither selected nor running something other than its project's usual agent and
// model (lib/rowmeta.js stampOdd): the common case stays quiet. The text shrinks and truncates, so a long
// value never pushes the age off.
export function metaLine(row, t, size = 12, selected = false) {
  if (!selected && !row.metaOdd) return null;
  const { icon, text } = rowMeta(row);
  if (!icon && !text) return null;
  return h_flex()
    .min_w(0)
    .items_center()
    .gap(5)
    .text_size(fs(size))
    .text_color(t.muted)
    .when(Boolean(icon), (el) => el.child(agentGlyph(row, icon, t)))
    .when(Boolean(text), (el) => el.child(div().min_w(0).truncate().child(text)));
}

// A session's title, colored by its state (lib/rowstyle.js): red and bold when it needs you, bold when it
// finished unseen, muted once seen, dim when exited or archived. An archived one is italic with an archive icon before it.
const TITLE_COLOR = { needs: "ansi1", unseen: "foreground", seen: "muted", plain: "foreground", dim: "dim" };
export function title(row, t, look = rowLook(row)) {
  const text = div()
    .min_w(0)
    .truncate()
    .text_color(t[TITLE_COLOR[look.title]])
    .when(look.title === "needs" || look.title === "unseen", (el) => el.font_semibold())
    .when(row.archived, (el) => el.italic())
    .child(row.title);
  return row.archived
    ? h_flex().min_w(0).items_center().gap(5).child(svg("mods/nebula/icons/archive.svg").size(12).flex_none().text_color(t.dim)).child(text)
    : text;
}

// The ports a session listens on as links (":3000 :5173"), for the plain views (Cards, Columns), or null.
// A click opens localhost:<port> and stops there, so the row under it does not open the agent too.
export function portLinks(row, t, open, size = 11) {
  const ports = (row.ports ?? []).slice(0, PORTS_SHOWN);
  if (!ports.length) return null;
  return h_flex()
    .flex_none()
    .gap(6)
    .text_size(fs(size))
    .children(
      ports.map((p) =>
        div()
          .id(`port-${row.id}-${p}`)
          .text_color(t.accent)
          .cursor_pointer()
          .hover((s) => s.underline())
          .tooltip(`Open ${portUrl(p)}`)
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click((_e, cx) => {
            cx.stop_propagation();
            open(p, cx);
          })
          .child(`:${p}`),
      ),
    );
}

// A session's ports at the right end of its row in Tree and List, in fixed-width cells: those lists
// take no handler inside a row, so the board finds the port a click hit by its distance from the
// list's right edge (lib/ports.js portAt, with PORT_HIT). Cards and Columns use portLinks.
const LIST_PAD = 8, // virtualList's px
  ROW_PAD = 10, // sessionLine's pr
  CELL = 42,
  CELL_GAP = 4;
export const PORT_HIT = () => ({ inset: LIST_PAD + ROW_PAD, width: rh(CELL), gap: CELL_GAP, shown: PORTS_SHOWN });

function portCells(row, t) {
  const ports = (row.ports ?? []).slice(0, PORTS_SHOWN);
  if (!ports.length) return null;
  return h_flex()
    .flex_none()
    .gap(CELL_GAP)
    .text_size(fs(11))
    .children(
      ports.map((p) =>
        div()
          .w(rh(CELL))
          .flex()
          .justify_end()
          .text_color(t.accent)
          .cursor_pointer()
          .hover((s) => s.underline())
          .tooltip(`Open ${portUrl(p)}`)
          .child(`:${p}`),
      ),
    );
}

// A row that just began needing you wiggles sideways for its first moments (lib/attention.js nudging).
export const nudged = (el, row, now = Date.now()) => (nudging(row, now) ? animate(el.relative(), (e) => e.loop("left", NUDGE)) : el);

export const badge = (text, t) => div().flex_none().px(4).rounded(3).border(1).border_color(t.border).text_size(fs(11)).text_color(t.muted).child(text);

// A 3px bar down the left edge of a row, inset 6px top and bottom: red for needs you, the accent for the
// selected row. `height` is the row's own (the lists state it), so the bar needs no stretch from its parent.
const CONTENT_W = 560; // the widest a session row's content gets (Tree and List)

// The bar of a row that needs you breathes (`breathe`: while nobody is looking at it).
export const breathing = (bar, breathe) => (breathe ? animate(bar, (el) => el.loop("opacity", BREATHE)) : bar);

const edgeBar = (color, height, breathe = false) =>
  breathing(
    div()
      .absolute()
      .left(0)
      .top(6)
      .h(Math.max(4, height - 12))
      .w(3)
      .rounded(2)
      .bg(color),
    breathe,
  );

export function sessionLine(row, t, { selected, indent = 14, click = null, pinned = false, promptLine = true, viewing = new Set() }) {
  const meta = metaLine(row, t, 12, selected),
    ports = portCells(row, t),
    look = rowLook(row);
  const text = rowText(row, promptLine);
  const height = rh(text.sub ? HEIGHT.sessionTall : HEIGHT.session);
  // Needs you wins the left edge; a selected row then shows the fill and an accent outline instead of the accent bar.
  const outline = pinned || (selected && look.bar === "needs");
  return h_flex()
    .relative()
    .h(height)
    .flex_none()
    .items_center()
    .gap(10)
    .pl(indent)
    .pr(10)
    .rounded(6)
    .text_size(fs(13))
    .when(selected, (el) => el.bg(t.selected))
    .when(!selected, (el) => el.hover((s) => s.bg(t.hover)))
    .when(outline, (el) => el.border_1().border_color(t.accent))
    .when(Boolean(row.prompt), (el) => el.tooltip(row.prompt))
    .when(Boolean(click), (el) =>
      el
        .id(`session-${row.id}`)
        .cursor_pointer()
        .on_click((_e, cx) => click(row.id, cx)),
    )
    .when(look.bar === "needs", (el) => el.child(edgeBar(t.ansi1, height, !viewing.has(row.id))))
    .when(selected && look.bar !== "needs", (el) => el.child(edgeBar(t.accent, height)))
    .child(
      // The content stops at CONTENT_W so the age sits near the title on a wide board; the row's fill still spans.
      // The ports stay at the row's right edge (the lists find a clicked port by its distance from there).
      nudged(h_flex(), row)
        .w_full()
        .min_w(0)
        .max_w(rh(CONTENT_W))
        .items_center()
        .gap(10)
        .child(rowDot(row, t))
        .child(
          v_flex()
            .flex_1()
            .min_w(0)
            .child(
              h_flex()
                .min_w(0)
                .items_center()
                .gap(10)
                .child(title({ ...row, title: text.title }, t, look))
                .when(Boolean(row.badge), (el) => el.child(badge(row.badge, t)))
                .when(Boolean(meta), (el) => el.child(meta)),
            )
            .when(Boolean(text.sub), (el) => el.child(div().min_w(0).truncate().text_size(fs(12)).text_color(t.muted).child(text.sub))),
        )
        .child(
          pinned && look.ageTone !== "needs" ? age("pinned", t.muted) : age(look.ageText, ageColor(look, t, t.muted), row.asleep, look.ageTone === "needs"),
        ),
    )
    .when(Boolean(ports), (el) => el.child(div().ml_auto().child(ports)));
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
    .text_size(fs(12))
    .text_color(t.muted)
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
    .text_size(fs(12))
    .tooltip(sub.badge ? `${sub.text}\nModel: ${sub.badge}` : sub.text)
    .child(ball(sub.status, t, 6))
    .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(sub.text))
    .when(Boolean(sub.badge), (el) => el.child(badge(sub.badge, t)))
    .when(Boolean(sub.age), (el) => el.child(age(sub.age, t.muted).text_size(fs(11))));
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
    .text_size(fs(11))
    .text_color(t.muted)
    .child(div().flex_none().child(text))
    .child(div().flex_1().h(1).bg(t.border));

export const emptyLine = (text, t) => h_flex().h(rh(HEIGHT.empty)).flex_none().items_center().px(14).text_size(fs(12)).text_color(t.muted).child(text);

export function drawItem(item, t, { cursor, deep = false, click = null, pinned = null, promptLine = true, viewing }) {
  const selected = cursor === item.key;
  switch (item.type) {
    case "repo":
      return repoLine(item.repo, t, { folded: item.folded, selected, click });
    case "band":
      return bandLine(item.band, t, { indent: deep ? 24 : 10, folded: item.folded, click });
    case "session":
      return sessionLine(item.row, t, { selected, indent: deep ? 32 : 14, click, pinned: item.row.id === pinned, promptLine, viewing });
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
