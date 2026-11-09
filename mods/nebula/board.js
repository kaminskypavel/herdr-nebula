// The board column: the session views (Tree, Cards, List, Columns) and the keyboard.
// It also owns the focus handle the rail asks for, the 1px accent edge while it has the
// keys and the 0 to 9 tab keys (the project tabs themselves are in the icon bar, rail.js). Through
// shared values it talks to the rail:
//   nebula.boardKeys    true while the board has the keyboard (written here)
//   nebula.focusBoard   a token the rail changes to ask the board for the keyboard
//   nebula.launched     a token the dialogs change after a launch from the board
//   nebula.repo         the selected tab: a project's folder, or "all:" (the All tab; nothing stored is All too)
//   nebula.open         the open projects, in tab order (lib/open.js; started and pruned here, edited by the picker
//                       and the rail). The order is stable: picking a project does not move it.
//   nebula.icons        { [root]: { path, initials, color } } each project's icon (lib/icons.js; worked out here, read by the rail and picker)
//   nebula.rowAction    { id, action, n } the row menu sets; the board does the action
//   nebula.settings     the settings overlay writes it (lib/settings.js): the default view, whether `a` asks, the editor
//   nebula.resumed      { [nebulaId]: terminal } the nebula sessions this board resumed in Herdr (written here)
//   nebula.pinned       the terminal pinned beside the active tab, or null (written here; lib/pin.js edits the layout)
// Moving the cursor (j, k, arrows, the attention keys) only highlights a row; Enter or a
// double click shows the agent. The cursor is a session's address, never an index.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex, VirtualListScrollHandle, InputState, Input } from "gpui-base";
import {
  theme, shared, setShared, run, exec, watchFolder, home, appHome, terminals, agents, panes, spaces, setAgentOrder, openOverlay, layout, notify, focused,
} from "herdr";
import { STORE, projectList, reposWith, rootsKey, listCheckouts, commonDirOf } from "./lib/repos.js";
import { REFOCUS_MS, findNode } from "./lib/focus.js";
import { nebulaFiles, SQLITE } from "./lib/nebula-import.js";
import { nebulaBin, SESSIONS_ARGS, AGENTS_SQL, parseSessions, parseAgents, joinSessions, resumeArgv, recordResumed, resumedTerminal } from "./lib/nebula-sessions.js";
import { planLaunch, runSteps, placedSpaces } from "./lib/launch.js";
import { mergeSettings, cycleOf, VIEW_IDS, VIEW_TITLE } from "./lib/settings.js";
import { ALL, SUMMARY, REPO, SETTINGS, FOCUS_BOARD, BOARD_KEYS, ROW_ACTION, RESUMED, PINNED, OPEN, ICONS, HIDDEN } from "./lib/shared.js";
import { syncOpen, openProject, onlyOpen, pickerHeight, summarize } from "./lib/open.js";
import { buildIcons } from "./lib/icons.js";
import { pickIcon } from "./lib/icon-scan.js";
import { togglePin, pinnable, pinnedIn, pinGone, withPin } from "./lib/pin.js";
import { actionsFor, worktreeOffer, aloneInTab, tabCommand, editorCommand, whereIs } from "./lib/actions.js";
import {
  OTHER, NEW_SESSION, LABEL, buildBoard, stopsOf, stepCursor, placeCursor, attentionTarget, agentOrder, projectColumns, parseWt, objectsOnly,
} from "./lib/viewmodel.js";
import { arrange, cleanSort, SORTS, SORT_TITLE } from "./lib/arrange.js";
import { tabOf, scopeModel, tabKey, landOn, followFocus, foldAllState } from "./lib/tabs.js";
import * as tree from "./views/tree.js";
import * as cards from "./views/cards.js";
import * as list from "./views/list.js";
import * as columns from "./views/columns.js";

const VIEWS = [
  { id: "tree", view: tree, virtual: true },
  { id: "cards", view: cards },
  { id: "list", view: list, virtual: true },
  { id: "columns", view: columns },
];
const viewOf = (id) => VIEWS.find((v) => v.id === id) ?? VIEWS[0];

const ROW_KEYS = { r: "rename", a: "archive", u: "unarchive", d: "delete" };
const rowActionOf = (k, m) => {
  if (k === "enter") return m.shift ? "folder" : null;
  if (k === "P" || (k === "p" && m.shift)) return "relaunch";
  return m.shift ? null : ROW_KEYS[k] ?? null;
};

const COLUMN_TYPES = ["project", "worktree", "session"];
const DOUBLE_CLICK_MS = 400;
const COMPACT_BELOW = 500;
const REFRESH_EVERY = 60000;
const MIN_GAP = 5000;

const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) ?? "") ?? fallback; } catch { return fallback; }
};

const store = () => shared(STORE) ?? {};
const box = (width, height, props) => openOverlay({ mod: "nebula-box", kind: "dialog", modal: true, width, height, props });

const keep = (map, root, value) => {
  if (value === null || JSON.stringify(map[root]) === JSON.stringify(value)) return false;
  map[root] = value;
  return true;
};

export class Board {
  init(cx) {
    this.handle = cx.focus_handle();
    this.scroll = VirtualListScrollHandle.new();
    this.has = false;
    this.asked = shared(FOCUS_BOARD);
    this.acted = shared(ROW_ACTION)?.n ?? 0;
    this.view = viewOf(load("view", mergeSettings(shared(SETTINGS)).view)).id;
    this.folded = new Set(load("tree.folded", []));
    this.bandsFolded = new Set(load("bands.folded", [])); // worktree band paths, in every view but Columns
    this.showArchived = false;
    this.sort = cleanSort(load("sort", "status"));
    this.filter = ""; // not persisted
    this.filtering = false; // the filter input has the keyboard
    this.leftAt = 0;
    this.input = InputState.new({ placeholder: "Filter" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); cx.notify(); });
    this.input.on("focus", (_e, cx) => { this.filtering = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.filtering = false; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.leaveFilter(cx, true));
    this.colMode = load("columns.mode", "status") === "projects" ? "projects" : "status";
    this.col = 0;
    this.cols = {};
    this.pc = null;
    this.cursor = null;
    this.index = 0;
    this.last = { key: null, at: 0 };
    this.range = null;
    this.repo = shared(REPO);
    this.tab = ALL; // the shown tab: a project root or ALL (sync derives it from the shared value)
    this.tabRoots = []; // the project tabs, in order
    const f = focused();
    this.lastTerm = f?.terminal ?? f?.agent ?? null; // the last focused terminal seen, for follow focus
    this.open = []; // the open project roots, in tab order (sync keeps it)
    this.seen = null; // the ids that needed you at the last sync (lib/open.js)
    this.checkouts = {};
    this.wt = {};
    this.common = {};
    this.loading = new Set();
    this.pending = new Set();
    this.watching = new Set();
    this.refreshed = {};
    this.rootsKey = "";
    this.picks = {}; // { [root]: { hash, ext } | null } the icon file picked for each project (lib/icon-scan.js)
    this.iconsKey = null; // the project list the published icons were worked out for
    this.iconsBusy = false;
    this.order = "";
    this.click = (key, c) => this.onClick(key, c);
    this.menu = (key, e, c) => this.rowMenu(key, e, c);
    this.items = [];
    this.stops = [];
    this.byKey = new Map();
    this.model = { repos: [] };
    this.hasNebula = false; // nebula's db or config exists: the empty state then offers an import
    this.nebula = []; // nebula's own sessions (lib/nebula-sessions.js), read by loadNebula
    this.nebulaBusy = false;
    this.nebulaAt = 0;
    this.nebulaOn = mergeSettings(shared(SETTINGS)).nebulaSessions;
    this.visible = findNode(layout(), "board")?.hidden !== true;
    this.resuming = new Set();
    this.shift = false; // shift was held at the last left press (the virtual lists report clicks without modifiers)
    if (!shared(PINNED)) setShared(PINNED, pinnedIn(layout())); // the layout may have kept the pin
    this.findNebula(cx);
    cx.timer.every(100, (c) => this.watch(c));
    cx.timer.every(REFRESH_EVERY, (c) => { this.loadAll(c); this.loadNebula(c); });
    cx.timer.every(30000, (c) => c.notify());
    this.loadAll(cx);
    this.loadNebula(cx);
  }

  // Nebula's sessions: its CLI lists them and its db says which Claude conversation each
  // holds (both read only). A missing CLI or db, or a failed read, keeps the last list.
  loadNebula(cx) {
    if (this.nebulaBusy) return;
    this.nebulaOn = mergeSettings(shared(SETTINGS)).nebulaSessions;
    if (!this.nebulaOn) return;
    this.nebulaBusy = true;
    const files = nebulaFiles(home());
    cx.spawn(async (cx) => {
      try {
        const [a, b] = await Promise.all([
          exec(nebulaBin(home()), SESSIONS_ARGS, { timeout: 30000 }).catch(() => null),
          exec(SQLITE, ["-readonly", "-json", files.db, AGENTS_SQL], { timeout: 30000 }).catch(() => null),
        ]);
        if (a?.code !== 0 || b?.code !== 0) return;
        const list = joinSessions(parseSessions(a.stdout), parseAgents(b.stdout));
        if (JSON.stringify(list) !== JSON.stringify(this.nebula)) { this.nebula = list; cx.notify(); }
      } finally {
        this.nebulaBusy = false;
        this.nebulaAt = Date.now();
      }
    });
  }

  findNebula(cx) {
    const f = nebulaFiles(home());
    cx.spawn(async (cx) => {
      const r = await exec("/bin/sh", ["-c", 'test -e "$1" || test -e "$2"', "sh", f.db, f.config]).catch(() => null);
      if (r?.code === 0) { this.hasNebula = true; cx.notify(); }
    });
  }

  repos() { return reposWith(store(), this.checkouts); }

  listed(root) { return projectList(store()).some((p) => p.root === root); }

  loadAll(cx) {
    const roots = projectList(store()).map((p) => p.root), key = rootsKey(store());
    if (key !== this.rootsKey) cx.notify();
    this.rootsKey = key;
    for (const map of [this.checkouts, this.wt, this.common, this.refreshed]) {
      for (const root of Object.keys(map)) if (!roots.includes(root)) delete map[root];
    }
    for (const root of roots) this.load(root, cx);
  }

  load(root, cx) {
    if (this.loading.has(root)) return;
    this.loading.add(root);
    cx.spawn(async (cx) => {
      try {
        await Promise.all([
          listCheckouts(exec, root).then((list) => { if (keep(this.checkouts, root, list)) cx.notify(); }),
          exec("wt", ["-C", root, "list", "--format", "json"], { timeout: 60000 }).catch(() => null)
            .then((w) => { if (w?.code === 0 && keep(this.wt, root, parseWt(w.stdout))) cx.notify(); }),
          this.common[root] ? null : commonDirOf(exec, root).then((c) => {
            if (c?.code === 0 && c.stdout.trim()) { this.common[root] = c.stdout.trim(); this.watchGit(root, cx); }
          }),
        ]);
      } finally {
        this.loading.delete(root);
        this.refreshed[root] = Date.now();
      }
    });
  }

  watchGit(root, cx) {
    const dir = this.common[root];
    if (this.watching.has(dir)) return;
    this.watching.add(dir);
    cx.spawn(async (cx) => {
      try {
        while (this.listed(root)) {
          const paths = await watchFolder(dir);
          if (!objectsOnly(paths, dir)) this.queue(root, cx);
        }
      } catch {}
      this.watching.delete(dir);
    });
  }

  queue(root, cx) {
    if (this.pending.has(root)) return;
    this.pending.add(root);
    cx.timer.after(Math.max(0, MIN_GAP - (Date.now() - (this.refreshed[root] ?? 0))), () => {
      this.pending.delete(root);
      if (this.listed(root)) this.load(root, cx);
    });
  }

  watch(cx) {
    // Shared writes happen here, not in render, where Herdr does not keep them reliably.
    if (this.pendingOpen) { const o = this.pendingOpen; this.pendingOpen = null; setShared(OPEN, o); }
    if (this.pendingIcons) { const i = this.pendingIcons; this.pendingIcons = null; setShared(ICONS, i); }
    this.syncIcons(cx);
    if (this.all) {
      const summary = JSON.stringify(summarize(this.all));
      if (summary !== this.summaryKey) { this.summaryKey = summary; setShared(SUMMARY, JSON.parse(summary)); }
    }
    const asked = shared(FOCUS_BOARD);
    if (asked !== this.asked) {
      this.asked = asked;
      this.handle.focus();
      for (const ms of REFOCUS_MS) cx.timer.after(ms, () => this.handle.focus());
    }
    const has = this.handle.is_focused();
    if (has !== this.has) {
      this.has = has;
      setShared(BOARD_KEYS, has);
      cx.notify();
    }
    const f = focused(), term = f?.terminal ?? f?.agent ?? null;
    if (term !== this.lastTerm && this.all) {
      const r = followFocus({ terminal: term, last: this.lastTerm, boardKeys: has, model: this.all });
      this.lastTerm = r.last;
      if (r.id) { this.goTo(r.id, cx); cx.notify(); }
    }
    const repo = shared(REPO);
    if (repo !== this.repo) {
      this.repo = repo;
      this.place(null);
      this.cols = {};
      if (this.view === "tree" && repo && repo !== ALL) { this.unfold(repo); this.cursor = `repo:${repo}`; this.reveal(cx, this.cursor, "top"); }
      cx.notify();
    }
    if (rootsKey(store()) !== this.rootsKey) this.loadAll(cx);
    const visible = findNode(layout(), "board")?.hidden !== true;
    if (visible && !this.visible && Date.now() - this.nebulaAt > MIN_GAP) this.loadNebula(cx);
    this.visible = visible;
    if (mergeSettings(shared(SETTINGS)).nebulaSessions !== this.nebulaOn) { this.loadNebula(cx); cx.notify(); }
    const pinned = shared(PINNED), live = terminals();
    if (live.length && pinGone(pinned, live.map((t) => t.address))) { this.setPin(null); cx.notify(); }
    const picked = shared(ROW_ACTION);
    if (picked && picked.n !== this.acted) {
      this.acted = picked.n;
      const row = this.byKey.get(picked.id)?.row;
      if (row) this.act(picked.action, row, cx);
    }
  }

  // The icons of the listed projects, off the render path: a project's file is looked for once (when it
  // first appears in the list), then buildIcons applies the framework-default filter over all of them.
  syncIcons(cx) {
    const list = projectList(store()), key = JSON.stringify(list.map((p) => [p.root, p.name]));
    if (key === this.iconsKey || this.iconsBusy) return;
    this.iconsBusy = true;
    for (const root of Object.keys(this.picks)) if (!list.some((p) => p.root === root)) delete this.picks[root];
    const todo = list.filter((p) => !(p.root in this.picks));
    cx.spawn(async () => {
      try {
        // One project at a time: Herdr runs with a 256 open-file limit, and scanning every project at
        // once ran it out ("Too many open files").
        for (const p of todo) this.picks[p.root] = await pickIcon(exec, p.root, appHome());
        const icons = JSON.stringify(buildIcons(list, this.picks));
        if (icons !== this.iconsJson) { this.iconsJson = icons; this.pendingIcons = JSON.parse(icons); }
        this.iconsKey = key;
      } finally {
        this.iconsBusy = false;
      }
    });
  }

  reveal(cx, key, strategy = "center") {
    if (!viewOf(this.view).virtual) return;
    cx.timer.after(60, () => {
      const i = this.items.findIndex((it) => it.key === key);
      const r = this.range;
      if (i < 0 || (r && i > r.start && i < r.end - 1)) return;
      this.scroll.scroll_to_item(i, strategy);
    });
  }

  setView(id, cx) {
    this.view = id;
    this.range = null;
    localStorage.setItem("view", JSON.stringify(id));
    cx.notify();
  }

  setMode(mode, cx) {
    this.colMode = mode;
    this.col = 0;
    this.place(null);
    localStorage.setItem("columns.mode", JSON.stringify(mode));
    cx.notify();
  }

  setSort(sort, cx) {
    this.sort = sort;
    localStorage.setItem("sort", JSON.stringify(sort));
    cx.notify();
  }

  // Hands the keyboard back to the board (Esc clears the filter first). Enter also puts the
  // cursor on the first match; `leftAt` stops the same Enter from then acting on that row.
  leaveFilter(cx, toFirst) {
    if (!this.filtering) return;
    this.filtering = false;
    this.leftAt = Date.now();
    this.handle.focus();
    if (toFirst) {
      const first = this.stops.find((id) => this.byKey.get(id)?.type === "session") ?? this.stops[0];
      if (this.pc) this.choose(this.stops[0]);
      else if (first) { this.place(first); this.reveal(cx, first); }
    }
    cx.notify();
  }

  // Keys while the filter input has the keyboard: only Esc and Enter are the board's.
  filterKey(k, cx) {
    if (k === "escape") {
      this.input.set_value("");
      this.filter = "";
      this.leaveFilter(cx, false);
      cx.stop_propagation();
    } else if (k === "enter") this.leaveFilter(cx, true);
  }

  // Collapse all / Expand all, on what is shown (lib/tabs.js): All folds the project headers, a project tab its worktree bands.
  foldAll(fold) {
    const r = foldAllState({ folded: this.folded, bands: this.bandsFolded }, this.scoped.repos, fold, this.tab);
    this.folded = r.folded;
    this.bandsFolded = r.bands;
    this.persistFolds();
    this.persistBands();
  }

  foldButton(t, icon, tip, action) {
    return div().id(`tree-${icon}`).size(24).flex().items_center().justify_center().rounded(6).cursor_pointer()
      .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); action(); cx.notify(); })
      .child(svg(`mods/nebula/icons/${icon}.svg`).size(14));
  }

  persistFolds() { localStorage.setItem("tree.folded", JSON.stringify([...this.folded])); }
  persistBands() { localStorage.setItem("bands.folded", JSON.stringify([...this.bandsFolded])); }
  unfoldBand(path) { if (this.bandsFolded.delete(path)) this.persistBands(); }
  toggleBand(path) {
    if (!this.bandsFolded.delete(path)) this.bandsFolded.add(path);
    this.persistBands();
  }
  unfold(root) { if (this.folded.delete(root)) this.persistFolds(); }
  toggle(root) {
    if (!this.folded.delete(root)) this.folded.add(root);
    this.persistFolds();
  }

  // Resumes a nebula session in Herdr: a new tab (or space) in its worktree running
  // `claude --resume`, as a fork while nebula still runs it, named after it. Then shows it.
  // Already resumed here: shows that copy instead of forking another.
  resume(row, cx) {
    const s = row.nebula;
    const have = resumedTerminal(shared(RESUMED), s.id, new Set(terminals().map((t) => t.address)));
    if (have) { run("pane.focus", { terminal: have }); return; }
    if (this.resuming.has(s.id)) return;
    this.resuming.add(s.id);
    const plan = planLaunch({
      checkouts: [...this.repos().flatMap((r) => r.checkouts), { path: s.worktree, branch: s.branch }], checkout: s.worktree,
      spaces: placedSpaces(spaces(), panes()), harness: "claude", model: s.model, effort: s.effort,
      argv: resumeArgv(s), name: s.name, from: "board",
    });
    cx.spawn(async (cx) => {
      const r = await runSteps(plan.steps, exec);
      this.resuming.delete(s.id);
      if (r.error || !r.terminal) { notify({ title: "Could not resume in Herdr", body: r.error || s.name, level: "error" }); return; }
      setShared(RESUMED, recordResumed(shared(RESUMED), s.id, r.terminal, new Set(terminals().map((t) => t.address))));
      const ask = () => run("pane.focus", { terminal: r.terminal });
      ask();
      for (const ms of REFOCUS_MS) cx.timer.after(ms, ask);
      cx.notify();
    });
  }

  // Pins one agent's terminal beside the active tab (null: unpins). Herdr can only take a
  // whole layout tree, so lib/pin.js edits a copy of layout() and layout.set applies it.
  setPin(address) {
    const next = withPin(layout(), address);
    if (!next) return;
    setShared(PINNED, address);
    run("layout.set", { layout: next });
  }

  pinRow(row) {
    if (pinnable(row)) this.setPin(togglePin(shared(PINNED), row.address));
  }

  // Shows the agent in the terminal (a parked one has no pane); a nebula row resumes.
  show(row, cx) {
    if (row.kind === "nebula") { this.resume(row, cx); return; }
    if (row.pane) run("pane.focus", { pane: row.pane });
    else run("agent.focus", { terminal: row.address });
  }

  place(key) {
    this.cursor = key;
    this.index = Math.max(0, this.stops.indexOf(key));
  }

  // Shows a session's row: selects its project's tab (opening the project when it is closed; a stray
  // session goes to All; All stays), unfolds what hides it and puts the cursor on it.
  goTo(id, cx) {
    const at = whereIs(this.all, id);
    if (!at) return;
    const land = landOn(this.tab, this.tabRoots, at.repo.root);
    const open = land.open ? openProject(this.open, at.repo.root) : this.open;
    if (open !== this.open) setShared(OPEN, open);
    if (land.tab !== this.tab) { this.repo = land.tab; setShared(REPO, land.tab); this.cols = {}; } // this.repo first, so watch() keeps the cursor
    if (this.pc) { this.cols = { project: at.repo.root, worktree: at.band.path }; this.col = 2; }
    this.unfoldBand(at.band.path);
    this.unfold(at.repo.root);
    this.cursor = id;
    this.reveal(cx, id);
  }

  onClick(key, cx) {
    let item = this.byKey.get(key);
    if (!item) return;
    this.handle.focus();
    const now = Date.now(), dbl = this.last.key === key && now - this.last.at < DOUBLE_CLICK_MS;
    this.last = { key, at: now };
    if (item.type === "sub") item = this.byKey.get(item.parent) ?? item;
    const shift = this.shift;
    this.shift = false;
    if (item.type === "session") {
      this.col = 2;
      this.place(item.key);
      if (shift) this.pinRow(item.row);
      else this.show(item.row, cx);
    } else if (item.type === "project" || item.type === "worktree") this.choose(item.key);
    else if (item.type === "repo") {
      this.place(item.key);
      if (!dbl) this.toggle(item.repo.root);
    } else if (item.type === "band") this.toggleBand(item.band.path);
    cx.notify();
  }

  // The project (and checkout) the user is looking at, for the new session box to preselect:
  // Projects mode follows its columns, other views the highlighted row, else the selected tab's
  // project, else (All) the first open project.
  launchTarget() {
    const real = (root) => (root && root !== OTHER ? root : null);
    let root = null, checkout = null;
    if (this.pc) {
      root = real(this.pc.sel.project);
      if (root && this.col > 0) checkout = this.pc.sel.worktree;
    } else {
      const item = this.byKey.get(this.cursor);
      if (item?.type === "repo") root = real(item.repo.root);
      else if (item?.type === "session") {
        const at = whereIs(this.model, item.key);
        root = real(at?.repo.root);
        if (root) checkout = at.band.path || null;
      }
    }
    root = root ?? real(this.root) ?? real(this.open[0]); // All is no project: the highlighted row's, else the first open one
    return root ? { root, ...(checkout ? { checkout } : {}) } : null;
  }

  openLaunch(extra = {}) {
    const prefill = this.launchTarget();
    box(640, 520, { role: "launch", ...(prefill ? { prefill } : {}), ...extra });
  }

  openPresets() { box(600, 540, { role: "presets" }); }

  deleteProps(row) {
    const full = buildBoard(this.boardArgs(true));
    return {
      title: row.title, worktree: whereIs(full, row.id)?.band.label ?? "", status: LABEL[row.status] ?? row.status,
      terminal: row.address, tab: row.tab, alone: aloneInTab(panes(), row.tab, row.address), offer: worktreeOffer(full, row.id),
    };
  }

  act(action, row, cx) {
    const launch = row.launch;
    if (row.kind === "nebula" && (action === "delete" || action === "archive")) action = "hide";
    if (!actionsFor(row, Boolean(launch)).some((a) => a.id === action)) return;
    if (action === "hide") setShared(HIDDEN, [...new Set([...(shared(HIDDEN) ?? []), row.nebula.id])]);
    else if (action === "rename") box(460, 190, { role: "rename", tab: row.tab, name: row.title === NEW_SESSION ? "" : row.title });
    else if (action === "archive" && mergeSettings(shared(SETTINGS)).confirmArchive) box(440, 190, { role: "archive-confirm", tab: row.tab, title: row.title });
    else if (action === "archive" || action === "unarchive") { const c = tabCommand(action, row.tab); run(c.name, c.args); }
    else if (action === "delete") {
      const p = this.deleteProps(row);
      box(520, p.offer ? 460 : 250, { role: "confirm", ...p });
    } else if (action === "relaunch") {
      const root = whereIs(this.model, row.id)?.repo.root;
      this.openLaunch({ prefill: { ...launch, ...(root && root !== OTHER ? { root } : {}) } });
    }
    else if (action === "folder") {
      const { cmd, args } = editorCommand(shared(SETTINGS)?.editor, whereIs(this.model, row.id)?.band.path || row.cwd);
      cx.spawn(async () => { await exec(cmd, args).catch(() => null); });
    }
    cx.notify();
  }

  rowMenu(key, _e, cx) {
    let item = this.byKey.get(key);
    if (item?.type === "sub") item = this.byKey.get(item.parent);
    if (item?.type !== "session") return;
    this.handle.focus();
    this.col = 2;
    this.place(item.key);
    const row = item.row, list = actionsFor(row, Boolean(row.launch));
    const height = 10 + list.length * 31 + list.filter((a) => a.sep).length * 9;
    openOverlay({
      mod: "nebula-box", kind: "popup", at: "pointer", width: 270, height,
      props: { role: "menu", id: row.id, kind: row.kind, archived: row.archived, tab: row.tab, launch: list.some((a) => a.id === "relaunch") },
    });
    cx.notify();
  }

  // Projects mode of Columns: the cursor sits in one column (this.col 0 to 2) and moving it in
  // the project or worktree column selects that item, so the columns to its right follow.
  choose(key) {
    const it = this.byKey.get(key);
    if (!it) return;
    if (it.type === "project") {
      this.cols = { project: it.project.key, worktree: it.project.key === this.cols.project ? this.cols.worktree : null };
    } else if (it.type === "worktree") this.cols = { ...this.cols, worktree: it.worktree.key };
    this.col = COLUMN_TYPES.indexOf(it.type);
    this.place(key);
  }

  enterColumn(col) {
    const sel = this.cols;
    this.choose(col === 0 ? `proj:${sel.project}` : col === 1 ? `wt:${sel.worktree}` : this.pc.sessions[0]?.id);
  }

  columnKey(k, m) {
    if (m.shift) return false;
    const dir = { j: 1, down: 1, k: -1, up: -1 }[k];
    if (dir) {
      const stops = this.items.filter((i) => i.type === COLUMN_TYPES[this.col]).map((i) => i.key);
      this.choose(stepCursor(stops, this.cursor, dir));
    } else if (k === "h" || k === "left") { if (this.col > (this.pc.scoped ? 1 : 0)) this.enterColumn(this.col - 1); }
    else if (k === "l" || k === "right" || (k === "enter" && this.col < 2)) { if (this.col < 2) this.enterColumn(this.col + 1); }
    else return false;
    return true;
  }

  // After a refresh: keep the cursor in the focused column, on that column's selection.
  fitColumn() {
    this.col = Math.max(this.col, this.pc.scoped ? 1 : 0); // a project tab has no PROJECTS column
    if (this.col === 2 && !this.pc.sessions.length) this.col = 1;
    const sel = this.pc.sel;
    const key = this.col === 0 ? `proj:${sel.project}` : this.col === 1 ? `wt:${sel.worktree}` : this.byKey.get(this.cursor)?.type === "session" ? this.cursor : this.pc.sessions[0]?.id;
    this.place(this.byKey.has(key) ? key : null);
  }

  key(e, cx) {
    const m = e.modifiers ?? {};
    if (this.filtering) { this.filterKey(e.key, cx); return; }
    if (m.control || m.alt || m.platform) return;
    if (e.key === "enter" && Date.now() - this.leftAt < 150) return;
    const k = e.key, item = this.byKey.get(this.cursor), act = rowActionOf(k, m);
    if (this.pc && this.columnKey(k, m)) { cx.notify(); return; }
    if (k === "j" || k === "down" || k === "k" || k === "up") {
      this.place(stepCursor(this.stops, this.cursor, k === "j" || k === "down" ? 1 : -1));
      this.reveal(cx, this.cursor);
    } else if (act && item?.type === "session") this.act(act, item.row, cx);
    else if (k === "enter") {
      if (item?.type === "session") this.show(item.row, cx);
      else if (item?.type === "repo") this.toggle(item.repo.root);
    } else if ((k === "left" || k === "right") && item?.type === "repo") {
      if (k === "left") { this.folded.add(item.repo.root); this.persistFolds(); } else this.unfold(item.repo.root);
    } else if (k === "." || k === ",") {
      const id = attentionTarget(arrange(this.base, { sort: this.sort }), item?.type === "session" ? item.key : null, k === "." ? 1 : -1);
      if (id) this.goTo(id, cx);
    } else if (k === "s") {
      if (item?.type === "session") this.pinRow(item.row);
    } else if (k === "v") {
      this.setView(cycleOf(VIEW_IDS, this.view, 1), cx);
    } else if (k === "/") {
      cx.timer.after(1, () => this.input.focus()); // after this key, so the "/" is not typed into it
      return;
    } else if (k === "p") this.openLaunch();
    else if (k === "e") this.openPresets();
    else if (k === "A" || (k === "a" && m.shift)) this.showArchived = !this.showArchived;
    else {
      const to = tabKey(this.tabRoots, k);
      if (to === null) return;
      setShared(REPO, to);
    }
    cx.notify();
  }

  boardArgs(showArchived) {
    return {
      terminals: terminals(), agents: agents(), panes: panes(), spaces: spaces(), repos: this.repos(),
      wt: Object.assign({}, ...Object.values(this.wt)), now: Date.now(), showArchived,
      nebula: this.nebulaOn ? this.nebula.filter((s) => !(shared(HIDDEN) ?? []).includes(s.id)) : [], resumed: shared(RESUMED) ?? {},
    };
  }

  sync() {
    const picked = shared(REPO);
    this.all = buildBoard(this.boardArgs(this.showArchived));
    const stored = shared(OPEN), r = syncOpen(stored, this.all, store(), this.seen);
    this.open = r.open ?? [];
    this.seen = r.seen;
    if (r.changed && r.open) this.pendingOpen = r.open; // first run, a gone project, a closed project that needs you; written by watch
    this.base = onlyOpen(this.all, this.open);
    this.tabRoots = this.base.repos.filter((r) => r.root !== OTHER).map((r) => r.root);
    this.tab = tabOf(this.tabRoots, picked);
    this.root = this.tab === ALL ? null : this.tab;
    this.scoped = scopeModel(this.base, this.tab); // the selected tab's part of the open projects: every view draws from it
    this.model = arrange(this.scoped, { filter: this.filter, sort: this.sort });
    this.pinned = shared(PINNED);
    this.pc = this.view === "columns" && this.colMode === "projects" ? projectColumns(this.model, this.cols, this.root, this.tab !== ALL) : null;
    if (this.pc) this.cols = this.pc.sel;
    this.items = viewOf(this.view).view.items(this.model, this);
    this.byKey = new Map(this.items.map((i) => [i.key, i]));
    this.stops = stopsOf(this.items);
    const at = placeCursor(this.stops, this.cursor, this.index);
    this.cursor = at.id;
    this.index = at.index;
    if (this.pc) this.fitColumn();
    // the agent order ignores the filter: a hidden agent keeps its place
    const shown = agentOrder(this.filter ? arrange(this.scoped, { sort: this.sort }) : this.model, this.view, this.root, this.pc ? { mode: "projects", sel: this.cols } : {});
    const order = [...shown, ...agentOrder(this.all, "tree", null).filter((id) => !shown.includes(id))]; // closed projects' agents follow
    const key = order.join("\n");
    if (key !== this.order) { this.order = key; setAgentOrder(order); }
  }

  openPicker() {
    openOverlay({ mod: "nebula-box", kind: "popup", at: "pointer", width: 320, height: pickerHeight(projectList(store()).length), props: { role: "projects" } });
  }

  header(t) {
    const compact = (this.width ?? 9999) < COMPACT_BELOW;
    return v_flex().flex_none()
      .child(h_flex().h(42).items_center().pl(20).pr(14).border_b(1).border_color(t.border)
        .child(h_flex().border_1().border_color(t.border).rounded(6).p(1).bg(t.background)
          .children(VIEWS.map((v) => {
            const on = v.id === this.view;
            return h_flex().id(`view-${v.id}`).h(22).px(compact ? 7 : 10).gap(6).items_center().rounded(4).text_size(12).cursor_pointer()
              .text_color(on ? t.foreground : t.muted)
              .when(on, (el) => el.bg(t.selected))
              .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
              .when(compact, (el) => el.tooltip(VIEW_TITLE[v.id]))
              .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.handle.focus(); this.setView(v.id, cx); })
              .child(svg(`mods/nebula/icons/${v.id}.svg`).size(13).flex_none())
              .when(!compact, (el) => el.child(div().child(VIEW_TITLE[v.id])));
          })))
        .child(div().flex_1())
        .child(this.headerButton(t, "presets", "bookmark", "Presets", "e", compact, () => this.openPresets()).mr(8))
        .child(this.headerButton(t, "new-session", "plus", "New session", "p", compact, () => this.openLaunch())))
      .child(this.toolbar(t));
  }

  // Under the view tabs: the filter on the left, the sort and (Tree, Cards, List) fold buttons on the right.
  toolbar(t) {
    return h_flex().h(34).flex_none().items_center().gap(8).pl(20).pr(14).border_b(1).border_color(t.border)
      .child(h_flex().id("filter").flex_1().min_w(0).h(24).items_center().gap(6).px(8).rounded(6).border_1()
        .border_color(this.filtering ? t.accent : t.border).bg(t.background).cursor_text()
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .child(svg("mods/nebula/icons/search.svg").size(13).flex_none().text_color(t.dim))
        .child(Input.new(this.input).flex_1().min_w(0).h_full().text_size(12).text_color(t.foreground)))
      .child(h_flex().flex_none().border_1().border_color(t.border).rounded(6).p(1).bg(t.background)
        .children(SORTS.map((id) => {
          const on = id === this.sort;
          return h_flex().id(`sort-${id}`).h(20).px(8).items_center().rounded(4).text_size(11.5).cursor_pointer()
            .text_color(on ? t.foreground : t.muted)
            .when(on, (el) => el.bg(t.selected))
            .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
            .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.handle.focus(); this.setSort(id, cx); })
            .child(div().child(SORT_TITLE[id]));
        })))
      .when(this.canFoldAll(), (el) => el.child(h_flex().flex_none().gap(2)
        .child(this.foldButton(t, "collapse-all", "Collapse all", () => this.foldAll(true)))
        .child(this.foldButton(t, "expand-all", "Expand all", () => this.foldAll(false)))));
  }

  canFoldAll() { return this.view !== "columns" && this.scoped.repos.length > 0; }

  headerButton(t, id, icon, label, hint, compact, action) {
    return h_flex().id(id).h(24).items_center().gap(7).pl(10).pr(6).border_1().border_color(t.border).rounded(6).bg(t.raised)
      .text_size(12).text_color(t.foreground).cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => action())
      .when(compact, (el) => el.tooltip(label))
      .child(svg(`mods/nebula/icons/${icon}.svg`).size(13).flex_none())
      .when(!compact, (el) => el.child(div().child(label)))
      .child(div().px(4).border_1().border_color(t.selected).rounded(3).text_size(10).text_color(t.muted).child(hint));
  }

  // No project to show: a centered empty state when there is nothing else to list, or a
  // slim banner above the stray sessions (the Other group) when there is. With projects in the
  // store but none open, it offers the picker instead of adding.
  noProjects(t, alone, listed) {
    const action = (id, text, kind, role, w, h) => h_flex().id(id).h(30).px(14).items_center().rounded(6).border_1().text_size(12).cursor_pointer()
      .border_color(kind === "primary" ? t.solid : t.border).bg(kind === "primary" ? t.solid : t.raised)
      .text_color(kind === "primary" ? t.solid_foreground : t.foreground)
      .hover((s) => s.opacity(0.88)).on_click(() => (role ? box(w, h, { role }) : this.openPicker())).child(text);
    const buttons = listed ? h_flex().gap(8).flex_none().child(action("empty-open", "Open a project", "primary", null)) : h_flex().gap(8).flex_none()
        .when(this.hasNebula, (el) => el.child(action("empty-import", "Import from nebula", "primary", "import", 520, 420)))
        .child(action("empty-add", "Add a project", this.hasNebula ? "plain" : "primary", "add", 460, 240));
    if (!alone) {
      return h_flex().id("board-banner").flex_none().mx(12).mt(10).px(14).py(10).gap(12).items_center().rounded(10)
        .border_1().border_color(t.border).bg(t.raised)
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(t.muted).child(listed ? "No project open" : "No projects yet"))
        .child(buttons);
    }
    return v_flex().id("board-empty").flex_1().items_center().justify_center().gap(14)
      .child(div().text_size(13).text_color(t.dim).child(listed ? "No project open" : "No projects yet"))
      .child(buttons);
  }

  render() {
    const t = theme();
    this.sync();
    return v_flex().id("board").track_focus(this.handle).size_full().bg(t.chrome).text_size(13).text_color(t.muted)
      .on_size_change((size, cx) => {
        const was = this.width;
        this.width = Math.round(size.width);
        if (was !== this.width) cx.notify(); // the compact header depends on the width
      })
      .border_r(1).border_color(this.has ? t.accent : t.chrome)
      .on_mouse_down("left", (e) => { this.shift = Boolean(e.modifiers?.shift); this.handle.focus(); })
      .on_key_down((e, cx) => this.key(e, cx))
      .child(this.header(t))
      .when(!this.base.repos.length || !this.open.length, (el) => el.child(this.noProjects(t, !this.base.repos.length, projectList(store()).length > 0)))
      .when(this.base.repos.length > 0, (el) => el.child(v_flex().flex_1().min_h(0).child(viewOf(this.view).view.body(this, t))));
  }
}
