// The board column: the session views (Tree, Cards, List, Columns) and the keyboard.
// It also owns the focus handle the rail asks for, the 1px accent edge while it has the
// keys, and the 1 to 9 repo keys. Through shared values it talks to the rail:
//   nebula.boardKeys    true while the board has the keyboard (written here)
//   nebula.focusBoard   a token the rail changes to ask the board for the keyboard
//   nebula.launched     a token the dialogs change after a launch from the board
//   nebula.repo         the selected repo's folder
//   nebula.rowAction    { id, action, n } the row menu sets; the board does the action
//   nebula.settings     the settings overlay writes it (lib/settings.js): the default view, whether `a` asks, the editor
//   nebula.resumed      { [nebulaId]: terminal } the nebula sessions this board resumed in Herdr (written here)
//   nebula.pinned       the terminal pinned beside the active tab, or null (written here; lib/pin.js edits the layout)
// Moving the cursor (j, k, arrows, the attention keys) only highlights a row; Enter or a
// double click shows the agent. The cursor is a session's address, never an index.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex, VirtualListScrollHandle } from "gpui-base";
import {
  theme, shared, setShared, run, exec, watchFolder, home, terminals, agents, panes, spaces, setAgentOrder, openOverlay, layout, notify,
} from "herdr";
import { STORE, projectList, digitTile, reposWith, rootsKey, listCheckouts, commonDirOf, tilde } from "./lib/repos.js";
import { REFOCUS_MS, findNode } from "./lib/focus.js";
import { nebulaFiles, SQLITE } from "./lib/nebula-import.js";
import { nebulaBin, SESSIONS_ARGS, AGENTS_SQL, parseSessions, parseAgents, joinSessions, resumeArgv, recordResumed } from "./lib/nebula-sessions.js";
import { planLaunch, runSteps, placedSpaces } from "./lib/launch.js";
import { mergeSettings, cycleOf, VIEW_IDS, VIEW_TITLE } from "./lib/settings.js";
import { REPO, SETTINGS, FOCUS_BOARD, BOARD_KEYS, ROW_ACTION, RESUMED, PINNED } from "./lib/shared.js";
import { togglePin, pinnable, pinnedIn, pinGone, withPin } from "./lib/pin.js";
import { actionsFor, worktreeOffer, aloneInTab, tabCommand, editorCommand, whereIs } from "./lib/actions.js";
import {
  OTHER, NEW_SESSION, LABEL, buildBoard, selectedRepo, stopsOf, stepCursor, placeCursor, attentionTarget, agentOrder, projectColumns, parseWt, objectsOnly,
} from "./lib/viewmodel.js";
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
    this.showArchived = false;
    this.colMode = load("columns.mode", "status") === "projects" ? "projects" : "status";
    this.col = 0;
    this.cols = {};
    this.pc = null;
    this.cursor = null;
    this.index = 0;
    this.last = { key: null, at: 0 };
    this.range = null;
    this.repo = shared(REPO);
    this.checkouts = {};
    this.wt = {};
    this.common = {};
    this.loading = new Set();
    this.pending = new Set();
    this.watching = new Set();
    this.refreshed = {};
    this.rootsKey = "";
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
    const repo = shared(REPO);
    if (repo !== this.repo) {
      this.repo = repo;
      this.place(null);
      this.cols = {};
      if (this.view === "tree" && repo) { this.unfold(repo); this.cursor = `repo:${repo}`; this.reveal(cx, this.cursor, "top"); }
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

  // Tree view: fold or unfold every project at once.
  foldAll(fold) {
    this.folded = new Set(fold ? this.model.repos.map((r) => r.root) : []);
    this.persistFolds();
  }

  foldButton(t, icon, tip, action) {
    return div().id(`tree-${icon}`).size(24).flex().items_center().justify_center().rounded(6).cursor_pointer()
      .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); action(); cx.notify(); })
      .child(svg(`mods/nebula/icons/${icon}.svg`).size(14));
  }

  persistFolds() { localStorage.setItem("tree.folded", JSON.stringify([...this.folded])); }
  unfold(root) { if (this.folded.delete(root)) this.persistFolds(); }
  toggle(root) {
    if (!this.folded.delete(root)) this.folded.add(root);
    this.persistFolds();
  }

  // Resumes a nebula session in Herdr: a new tab (or space) in its worktree running
  // `claude --resume`, as a fork while nebula still runs it, named after it. Then shows it.
  resume(row, cx) {
    const s = row.nebula;
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

  pick(root) {
    this.place(null);
    this.repo = root;
    setShared(REPO, root);
  }

  goTo(id, cx) {
    const at = whereIs(this.model, id), repo = at?.repo;
    if (this.pc && at) { this.cols = { project: repo.root, worktree: at.band.path }; this.col = 2; }
    if (repo && this.view === "tree") this.unfold(repo.root);
    else if (repo && this.view !== "columns" && repo.root !== this.root) this.pick(repo.root);
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
    } else if (item.type === "summary") this.pick(item.repo.root);
    cx.notify();
  }

  // The project (and checkout) the user is looking at, for the new session box to preselect:
  // Projects mode follows its columns, other views the highlighted row, else the board's repo.
  launchTarget() {
    const real = (root) => (root && root !== OTHER ? root : null);
    let root = null, checkout = null;
    if (this.pc) {
      root = real(this.pc.sel.project);
      if (root && this.col > 0) checkout = this.pc.sel.worktree;
    } else {
      const item = this.byKey.get(this.cursor);
      if (item?.type === "repo" || item?.type === "summary") root = real(item.repo.root);
      else if (item?.type === "session") {
        const at = whereIs(this.model, item.key);
        root = real(at?.repo.root);
        if (root) checkout = at.band.path || null;
      }
      root = root ?? real(this.root);
    }
    return root ? { root, ...(checkout ? { checkout } : {}) } : null;
  }

  openLaunch(extra = {}) {
    const prefill = this.launchTarget();
    box(640, 520, { role: "launch", ...(prefill ? { prefill } : {}), ...extra });
  }

  deleteProps(row) {
    const full = buildBoard(this.boardArgs(true));
    return {
      title: row.title, worktree: whereIs(full, row.id)?.band.label ?? "", status: LABEL[row.status] ?? row.status,
      terminal: row.address, tab: row.tab, alone: aloneInTab(panes(), row.tab, row.address), offer: worktreeOffer(full, row.id),
    };
  }

  act(action, row, cx) {
    const launch = row.launch;
    if (!actionsFor(row, Boolean(launch)).some((a) => a.id === action)) return;
    if (action === "rename") box(460, 190, { role: "rename", tab: row.tab, name: row.title === NEW_SESSION ? "" : row.title });
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
    if (item?.type !== "session" || item.row.kind === "nebula") return;
    this.handle.focus();
    this.col = 2;
    this.place(item.key);
    const row = item.row, list = actionsFor(row, Boolean(row.launch));
    const height = 10 + list.length * 31 + list.filter((a) => a.sep).length * 9;
    openOverlay({
      mod: "nebula-box", kind: "popup", at: "pointer", width: 270, height,
      props: { role: "menu", id: row.id, archived: row.archived, tab: row.tab, launch: list.some((a) => a.id === "relaunch") },
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
      // the rail and the header follow, as when a rail tile is clicked; this.repo is set first so watch() keeps the selection
      if (it.project.key !== OTHER && it.project.key !== shared(REPO)) { this.repo = it.project.key; setShared(REPO, it.project.key); }
    }
    else if (it.type === "worktree") this.cols = { ...this.cols, worktree: it.worktree.key };
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
    } else if (k === "h" || k === "left") { if (this.col > 0) this.enterColumn(this.col - 1); }
    else if (k === "l" || k === "right" || (k === "enter" && this.col < 2)) { if (this.col < 2) this.enterColumn(this.col + 1); }
    else return false;
    return true;
  }

  // After a refresh: keep the cursor in the focused column, on that column's selection.
  fitColumn() {
    if (this.col === 2 && !this.pc.sessions.length) this.col = 1;
    const sel = this.pc.sel;
    const key = this.col === 0 ? `proj:${sel.project}` : this.col === 1 ? `wt:${sel.worktree}` : this.byKey.get(this.cursor)?.type === "session" ? this.cursor : this.pc.sessions[0]?.id;
    this.place(this.byKey.has(key) ? key : null);
  }

  key(e, cx) {
    const m = e.modifiers ?? {};
    if (m.control || m.alt || m.platform) return;
    const k = e.key, item = this.byKey.get(this.cursor), act = rowActionOf(k, m);
    if (this.pc && this.columnKey(k, m)) { cx.notify(); return; }
    if (k === "j" || k === "down" || k === "k" || k === "up") {
      this.place(stepCursor(this.stops, this.cursor, k === "j" || k === "down" ? 1 : -1));
      this.reveal(cx, this.cursor);
    } else if (act && item?.type === "session") this.act(act, item.row, cx);
    else if (k === "enter") {
      if (item?.type === "session") this.show(item.row, cx);
      else if (item?.type === "repo") this.toggle(item.repo.root);
      else if (item?.type === "summary") this.pick(item.repo.root);
    } else if ((k === "left" || k === "right") && item?.type === "repo") {
      if (k === "left") { this.folded.add(item.repo.root); this.persistFolds(); } else this.unfold(item.repo.root);
    } else if (k === "." || k === ",") {
      const id = attentionTarget(this.model, item?.type === "session" ? item.key : null, k === "." ? 1 : -1);
      if (id) this.goTo(id, cx);
    } else if (k === "s") {
      if (item?.type === "session") this.pinRow(item.row);
    } else if (k === "v") {
      this.setView(cycleOf(VIEW_IDS, this.view, 1), cx);
    } else if (k === "p") this.openLaunch();
    else if (k === "e") box(600, 540, { role: "presets" });
    else if (k === "A" || (k === "a" && m.shift)) this.showArchived = !this.showArchived;
    else {
      const tile = digitTile(projectList(store()), k);
      if (!tile) return;
      setShared(REPO, tile.root);
    }
    cx.notify();
  }

  boardArgs(showArchived) {
    return {
      terminals: terminals(), agents: agents(), panes: panes(), spaces: spaces(), repos: this.repos(),
      wt: Object.assign({}, ...Object.values(this.wt)), now: Date.now(), showArchived,
      nebula: this.nebulaOn ? this.nebula : [], resumed: shared(RESUMED) ?? {},
    };
  }

  sync() {
    const picked = shared(REPO);
    this.model = buildBoard(this.boardArgs(this.showArchived));
    this.pinned = shared(PINNED);
    this.root = selectedRepo(this.model, picked)?.root ?? null;
    this.pc = this.view === "columns" && this.colMode === "projects" ? projectColumns(this.model, this.cols, this.root) : null;
    if (this.pc) this.cols = this.pc.sel;
    this.items = viewOf(this.view).view.items(this.model, this);
    this.byKey = new Map(this.items.map((i) => [i.key, i]));
    this.stops = stopsOf(this.items);
    const at = placeCursor(this.stops, this.cursor, this.index);
    this.cursor = at.id;
    this.index = at.index;
    if (this.pc) this.fitColumn();
    const order = agentOrder(this.model, this.view, this.root, this.pc ? { mode: "projects", sel: this.cols } : {});
    const key = order.join("\n");
    if (key !== this.order) { this.order = key; setAgentOrder(order); }
  }

  header(t) {
    const compact = (this.width ?? 9999) < COMPACT_BELOW;
    const repo = this.model.repos.find((r) => r.root === this.root);
    const path = !repo || repo.root === OTHER ? "" : tilde(repo.root, home());
    return v_flex().flex_none()
      .child(h_flex().h(42).items_center().gap(8).pl(20).pr(14)
        .child(div().min_w(0).truncate().font_semibold().text_size(14).text_color(t.foreground).child(repo?.name ?? "Board"))
        .child(div().min_w(0).truncate().text_size(12).text_color(t.dim).child(path)))
      .child(h_flex().h(38).items_center().pl(20).pr(14).border_b(1).border_color(t.border)
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
        .when(this.view === "tree" && this.model.repos.length > 1, (el) => el.child(h_flex().gap(2).mr(8)
          .child(this.foldButton(t, "collapse-all", "Collapse all", () => this.foldAll(true)))
          .child(this.foldButton(t, "expand-all", "Expand all", () => this.foldAll(false)))))
        .child(h_flex().id("new-session").h(24).items_center().gap(7).pl(10).pr(6).border_1().border_color(t.border).rounded(6).bg(t.raised)
          .text_size(12).text_color(t.foreground).cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => this.openLaunch())
          .when(compact, (el) => el.tooltip("New session"))
          .child(svg("mods/nebula/icons/plus.svg").size(13).flex_none())
          .when(!compact, (el) => el.child(div().child("New session")))
          .child(div().px(4).border_1().border_color(t.selected).rounded(3).text_size(10).text_color(t.muted).child("p"))));
  }

  // No project on the rail: a centered empty state when there is nothing else to list, or a
  // slim banner above the stray sessions (the Other group) when there is.
  noProjects(t, alone) {
    const action = (id, text, kind, role, w, h) => h_flex().id(id).h(30).px(14).items_center().rounded(6).border_1().text_size(12).cursor_pointer()
      .border_color(kind === "primary" ? t.solid : t.border).bg(kind === "primary" ? t.solid : t.raised)
      .text_color(kind === "primary" ? t.solid_foreground : t.foreground)
      .hover((s) => s.opacity(0.88)).on_click(() => box(w, h, { role })).child(text);
    const buttons = h_flex().gap(8).flex_none()
        .when(this.hasNebula, (el) => el.child(action("empty-import", "Import from nebula", "primary", "import", 520, 420)))
        .child(action("empty-add", "Add a project", this.hasNebula ? "plain" : "primary", "add", 460, 240));
    if (!alone) {
      return h_flex().id("board-banner").flex_none().mx(12).mt(10).px(14).py(10).gap(12).items_center().rounded(10)
        .border_1().border_color(t.border).bg(t.raised)
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(t.muted).child("No projects yet"))
        .child(buttons);
    }
    return v_flex().id("board-empty").flex_1().items_center().justify_center().gap(14)
      .child(div().text_size(13).text_color(t.dim).child("No projects yet"))
      .child(buttons);
  }

  render() {
    const t = theme();
    this.sync();
    return v_flex().id("board").track_focus(this.handle).size_full().bg(t.chrome).text_size(13).text_color(t.muted)
      .on_size_change((size, cx) => {
        const was = (this.width ?? 9999) < COMPACT_BELOW;
        this.width = size.width;
        if (was !== this.width < COMPACT_BELOW) cx.notify();
      })
      .border_r(1).border_color(this.has ? t.accent : t.chrome)
      .on_mouse_down("left", (e) => { this.shift = Boolean(e.modifiers?.shift); this.handle.focus(); })
      .on_key_down((e, cx) => this.key(e, cx))
      .child(this.header(t))
      .when(!this.model.repos.length || !projectList(store()).length, (el) => el.child(this.noProjects(t, !this.model.repos.length)))
      .when(this.model.repos.length > 0, (el) => el.child(v_flex().flex_1().min_h(0).child(viewOf(this.view).view.body(this, t))));
  }
}
