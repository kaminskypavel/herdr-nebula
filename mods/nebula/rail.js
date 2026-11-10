// The icon bar: Board (shows or folds the board, the focus key's job), then the project tabs like a
// vertical workspace switcher (All, the open projects in their shared order with a status dot, and +
// for the projects picker), then New window, Help and Settings pinned at the bottom. The project list
// scrolls when it does not fit. A click selects a project (shared nebula.repo, which the board follows);
// a right-click opens a menu with Close. It also owns the keyboard cycle and the jump chords, because a hidden board receives no key commands:
// keys.json binds them to this mod's commands (focus, next, prev, jump), and the rail shows,
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
  theme,
  run,
  shared,
  setShared,
  exec,
  terminals,
  agents,
  focused,
  panes,
  spaces,
  layout,
  openOverlay,
  closeOverlay,
  nextCommand,
  notify,
  settings,
} from "herdr";
import { putToSleep } from "./sleeper.js";
import { trackIdle, sleepDue, SWEEP_MS, TRACK_MS } from "./lib/sleep.js";
import { mergeSettings } from "./lib/settings.js";
import { groupSessions } from "./lib/projects.js";
import { flatten } from "./lib/order.js";
import { statusOf } from "./lib/status.js";
import { step, findNode, FOLDED, TERMINAL, BOARD } from "./lib/focus.js";
import { STORE, projectList, reposWith, rootsKey, listCheckouts, jumpTarget } from "./lib/repos.js";
import { pickerHeight, summarize, currentOpen, closedNeeding } from "./lib/open.js";
import { buildBoard } from "./lib/viewmodel.js";
import { railTabs, tabHint, pillText, passFocusOn } from "./lib/rail.js";
import { landing, rootOf } from "./lib/tabs.js";
import { focusCommand } from "./lib/preview.js";
import { iconFor } from "./lib/icons.js";
import { projectIcon } from "./lib/icon-view.js";
import { ball } from "./views/row.js";
import { FOCUS_BOARD, LAUNCHED, BOARD_KEYS, OPEN, REPO, ICONS, ALL, SETTINGS, PINNED, PINNED_PROJECTS } from "./lib/shared.js";
import { fs, setTextScale } from "./lib/scale.js";
import { setReduceMotion, animate, markerTops, FADE, SPRING } from "./lib/motion.js";
import { jumpSize } from "./lib/jump.js";
import { HELP_SIZE } from "./lib/hints.js";
import { NOTHING_WAITING } from "./lib/flash.js";

// The bar's width (layouts/nebula.json rail-col): 76 leaves the macOS window buttons room, as Herdr's own folded sidebar does.
const RAIL_W = 76;
const REPICK_MS = 250; // after a project pick, when the bar shows its agent once more (see pick)
const PIN_ICON = "mods/nebula/icons/pin.svg";
const ICON = 32; // a project icon's size inside its 42px button

const boardShown = () => findNode(layout(), "board")?.hidden !== true;
const store = () => shared(STORE) ?? {};
const PINS_KEY = "pinnedProjects";
function savedPins() {
  try {
    const v = JSON.parse(localStorage.getItem(PINS_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((r) => typeof r === "string") : [];
  } catch {
    return [];
  }
}
const icon = (name) => `mods/nebula/icons/${name}.svg`;

export class Rail {
  init(cx) {
    this.checkouts = {};
    this.rootsKey = "";
    this.state = boardShown() ? TERMINAL : FOLDED;
    this.shown = boardShown();
    this.keys = shared(BOARD_KEYS) === true;
    this.launched = shared(LAUNCHED);
    // Pins outlive a restart: the rail keeps them in its localStorage and shares them with the project menu.
    if (!Array.isArray(shared(PINNED_PROJECTS))) setShared(PINNED_PROJECTS, savedPins());
    this.pinsKey = JSON.stringify(shared(PINNED_PROJECTS));
    this.lastIn = {}; // { [project root]: the terminal last focused there }, so picking the project goes back to it
    this.tabs = this.tabsNow();
    this.tabsKey = JSON.stringify([this.tabs, shared(ICONS), this.reduceMotion()]);
    cx.spawn(async (cx) => {
      for (;;) {
        const c = String(await nextCommand()).replace(/^nebula\./, "");
        if (c === "keys") this.send({ type: "chord" }, cx);
        else if (c === "focus") {
          // pane.go reached the icon bar: the board takes the keys. Not after a project pick: that
          // "focus" came from the click on the icon, and the keys belong to the agent it showed.
          if (passFocusOn({ pending: Boolean(this.repick), at: this.repickedAt, now: Date.now(), ms: REPICK_MS })) run("pane.go", { direction: "right" });
        } else if (c === "next" || c === "prev") this.jump(c === "next" ? 1 : -1);
        else if (c === "jump") this.openJump();
        else if (c === "new" && shared(BOARD_KEYS) !== true)
          openOverlay({ mod: "nebula-box", kind: "dialog", modal: true, width: 640, height: 520 }); // ⌘K from an agent: its project (the board opens it when it has the keys)
        else if (/^tab[1-9]$/.test(c)) this.pickTab(Number(c.slice(3))); // ⌘1 to ⌘9
        cx.notify();
      }
    });
    cx.timer.every(200, (cx) => this.watch(cx));
    cx.timer.every(10000, (cx) => this.refresh(cx));
    // Sleeping idle agents lives here because the rail is always mounted (the board may be folded).
    // Never during render: one timer keeps the idle clocks, a slower one sweeps.
    this.idle = new Map();
    this.since = {};
    cx.timer.every(TRACK_MS, () => this.trackIdle());
    cx.timer.every(SWEEP_MS, (cx) => this.sweepSleep(cx));
    this.refresh(cx);
  }

  // What the idle clock needs: every session row, and the terminals the user can see now
  // (the focused tab's, the focused one, the board's pin, Herdr's own pins).
  sleepView() {
    const model = buildBoard({ terminals: terminals(), agents: agents(), panes: panes(), spaces: spaces(), repos: this.repos() });
    const rows = model.repos.flatMap((r) => r.rows);
    const f = focused(),
      inView = new Set([
        f?.terminal,
        f?.shown,
        f?.agent,
        shared(PINNED),
        ...agents()
          .filter((a) => a.pinned)
          .map((a) => a.address),
      ]);
    for (const p of panes()) if (f && p.tab === f.tab && p.terminal) inView.add(p.terminal);
    return { rows, inView };
  }

  trackIdle() {
    const view = this.sleepView();
    const r = trackIdle(this.idle, view.rows, view.inView, Date.now());
    this.idle = r.state;
    this.since = r.since;
    return view;
  }

  // Stops the CLI of every agent that has been done, seen and out of view for the setting's minutes.
  sweepSleep(cx) {
    const minutes = mergeSettings(shared(SETTINGS)).sleepAfter;
    if (!(minutes > 0)) return;
    const { rows, inView } = this.trackIdle();
    const due = sleepDue(rows, { minutes, now: Date.now(), inView, pinned: shared(PINNED), since: this.since });
    if (!due.length) return;
    cx.spawn(async (cx) => {
      let n = 0;
      for (const id of due) if ((await putToSleep(id, cx)) === "asleep") n++;
      if (n)
        notify({
          title: n === 1 ? "Put 1 idle agent to sleep" : `Put ${n} idle agents to sleep`,
          body: "Enter on its row resumes it.",
          level: "info",
          timeout: 4000,
        });
    });
  }

  repos() {
    return reposWith(store(), this.checkouts);
  }

  reduceMotion() {
    return mergeSettings(shared(SETTINGS)).reduceMotion;
  }

  refresh(cx) {
    if (this.busy) return;
    this.busy = true;
    const roots = projectList(store()).map((p) => p.root),
      key = rootsKey(store());
    let changed = key !== this.rootsKey;
    this.rootsKey = key;
    cx.spawn(async (cx) => {
      const lists = await Promise.all(roots.map((root) => listCheckouts(exec, root)));
      roots.forEach((root, i) => {
        if (lists[i] && JSON.stringify(this.checkouts[root]) !== JSON.stringify(lists[i])) {
          this.checkouts[root] = lists[i];
          changed = true;
        }
      });
      this.busy = false;
      if (changed) cx.notify();
    });
  }

  watch(cx) {
    if (this.repick && Date.now() >= this.repick.at) {
      run(this.repick.c.name, this.repick.c.args);
      this.repick = null;
      this.repickedAt = Date.now();
    }
    if (this.hud && Date.now() > this.hud.until) {
      closeOverlay(this.hud.id);
      this.hud = null;
    }
    if (this.state !== BOARD) this.lastPane = focused()?.pane ?? this.lastPane;
    if (rootsKey(store()) !== this.rootsKey) this.refresh(cx);
    const shown = boardShown(),
      keys = shared(BOARD_KEYS) === true,
      launched = shared(LAUNCHED);
    if (shown !== this.shown) {
      this.shown = shown;
      this.send({ type: "visible", shown }, cx);
    }
    if (keys !== this.keys) {
      this.keys = keys;
      this.send({ type: "keys", board: keys }, cx);
    }
    if (launched !== this.launched) {
      this.launched = launched;
      this.send({ type: "launch" }, cx);
    }
    const pinsKey = JSON.stringify(shared(PINNED_PROJECTS) ?? []);
    if (pinsKey !== this.pinsKey) {
      this.pinsKey = pinsKey;
      localStorage.setItem(PINS_KEY, pinsKey);
    }
    this.tabs = this.tabsNow();
    const f = focused(),
      term = f?.terminal ?? f?.agent ?? null,
      root = term ? rootOf(this.model, term) : null;
    if (root) this.lastIn[root] = term;
    const tabsKey = JSON.stringify([this.tabs, shared(ICONS), this.reduceMotion()]);
    if (tabsKey !== this.tabsKey) {
      this.tabsKey = tabsKey;
      cx.notify();
    }
  }

  // The project tabs now: the open projects with their status, the selected one, and whether a closed
  // project needs you. Worked out here from the live sessions (the board's summary is stale while it is folded).
  tabsNow() {
    const model = buildBoard({ terminals: terminals(), agents: agents(), panes: panes(), spaces: spaces(), repos: this.repos() });
    this.model = model;
    const open = currentOpen(shared(OPEN), model, store());
    const pinned = shared(PINNED_PROJECTS) ?? [];
    return { ...railTabs({ summary: summarize(model), open, selected: shared(REPO), pinned }), open, plus: closedNeeding(model, open) };
  }

  send(ev, cx) {
    const { state, act } = step(this.state, ev);
    this.state = state;
    if (act === "show-board") {
      run("layout.show", { id: "board" });
      this.pull();
    } else if (act === "focus-board") this.pull();
    else if (act === "fold") {
      run("layout.hide", { id: "board" });
      this.toTerminal();
    } else if (act === "focus-terminal") this.toTerminal();
    cx.notify();
  }

  pull() {
    setShared(FOCUS_BOARD, Math.random());
  }

  toTerminal() {
    if (this.lastPane && panes().some((p) => p.pane === this.lastPane)) run("pane.focus", { pane: this.lastPane });
  }

  jump(dir) {
    const f = focused();
    const to = jumpTarget(terminals(), this.repos(), f?.terminal ?? f?.agent ?? null, dir);
    if (to) run("agent.focus", { terminal: to });
    else notify({ title: NOTHING_WAITING, level: "info", timeout: 2000 }); // the board may be folded, so no status line to say it
  }

  // The jump palette over every project, from anywhere (the board's `/` opens the same one).
  openJump() {
    const size = jumpSize();
    openOverlay({ mod: "nebula-box", kind: "dialog", width: size.width, height: size.height, props: { role: "jump" } });
  }

  // Opens a second Herdr window on the same core. exec's env may lack node, so give the
  // shell the usual bin dirs; the command prints one line, which becomes the toast.
  newWindow(cx) {
    cx.spawn(async () => {
      let line = "Could not open a second window.",
        level = "error";
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
    if (boardShown()) {
      run("layout.hide", { id: "board" });
      this.toTerminal();
    } // watch() sees the fold and updates the state
    else this.send({ type: "chord" }, cx);
  }

  // Switches to a project, like switching a workspace: the board shows it, the main area its agent
  // (lib/tabs.js landing). A project with no live agent only changes the board. A click on the icon also
  // gives this bar the keyboard (mod.json makes the mod focusable), which raced the agent's focus and
  // left the old agent shown, so watch() asks once more a beat later and the bar ignores that "focus".
  pick(root) {
    setShared(REPO, root);
    const row = landing(this.model, root, this.lastIn[root]);
    if (!row) return;
    const c = focusCommand(row);
    run(c.name, c.args);
    this.repick = { c, at: Date.now() + REPICK_MS };
  }

  // ⌘1 to ⌘9: shows the nth project and flashes its name; a newer pick replaces the flash.
  pickTab(n) {
    const p = this.tabs.items[n - 1];
    if (!p) return;
    this.pick(p.root);
    const id = openOverlay({
      mod: "nebula-box",
      kind: "window",
      key: "nebula-hud",
      frame: "none",
      width: 300,
      height: 60,
      props: { role: "hud", root: p.root, name: p.name, n, at: Date.now() }, // `at` times the flash's fade in and out
    });
    this.hud = { id, until: Date.now() + 900 }; // watch() closes it
  }

  openProjects() {
    openOverlay({
      mod: "nebula-box",
      kind: "popup",
      at: "pointer",
      width: 320,
      height: pickerHeight(projectList(store()).length),
      props: { role: "projects" },
    });
  }

  // One button. opts: { on (lit: the board is shown, or this tab is selected), dot (a red dot: something needs you),
  // mark (an accent bar on the bar's left edge while on; the project tabs use the marker instead), size (default 32), menu (a right-click handler),
  // num (the ⌘ number, on a small chip in the icon's top-left corner, opposite the status dot) }.
  button(t, id, tip, action, child, { on = false, dot = false, mark = false, size = 32, menu = null, num = null } = {}) {
    return div()
      .id(id)
      .relative()
      .size(size)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(8)
      .cursor_pointer()
      .tooltip(tip)
      .text_color(on ? t.foreground : t.muted)
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover).text_color(t.foreground)))
      .when(Boolean(menu), (el) => el.on_mouse_down("right", menu))
      .on_click(action)
      .child(child)
      .when(on && mark, (el) =>
        el.child(
          div()
            .absolute()
            .left((size - RAIL_W) / 2)
            .top((size - 16) / 2)
            .w(3)
            .h(16)
            .rounded(2)
            .bg(t.accent),
        ),
      )
      .when(num !== null, (el) =>
        el.child(
          div()
            .absolute()
            .left(Math.max(0, (size - ICON) / 2) - 2)
            .top(Math.max(0, (size - ICON) / 2) - 2)
            .min_w(13)
            .h(13)
            .px(2)
            .rounded(3)
            .bg("#00000073")
            .flex()
            .items_center()
            .justify_center()
            .text_size(fs(11))
            .text_color(on ? t.foreground : t.muted)
            .child(String(num)),
        ),
      )
      .when(dot, (el) => el.child(div().absolute().top(5).right(5).size(7).rounded_full().bg(t.ansi1).border_1().border_color(t.chrome)));
  }

  projectMenu(p, open, selected) {
    openOverlay({
      mod: "nebula-box",
      kind: "popup",
      at: "pointer",
      width: 190,
      height: 103,
      props: { role: "project-menu", root: p.root, name: p.name, open, selected, pinned: p.pinned },
    });
  }

  // The project tabs: pinned ones first, each with a pin on its corner, and a short line under them
  // when unpinned ones follow.
  pinTray(t, tabs, selected) {
    return tabs.items.flatMap((p, i) => {
      const tab = this.projectTab(t, p, { open: tabs.open, selected, n: i + 1 });
      const last = p.pinned && tabs.items[i + 1] && !tabs.items[i + 1].pinned;
      return last ? [tab, div().flex_none().w(24).h(1).my(2).bg(t.border)] : [tab];
    });
  }

  // A project's tab: its icon (the shared picture or initials) with the status dot at the corner, or,
  // when agents there need you, a red pill with how many.
  projectTab(t, p, { open, selected, n }) {
    const icons = shared(ICONS) ?? {},
      hint = tabHint(p.name, n),
      ring = p.on ? t.selected : t.chrome;
    const face = projectIcon({ icon: iconFor(icons, p.root, p.name), size: ICON, badge: p.needs > 0 ? null : ball(p.status, t, 8), ring });
    const icon =
      p.needs > 0
        ? div()
            .relative()
            .size(32)
            .flex_none()
            .child(face)
            .child(
              div()
                .absolute()
                .right(-7)
                .bottom(-6)
                .h(17)
                .min_w(17)
                .px(4)
                .rounded_full()
                .bg(t.ansi1)
                .border_1()
                .border_color(ring)
                .flex()
                .items_center()
                .justify_center()
                .text_size(fs(11))
                .font_semibold()
                .text_color("#ffffff")
                .child(pillText(p.needs)),
            )
        : face;
    const shown = p.pinned
      ? div()
          .relative()
          .size(ICON)
          .flex_none()
          .child(icon)
          .child(
            div()
              .absolute()
              .right(-4)
              .top(-4)
              .size(14)
              .rounded_full()
              .bg(ring)
              .flex()
              .items_center()
              .justify_center()
              .child(svg(PIN_ICON).size(9).text_color(t.accent)),
          )
      : icon;
    return this.button(t, `proj-${p.root}`, p.pinned ? `${hint.tip} · pinned` : hint.tip, () => this.pick(p.root), shown, {
      on: p.on,
      size: 42,
      num: hint.num,
      menu: () => this.projectMenu(p, open, selected),
    });
  }

  // The accent bar at the bar's left edge: one marker in the scrolling project list, so it scrolls with the tabs,
  // that springs to the selected tab and fades out when no project is selected (All has its own static bar).
  marker(t, tabs) {
    const at = tabs.items.findIndex((p) => p.on),
      tops = markerTops(tabs.items);
    if (at >= 0) this.markTop = tops[at];
    return animate(
      div()
        .id("rail-mark")
        .absolute()
        .left(0)
        .top(this.markTop ?? tops[0] ?? 0)
        .w(3)
        .h(16)
        .rounded(2)
        .bg(t.accent)
        .opacity(at >= 0 ? 1 : 0),
      (el) => el.spring("top", SPRING).transition("opacity", FADE),
    );
  }

  render() {
    setTextScale(settings());
    setReduceMotion(this.reduceMotion());
    const t = theme();
    const needs = flatten(groupSessions(terminals(), this.repos())).some((x) => statusOf(x) === "needs");
    const tabs = this.tabs,
      selected = tabs.items.find((p) => p.on)?.root ?? null;
    const b = (id, tip, action, name, opts) => this.button(t, id, tip, action, svg(icon(name)).size(16), opts);
    return (
      v_flex()
        .size_full()
        .bg(t.chrome)
        .items_center()
        .gap(4)
        .pt(6)
        .pb(10)
        .child(b("board", "Board (\u2303`)", (_e, cx) => this.toggleBoard(cx), "panel-left", { on: this.shown, dot: needs }))
        .when(tabs.items.length > 0, (el) =>
          el.child(this.button(t, "all", "All projects (0)", () => setShared(REPO, ALL), svg(icon("layout-grid")).size(16), { on: tabs.all, mark: true })),
        )
        // The project list scrolls when it is taller than the room; the + and the bottom group stay pinned.
        .child(
          v_flex()
            .id("rail-projects")
            .w_full()
            .min_h(0)
            .flex_shrink_1()
            .items_center()
            .gap(4)
            .overflow_y_scroll()
            .relative()
            .children(this.pinTray(t, tabs, selected))
            .child(this.marker(t, tabs)),
        )
        .child(this.button(t, "projects", "Open or close projects", () => this.openProjects(), svg(icon("plus")).size(16), { dot: tabs.plus }))
        .child(div().flex_1())
        .child(b("window", "New window", (_e, cx) => this.newWindow(cx), "copy"))
        .child(b("help", "Shortcuts", () => this.openBox("help", HELP_SIZE.width, HELP_SIZE.height), "circle-help"))
        .child(this.button(t, "settings", "Settings", () => this.openBox("settings", 580, 660), svg("mods/workspace-chrome/settings.svg").size(16)))
    );
  }
}
