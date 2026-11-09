// The rail: a tile per repo with its agent counts, a + tile, then ? and the gear. It
// also owns the keyboard cycle and the jump chords, because a hidden board receives no
// key commands: keys.json binds them to this mod's commands (focus, next, prev), and the
// rail shows, folds or focuses the board (lib/focus.js decides which). The board answers
// through shared values:
//   nebula.boardKeys    true while the board has the keyboard (the board writes it)
//   nebula.focusBoard   a token the rail changes to ask the board for the keyboard
//   nebula.launched     a token the dialogs change after a launch from the board
//   nebula.repo         the selected repo's folder
import { svg, div, Background, PathBuilder } from "gpui-kit";
import { v_flex } from "gpui-base";
import {
  theme, run, shared, setShared, exec, terminals, focused, panes, layout, openOverlay, nextCommand,
} from "herdr";
import { groupSessions } from "./lib/projects.js";
import { step, findNode, FOLDED, TERMINAL, BOARD } from "./lib/focus.js";
import { STORE, projectList, railTiles, reposWith, rootsKey, listCheckouts, initials, jumpTarget, statusTarget } from "./lib/repos.js";
import { REPO, FOCUS_BOARD, LAUNCHED, BOARD_KEYS } from "./lib/shared.js";
import { chip } from "./views/row.js";
import { mergeSettings, tileColors } from "./lib/settings.js";
import { SETTINGS } from "./lib/shared.js";

// A 40px rounded square (radius 9) for the gradient tile, built once.
const TILE = 40, R = 9;
const TILE_PATH = PathBuilder.fill().move_to(R, 0).line_to(TILE - R, 0).arc_to(R, R, 0, false, true, TILE, R)
  .line_to(TILE, TILE - R).arc_to(R, R, 0, false, true, TILE - R, TILE).line_to(R, TILE).arc_to(R, R, 0, false, true, 0, TILE - R)
  .line_to(0, R).arc_to(R, R, 0, false, true, R, 0).close().build();

const boardShown = () => findNode(layout(), "board")?.hidden !== true;
const store = () => shared(STORE) ?? {};
const STATUS_WORDS = { needs: "need you", working: "working", unseen: "done, not seen yet", seen: "done and seen" };

export class Rail {
  init(cx) {
    this.checkouts = {};
    this.rootsKey = "";
    this.state = boardShown() ? TERMINAL : FOLDED;
    this.shown = boardShown();
    this.keys = shared(BOARD_KEYS) === true;
    this.launched = shared(LAUNCHED);
    cx.spawn(async (cx) => {
      for (;;) {
        const c = String(await nextCommand()).replace(/^nebula\./, "");
        if (c === "focus") this.send({ type: "chord" }, cx);
        else if (c === "next" || c === "prev") this.jump(c === "next" ? 1 : -1);
        cx.notify();
      }
    });
    cx.timer.every(200, (cx) => this.watch(cx));
    cx.timer.every(10000, (cx) => this.refresh(cx));
    this.refresh(cx);
  }

  repos() { return reposWith(store(), this.checkouts); }

  refresh(cx) {
    if (this.busy) return;
    this.busy = true;
    const roots = projectList(store()).map((p) => p.root), key = rootsKey(store());
    let changed = key !== this.rootsKey;
    this.rootsKey = key;
    cx.spawn(async (cx) => {
      const lists = await Promise.all(roots.map((root) => listCheckouts(exec, root)));
      roots.forEach((root, i) => {
        if (lists[i] && JSON.stringify(this.checkouts[root]) !== JSON.stringify(lists[i])) { this.checkouts[root] = lists[i]; changed = true; }
      });
      this.busy = false;
      if (changed) cx.notify();
    });
  }

  watch(cx) {
    if (this.state !== BOARD) this.lastPane = focused()?.pane ?? this.lastPane;
    if (rootsKey(store()) !== this.rootsKey) this.refresh(cx);
    const shown = boardShown(), keys = shared(BOARD_KEYS) === true, launched = shared(LAUNCHED);
    if (shown !== this.shown) { this.shown = shown; this.send({ type: "visible", shown }, cx); }
    if (keys !== this.keys) { this.keys = keys; this.send({ type: "keys", board: keys }, cx); }
    if (launched !== this.launched) { this.launched = launched; this.send({ type: "launch" }, cx); }
  }

  send(ev, cx) {
    const { state, act } = step(this.state, ev);
    this.state = state;
    if (act === "show-board") { run("layout.show", { id: "board" }); this.pull(); }
    else if (act === "focus-board") this.pull();
    else if (act === "fold") { run("layout.hide", { id: "board" }); this.toTerminal(); }
    else if (act === "focus-terminal") this.toTerminal();
    cx.notify();
  }

  pull() { setShared(FOCUS_BOARD, Math.random()); }

  toTerminal() {
    if (this.lastPane && panes().some((p) => p.pane === this.lastPane)) run("pane.focus", { pane: this.lastPane });
  }

  jump(dir) {
    const f = focused();
    const to = jumpTarget(terminals(), this.repos(), f?.terminal ?? f?.agent ?? null, dir);
    if (to) run("agent.focus", { terminal: to });
  }

  showStatus(root, status) {
    setShared(REPO, root);
    const f = focused();
    const to = statusTarget(terminals(), this.repos(), root, status, f?.terminal ?? f?.agent ?? null);
    if (to) run("agent.focus", { terminal: to });
  }

  openBox(role, width, height) {
    openOverlay({ mod: "nebula-box", kind: "dialog", modal: true, width, height, props: { role } });
  }

  tile(p, i, selected) {
    const t = theme();
    return v_flex().id(`tile-${p.root}`).items_center().gap(6).cursor_pointer().tooltip(p.name)
      .on_click(() => setShared(REPO, p.root))
      .on_mouse_down("right", () => openOverlay({ mod: "nebula-box", kind: "dialog", modal: true, width: 440, height: 200, props: { role: "remove-project", root: p.root, name: p.name } }))
      .child(this.face(p, i, selected, t))
      .child(v_flex().items_center().gap(2).children(p.counts.map((c) =>
        div().id(`count-${p.root}-${c.status}`).px(4).rounded(4).cursor_pointer().hover((st) => st.bg(t.hover))
          .tooltip(`${c.n} ${STATUS_WORDS[c.status]}: click to show ${c.n > 1 ? "the next one" : "it"}`)
          .on_click((_e, cx) => { cx.stop_propagation(); this.showStatus(p.root, c.status); })
          .child(chip(c, t)))));
  }

  // The tile itself: a gradient from the project's name (Experimental setting, on by
  // default) or the plain raised square. The selected tile gets an accent ring.
  face(p, i, selected, t) {
    const label = div().text_size(12).font_semibold().child(initials(p.name));
    if (!mergeSettings(shared(SETTINGS)).gradientTiles) {
      return div().size(TILE).rounded(R).flex().items_center().justify_center().border_1()
        .border_color(selected ? t.accent : t.border).bg(t.raised).text_color(selected ? t.foreground : t.muted).child(label);
    }
    const [a, b] = tileColors(i);
    const paint = globalThis.window.paint_path(TILE_PATH, Background.linear_gradient(135, t[a] ?? t.accent, t[b] ?? t.raised));
    return div().size(TILE + 6).rounded(R + 3).flex().items_center().justify_center().border_2()
      .border_color(selected ? t.accent : t.chrome)
      .child(div().relative().size(TILE).rounded(R).flex().items_center().justify_center()
        .child(div().absolute().top(0).left(0).size(TILE).child(paint))
        .child(label.relative().text_color(t.background).opacity(selected ? 1 : 0.85)));
  }

  render() {
    const t = theme();
    const tiles = railTiles(groupSessions(terminals(), this.repos()));
    const selected = shared(REPO) ?? tiles[0]?.root;
    const small = (id, tip, action, child) => div().id(id).size(32).flex().items_center().justify_center().rounded(8)
      .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground)).cursor_pointer().tooltip(tip)
      .on_click(action).child(child);
    return v_flex().size_full().bg(t.chrome).items_center().gap(16).pt(10).pb(12)
      .child(v_flex().id("tiles").flex_1().min_h(0).w_full().items_center().gap(16).overflow_y_scrollbar()
        .children(tiles.map((p, i) => this.tile(p, i, p.root === selected)))
        .child(div().id("add-repo").size(40).flex_none().rounded(9).flex().items_center().justify_center()
          .text_color(t.dim).text_size(18).hover((s) => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
          .tooltip("Add a repo").on_click(() => this.openBox("add", 460, 240)).child("+")))
      .child(v_flex().gap(4).items_center()
        .child(small("help", "Shortcuts", () => this.openBox("help", 560, 460), div().text_size(14).child("?")))
        .child(small("settings", "Settings", () => this.openBox("settings", 580, 660), svg("mods/workspace-chrome/settings.svg").size(15))));
  }
}
