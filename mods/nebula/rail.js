// The icon bar: Board (shows or folds the board, the focus key's job), then the project tabs like a
// vertical workspace switcher (All, the open projects in their shared order with a status dot, and +
// for the projects picker), then New window, Help and Settings pinned at the bottom. The project list
// scrolls when it does not fit. A click selects a project (shared nebula.repo, which the board follows);
// a right-click opens a menu with Close. It also owns the keyboard cycle and the jump chords, because a hidden board receives no key commands:
// keys.json binds them to this mod's commands (focus, next, prev), and the rail shows,
// folds or focuses the board (lib/focus.js decides which). The board answers through
// shared values:
//   nebula.boardKeys    true while the board has the keyboard (the board writes it)
//   nebula.focusBoard   a token the rail changes to ask the board for the keyboard
//   nebula.launched     a token the dialogs change after a launch from the board
// It reads nebula.open, nebula.repo and nebula.icons (the board and the picker write them) and works
// out each project's status itself, so the dots stay live while the board is folded.
import { svg, div } from "gpui-kit";
import { v_flex } from "gpui-base";
import {
  theme, run, shared, setShared, exec, terminals, agents, focused, panes, spaces, layout, openOverlay, closeOverlay, nextCommand, notify,
} from "herdr";
import { groupSessions } from "./lib/projects.js";
import { flatten } from "./lib/order.js";
import { statusOf } from "./lib/status.js";
import { step, findNode, FOLDED, TERMINAL, BOARD } from "./lib/focus.js";
import { STORE, projectList, reposWith, rootsKey, listCheckouts, jumpTarget } from "./lib/repos.js";
import { pickerHeight, summarize, currentOpen, closedNeeding } from "./lib/open.js";
import { buildBoard } from "./lib/viewmodel.js";
import { railTabs } from "./lib/rail.js";
import { iconFor } from "./lib/icons.js";
import { projectIcon } from "./lib/icon-view.js";
import { ball } from "./views/row.js";
import { FOCUS_BOARD, LAUNCHED, BOARD_KEYS, OPEN, REPO, ICONS, ALL } from "./lib/shared.js";

// The bar's width (layouts/nebula.json rail-col): 76 leaves the macOS window buttons room, as Herdr's own folded sidebar does.
const RAIL_W = 76;

const boardShown = () => findNode(layout(), "board")?.hidden !== true;
const store = () => shared(STORE) ?? {};
const icon = (name) => `mods/nebula/icons/${name}.svg`;

export class Rail {
  init(cx) {
    this.checkouts = {};
    this.rootsKey = "";
    this.state = boardShown() ? TERMINAL : FOLDED;
    this.shown = boardShown();
    this.keys = shared(BOARD_KEYS) === true;
    this.launched = shared(LAUNCHED);
    this.tabs = this.tabsNow();
    this.tabsKey = JSON.stringify([this.tabs, shared(ICONS)]);
    cx.spawn(async (cx) => {
      for (;;) {
        const c = String(await nextCommand()).replace(/^nebula\./, "");
        if (c === "focus") this.send({ type: "chord" }, cx);
        else if (c === "next" || c === "prev") this.jump(c === "next" ? 1 : -1);
        else if (/^tab[1-9]$/.test(c)) this.pickTab(Number(c.slice(3))); // ⌘1 to ⌘9
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
    if (this.hud && Date.now() > this.hud.until) { closeOverlay(this.hud.id); this.hud = null; }
    if (this.state !== BOARD) this.lastPane = focused()?.pane ?? this.lastPane;
    if (rootsKey(store()) !== this.rootsKey) this.refresh(cx);
    const shown = boardShown(), keys = shared(BOARD_KEYS) === true, launched = shared(LAUNCHED);
    if (shown !== this.shown) { this.shown = shown; this.send({ type: "visible", shown }, cx); }
    if (keys !== this.keys) { this.keys = keys; this.send({ type: "keys", board: keys }, cx); }
    if (launched !== this.launched) { this.launched = launched; this.send({ type: "launch" }, cx); }
    this.tabs = this.tabsNow();
    const tabsKey = JSON.stringify([this.tabs, shared(ICONS)]);
    if (tabsKey !== this.tabsKey) { this.tabsKey = tabsKey; cx.notify(); }
  }

  // The project tabs now: the open projects with their status, the selected one, and whether a closed
  // project needs you. Worked out here from the live sessions (the board's summary is stale while it is folded).
  tabsNow() {
    const model = buildBoard({ terminals: terminals(), agents: agents(), panes: panes(), spaces: spaces(), repos: this.repos() });
    const open = currentOpen(shared(OPEN), model, store());
    return { ...railTabs({ summary: summarize(model), open, selected: shared(REPO) }), open, plus: closedNeeding(model, open) };
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

  // Opens a second Herdr window on the same core. exec's env may lack node, so give the
  // shell the usual bin dirs; the command prints one line, which becomes the toast.
  newWindow(cx) {
    cx.spawn(async (cx) => {
      let line = "Could not open a second window.", level = "error";
      try {
        const r = await exec("/bin/sh", ["-c", 'PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" herdr-nebula window']);
        const out = r.stdout.trim() || r.stderr.trim();
        if (out) line = out.split("\n").pop();
        if (r.code === 0) level = "info";
      } catch {}
      notify({ title: line, level, timeout: 4000 });
    });
  }

  openBox(role, width, height) {
    openOverlay({ mod: "nebula-box", kind: "dialog", modal: true, width, height, props: { role } });
  }

  // The Board button: folds a shown board (the terminal gets the keys), else shows it with the keys.
  toggleBoard(cx) {
    if (boardShown()) { run("layout.hide", { id: "board" }); this.toTerminal(); } // watch() sees the fold and updates the state
    else this.send({ type: "chord" }, cx);
  }

  // ⌘1 to ⌘9: shows the nth project and flashes its name; a newer pick replaces the flash.
  pickTab(n) {
    const p = this.tabs.items[n - 1];
    if (!p) return;
    setShared(REPO, p.root);
    const id = openOverlay({ mod: "nebula-box", kind: "window", key: "nebula-hud", frame: "none", width: 300, height: 60, props: { role: "hud", root: p.root, name: p.name, n } });
    this.hud = { id, until: Date.now() + 900 }; // watch() closes it
  }

  openProjects() {
    openOverlay({ mod: "nebula-box", kind: "popup", at: "pointer", width: 320, height: pickerHeight(projectList(store()).length), props: { role: "projects" } });
  }

  // One button. opts: { on (lit: the board is shown, or this tab is selected), dot (a red dot: something needs you),
  // mark (an accent bar on the bar's left edge while on), size (default 32), menu (a right-click handler) }.
  button(t, id, tip, action, child, { on = false, dot = false, mark = false, size = 32, menu = null } = {}) {
    return div().id(id).relative().size(size).flex_none().flex().items_center().justify_center().rounded(8).cursor_pointer().tooltip(tip)
      .text_color(on ? t.foreground : t.muted)
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover).text_color(t.foreground)))
      .when(Boolean(menu), (el) => el.on_mouse_down("right", menu))
      .on_click(action).child(child)
      .when(on && mark, (el) => el.child(div().absolute().left((size - RAIL_W) / 2).top((size - 16) / 2).w(3).h(16).rounded(2).bg(t.accent)))
      .when(dot, (el) => el.child(div().absolute().top(5).right(5).size(7).rounded_full().bg(t.ansi1).border_1().border_color(t.chrome)));
  }

  projectMenu(p, open, selected) {
    openOverlay({ mod: "nebula-box", kind: "popup", at: "pointer", width: 190, height: 72, props: { role: "project-menu", root: p.root, name: p.name, open, selected } });
  }

  // A project's tab: its icon (the shared picture or initials) with the status dot at the corner.
  projectTab(t, p, { open, selected }) {
    const icons = shared(ICONS) ?? {};
    return this.button(t, `proj-${p.root}`, p.name, () => setShared(REPO, p.root),
      projectIcon({ icon: iconFor(icons, p.root, p.name), size: 32, badge: ball(p.status, t, 8), ring: p.on ? t.selected : t.chrome }),
      { on: p.on, mark: true, size: 42, menu: () => this.projectMenu(p, open, selected) });
  }

  render() {
    const t = theme();
    const needs = flatten(groupSessions(terminals(), this.repos())).some((x) => statusOf(x) === "needs");
    const tabs = this.tabs, selected = tabs.items.find((p) => p.on)?.root ?? null;
    const b = (id, tip, action, name, opts) => this.button(t, id, tip, action, svg(icon(name)).size(16), opts);
    return v_flex().size_full().bg(t.chrome).items_center().gap(4).pt(6).pb(10)
      .child(b("board", "Board (\u2303`)", (_e, cx) => this.toggleBoard(cx), "panel-left", { on: this.shown, dot: needs }))
      .when(tabs.items.length > 0, (el) => el.child(this.button(t, "all", "All projects (0)", () => setShared(REPO, ALL), svg(icon("layout-grid")).size(16), { on: tabs.all, mark: true })))
      // The project list scrolls when it is taller than the room; the + and the bottom group stay pinned.
      .child(v_flex().id("rail-projects").w_full().min_h(0).flex_shrink_1().items_center().gap(4).overflow_y_scroll()
        .children(tabs.items.map((p) => this.projectTab(t, p, { open: tabs.open, selected }))))
      .child(this.button(t, "projects", "Open or close projects", () => this.openProjects(), svg(icon("plus")).size(16), { dot: tabs.plus }))
      .child(div().flex_1())
      .child(b("window", "New window", (_e, cx) => this.newWindow(cx), "copy"))
      .child(b("help", "Shortcuts", () => this.openBox("help", 560, 460), "circle-help"))
      .child(this.button(t, "settings", "Settings", () => this.openBox("settings", 580, 660), svg("mods/workspace-chrome/settings.svg").size(16)));
  }
}
