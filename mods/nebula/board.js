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
//   nebula.settings     the settings overlay writes it (lib/settings.js): the default view, whether `a` asks, the editor,
//                       the prompt line on rows, whether empty worktrees get a band
//   nebula.resumed      { [nebulaId]: terminal } the nebula sessions this board resumed in Herdr (written here)
//   nebula.pinned       the terminal pinned beside the active tab, or null (written here; lib/pin.js edits the layout)
//   nebula.flash        { text, n, undo? } a dialog's line for the status line (lib/flash.js)
//   nebula.goto         { id, n } the jump palette's pick: the cursor goes to that session
// Moving the cursor (j, k, arrows, the attention keys, a click) shows that agent in the main area
// while the board keeps the keys (lib/preview.js; the setting "Preview while moving"); Enter or a
// double click steps in, Esc hands the keys back to the terminal. The cursor is a session's address,
// never an index. The bottom strip is the status line: key hints for where you are, or what the last
// action did for a few seconds.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex, VirtualListScrollHandle, InputState, Input } from "gpui-base";
import {
  theme,
  shared,
  setShared,
  run,
  exec,
  watchFolder,
  home,
  appHome,
  terminals,
  agents,
  panes,
  spaces,
  setAgentOrder,
  openOverlay,
  layout,
  notify,
  focused,
  nextCommand,
  settings,
  hc,
  keys,
  window,
} from "herdr";
import { putToSleep, hasExited } from "./sleeper.js";
import { canResume, resumeCommand } from "./lib/resume.js";
import { sleepVerdict } from "./lib/sleep.js";
import { ASLEEP } from "./lib/labels.js";
import { STORE, projectList, reposWith, rootsKey, listCheckouts, commonDirOf, tilde } from "./lib/repos.js";
import { REFOCUS_MS, findNode, moveStep } from "./lib/focus.js";
import { nebulaFiles, SQLITE } from "./lib/nebula-import.js";
import {
  nebulaBin,
  SESSIONS_ARGS,
  AGENTS_SQL,
  parseSessions,
  parseAgents,
  joinSessions,
  resumeArgv,
  recordResumed,
  resumedTerminal,
  shownSessions,
  withHidden,
} from "./lib/nebula-sessions.js";
import { planLaunch, runSteps, placedSpaces } from "./lib/launch.js";
import { mergeSettings, cycleOf, shortcutLabel, VIEW_IDS, VIEW_TITLE } from "./lib/settings.js";
import { ALL, SUMMARY, REPO, SETTINGS, FOCUS_BOARD, BOARD_KEYS, ROW_ACTION, RESUMED, PINNED, OPEN, ICONS, HIDDEN, FLASH, GOTO } from "./lib/shared.js";
import { PREVIEW_MS, HOLD_MS, POLL_MS, focusCommand, previewTarget, refocusDue, giveBackTarget } from "./lib/preview.js";
import {
  makeFlash,
  liveFlash,
  uKey,
  archivedFlash,
  unarchivedFlash,
  asleepFlash,
  resumingFlash,
  NOTHING_WAITING,
  NOTHING_DONE,
  NOTHING_TO_UNARCHIVE,
  HIDDEN_TEXT,
} from "./lib/flash.js";
import { hintContext, hintPairs, hintLine, awayParts, HELP_SIZE } from "./lib/hints.js";
import { jumpSize } from "./lib/jump.js";
import { syncOpen, openProject, onlyOpen, pickerHeight, summarize } from "./lib/open.js";
import { buildIcons } from "./lib/icons.js";
import { pickIcon } from "./lib/icon-scan.js";
import { togglePin, pinnable, pinnedIn, pinGone, withPin } from "./lib/pin.js";
import { actionsFor, rowAction, worktreeOffer, bandOffer, aloneInTab, tabCommand, editorCommand, whereIs } from "./lib/actions.js";
import { trackStates, freshState, nudging } from "./lib/attention.js";
import { PORTS_SCRIPT, parsePorts, portUrl, portAt } from "./lib/ports.js";
import { PORT_HIT, ball, title as rowTitle } from "./views/row.js";
import { attentionStrip, stripParts } from "./lib/strip.js";
import { rowText } from "./lib/prompt.js";
import {
  OTHER,
  NEW_SESSION,
  LABEL,
  buildBoard,
  stopsOf,
  stepCursor,
  placeCursor,
  attentionTarget,
  agentOrder,
  projectColumns,
  parseWt,
  objectsOnly,
} from "./lib/viewmodel.js";
import { arrange, cleanSort, SORTS, SORT_TITLE, SORT_TIP } from "./lib/arrange.js";
import { tabOf, scopeModel, tabKey, landOn, followFocus, foldAllState } from "./lib/tabs.js";
import * as tree from "./views/tree.js";
import * as cards from "./views/cards.js";
import * as list from "./views/list.js";
import * as columns from "./views/columns.js";
import { fs, rh, setTextScale } from "./lib/scale.js";
import { setReduceMotion } from "./lib/motion.js";

const VIEWS = [
  { id: "tree", view: tree, virtual: true },
  { id: "cards", view: cards },
  { id: "list", view: list, virtual: true },
  { id: "columns", view: columns },
];
const viewOf = (id) => VIEWS.find((v) => v.id === id) ?? VIEWS[0];

const ROW_KEYS = { r: "rename", a: "archive", u: "unarchive", d: "delete", z: "sleep" };
const rowActionOf = (k, m) => {
  if (k === "enter") return m.shift ? "folder" : null;
  if (k === "P" || (k === "p" && m.shift)) return "relaunch";
  if (k === "R" || (k === "r" && m.shift)) return "resume";
  return m.shift ? null : (ROW_KEYS[k] ?? null);
};

const COLUMN_TYPES = ["project", "worktree", "session"];
const DOUBLE_CLICK_MS = 400;
const PORTS_EVERY = 5000; // how often the board looks for listening ports
const KEEP_MS = 250; // after a click shows an agent, when the board asks for the keys back again
const COMPACT_BELOW = 500;
const REFRESH_EVERY = 60000;
const MIN_GAP = 5000;

const load = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "") ?? fallback;
  } catch {
    return fallback;
  }
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
    this.flashN = shared(FLASH)?.n ?? 0;
    this.gotoN = shared(GOTO)?.n ?? 0;
    this.flash = null; // the status line's message: { text, until } (lib/flash.js)
    this.undo = null; // the last archive `u` takes back: { tab, title }
    this.previewToken = 0; // a newer cursor move cancels the preview waiting for its 150 ms
    this.epoch = 0; // Esc or stepping in cancels the refocus a preview still has waiting
    this.holdUntil = 0; // the board keeps saying it has the keys while Herdr moves focus for a preview
    this.previewed = null; // the row last shown by a preview or by stepping in: where Esc hands the keys
    this.lastPane = null; // the pane that had the keys before the board did
    this.view = viewOf(load("view", mergeSettings(shared(SETTINGS)).view)).id;
    this.folded = new Set(load("tree.folded", []));
    this.bandsFolded = new Set(load("bands.folded", [])); // worktree band paths, in every view but Columns
    this.showArchived = false;
    this.sort = cleanSort(load("sort", "status"));
    this.filter = ""; // not persisted
    this.filtering = false; // the filter input has the keyboard
    this.leftAt = 0;
    this.input = InputState.new({ placeholder: "Filter · f" });
    this.input.on("change", (_e, cx) => {
      this.filter = this.input.value();
      cx.notify();
    });
    this.input.on("focus", (_e, cx) => {
      this.filtering = true;
      cx.notify();
    });
    this.input.on("blur", (_e, cx) => {
      this.filtering = false;
      cx.notify();
    });
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
    this.openPort = (port, c) => this.openUrl(portUrl(port), c);
    this.items = [];
    this.stops = [];
    this.byKey = new Map();
    this.model = { repos: [] };
    this.hasNebula = false; // nebula's db or config exists: the empty state then offers an import
    this.nebula = []; // nebula's own sessions (lib/nebula-sessions.js), read by loadNebula
    this.nebulaBusy = false;
    this.nebulaAt = 0;
    this.ports = {}; // { [terminal]: [port] } its programs listen on (lib/ports.js), read by loadPorts
    this.portsBusy = false;
    this.nebulaOn = mergeSettings(shared(SETTINGS)).nebulaSessions;
    this.visible = findNode(layout(), "board")?.hidden !== true;
    this.resuming = new Set();
    this.stateTrack = new Map(); // when each row entered its state, for tabs with no change time (lib/attention.js)
    this.changeAt = {};
    this.viewing = new Set(); // the terminals the user is looking at: a row that needs you stops breathing there
    this.motionKey = ""; // the fresh rows and noted times the last render drew; a change redraws
    this.shift = false; // shift was held at the last left press (the virtual lists report clicks without modifiers)
    if (!shared(PINNED)) setShared(PINNED, pinnedIn(layout())); // the layout may have kept the pin
    this.findNebula(cx);
    cx.timer.every(100, (c) => this.watch(c));
    // mod.json makes this mod focusable: Herdr's pane.go (left from the terminal) hands the board the keys.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = String(await nextCommand());
        if (c === "focus") this.handle.focus();
        else if (c === "new" && this.has)
          this.openLaunch(); // ⌘K while the board has the keys: like p (the rail opens it otherwise)
        else continue;
        cx.notify();
      }
    });
    cx.timer.every(REFRESH_EVERY, (c) => {
      this.loadAll(c);
      this.loadNebula(c);
    });
    cx.timer.every(30000, (c) => c.notify());
    cx.timer.every(PORTS_EVERY, (c) => this.loadPorts(c));
    this.loadAll(cx);
    this.loadNebula(cx);
    this.loadPorts(cx);
  }

  // The ports each terminal listens on (a dev server an agent started), drawn on its row.
  loadPorts(cx) {
    if (this.portsBusy || !this.visible) return;
    this.portsBusy = true;
    cx.spawn(async (cx) => {
      try {
        const r = await exec("/bin/sh", ["-c", PORTS_SCRIPT], { timeout: 15000 }).catch(() => null);
        if (r?.code !== 0) return;
        const ports = parsePorts(r.stdout);
        if (JSON.stringify(ports) !== JSON.stringify(this.ports)) {
          this.ports = ports;
          cx.notify();
        }
      } finally {
        this.portsBusy = false;
      }
    });
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
        if (JSON.stringify(list) !== JSON.stringify(this.nebula)) {
          this.nebula = list;
          cx.notify();
        }
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
      if (r?.code === 0) {
        this.hasNebula = true;
        cx.notify();
      }
    });
  }

  repos() {
    return reposWith(store(), this.checkouts);
  }

  listed(root) {
    return projectList(store()).some((p) => p.root === root);
  }

  loadAll(cx) {
    const roots = projectList(store()).map((p) => p.root),
      key = rootsKey(store());
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
          listCheckouts(exec, root).then((list) => {
            if (keep(this.checkouts, root, list)) cx.notify();
          }),
          exec("wt", ["-C", root, "list", "--format", "json"], { timeout: 60000 })
            .catch(() => null)
            .then((w) => {
              if (w?.code === 0 && keep(this.wt, root, parseWt(w.stdout))) cx.notify();
            }),
          this.common[root]
            ? null
            : commonDirOf(exec, root).then((c) => {
                if (c?.code === 0 && c.stdout.trim()) {
                  this.common[root] = c.stdout.trim();
                  this.watchGit(root, cx);
                }
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
    if (this.pendingOpen) {
      const o = this.pendingOpen;
      this.pendingOpen = null;
      setShared(OPEN, o);
    }
    if (this.pendingIcons) {
      const i = this.pendingIcons;
      this.pendingIcons = null;
      setShared(ICONS, i);
    }
    this.syncIcons(cx);
    if (this.all) {
      const summary = JSON.stringify(summarize(this.all));
      if (summary !== this.summaryKey) {
        this.summaryKey = summary;
        setShared(SUMMARY, JSON.parse(summary));
      }
    }
    if (this.all) this.watchMotion(cx);
    const asked = shared(FOCUS_BOARD);
    if (asked !== this.asked) {
      this.asked = asked;
      this.handle.focus();
      for (const ms of REFOCUS_MS) cx.timer.after(ms, () => this.handle.focus());
    }
    const real = this.handle.is_focused();
    if (real) this.holdUntil = 0;
    const has = real || Date.now() < this.holdUntil;
    if (has !== this.has) {
      this.has = has;
      setShared(BOARD_KEYS, has);
      cx.notify();
    }
    const f = focused(),
      term = f?.terminal ?? f?.agent ?? null;
    if (!has) {
      if (f?.pane) this.lastPane = f.pane;
      if (this.previewed && f?.terminal && f.terminal !== this.previewed.address) this.previewed = null; // the user went elsewhere
    }
    if (term !== this.lastTerm && this.all) {
      const r = followFocus({ terminal: term, last: this.lastTerm, boardKeys: has, model: this.all });
      this.lastTerm = r.last;
      if (r.id) {
        this.goTo(r.id, cx);
        cx.notify();
      }
    }
    const repo = shared(REPO);
    if (repo !== this.repo) {
      this.repo = repo;
      this.place(null);
      this.cols = {};
      if (this.view === "tree" && repo && repo !== ALL) {
        this.unfold(repo);
        this.cursor = `repo:${repo}`;
        this.reveal(cx, this.cursor, "top");
      }
      cx.notify();
    }
    if (rootsKey(store()) !== this.rootsKey) this.loadAll(cx);
    const visible = findNode(layout(), "board")?.hidden !== true;
    if (visible && !this.visible && Date.now() - this.nebulaAt > MIN_GAP) this.loadNebula(cx);
    this.visible = visible;
    if (mergeSettings(shared(SETTINGS)).nebulaSessions !== this.nebulaOn) {
      this.loadNebula(cx);
      cx.notify();
    }
    const pinned = shared(PINNED),
      live = terminals();
    if (
      live.length &&
      pinGone(
        pinned,
        live.map((t) => t.address),
      )
    ) {
      this.setPin(null);
      cx.notify();
    }
    const said = shared(FLASH);
    if (said && said.n !== this.flashN) {
      this.flashN = said.n;
      this.say(said.text, said.undo, cx);
    }
    const jumped = shared(GOTO);
    if (jumped && jumped.n !== this.gotoN) {
      this.gotoN = jumped.n;
      if (this.all) {
        this.goTo(jumped.id, cx);
        cx.notify();
      }
    }
    if (this.flash && !liveFlash(this.flash)) {
      this.flash = null;
      cx.notify();
    }
    const picked = shared(ROW_ACTION);
    if (picked && picked.n !== this.acted) {
      this.acted = picked.n;
      const row = this.byKey.get(picked.id)?.row;
      if (row) this.act(picked.action, row, cx);
    }
  }

  // A row whose state just changed (needs you, working, finished unseen) pulses for a few seconds and then holds
  // still, so the board redraws when a row enters or leaves that window. A tab with no change time gets the moment
  // the board saw its row change. Also redraws when a setting that changes the rows is flipped.
  watchMotion(cx) {
    const now = Date.now(),
      rows = this.all.repos.flatMap((r) => r.rows).filter((r) => r.kind !== "nebula");
    const u = trackStates(
      this.stateTrack,
      rows.map((r) => ({ id: r.id, status: r.status })),
      now,
    );
    this.stateTrack = u.state;
    this.changeAt = u.at;
    const f = focused();
    this.viewing = new Set([f?.terminal, f?.shown, f?.agent].filter(Boolean));
    const cfg = this.config();
    const key = JSON.stringify([
      u.at,
      rows.filter((r) => freshState(r.status, r.archived, r.stateSince, now)).map((r) => r.id),
      rows.filter((r) => nudging(r, now)).map((r) => r.id),
      [...this.viewing],
      cfg.promptLine,
      cfg.showEmptyWorktrees,
      cfg.reduceMotion,
    ]);
    if (key !== this.motionKey) {
      this.motionKey = key;
      cx.notify();
    }
  }

  config() {
    return mergeSettings(shared(SETTINGS));
  }

  // The icons of the listed projects, off the render path: a project's file is looked for once (when it
  // first appears in the list), then buildIcons applies the framework-default filter over all of them.
  syncIcons(cx) {
    const list = projectList(store()),
      key = JSON.stringify(list.map((p) => [p.root, p.name]));
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
        if (icons !== this.iconsJson) {
          this.iconsJson = icons;
          this.pendingIcons = JSON.parse(icons);
        }
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
      else if (first) {
        this.place(first);
        this.reveal(cx, first);
      }
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

  persistFolds() {
    localStorage.setItem("tree.folded", JSON.stringify([...this.folded]));
  }
  persistBands() {
    localStorage.setItem("bands.folded", JSON.stringify([...this.bandsFolded]));
  }
  unfoldBand(path) {
    if (this.bandsFolded.delete(path)) this.persistBands();
  }
  toggleBand(path) {
    if (!this.bandsFolded.delete(path)) this.bandsFolded.add(path);
    this.persistBands();
  }
  unfold(root) {
    if (this.folded.delete(root)) this.persistFolds();
  }
  toggle(root) {
    if (!this.folded.delete(root)) this.folded.add(root);
    this.persistFolds();
  }

  // The status line says `text` for a few seconds; `undo` is the archive `u` takes back.
  say(text, undo, cx) {
    this.flash = makeFlash(text, undo);
    if (undo) this.undo = undo;
    cx?.notify();
  }

  // Preview while moving: shows the highlighted agent in the main area (pane.focus selects its tab and
  // marks it seen) and takes the keys straight back, polling every POLL_MS for a while unless Esc, Enter or
  // a click elsewhere has taken them (this.epoch). lib/preview.js has the reasoning.
  schedulePreview(cx) {
    if (!this.config().preview) return;
    const token = ++this.previewToken;
    cx.timer.after(PREVIEW_MS, () => {
      if (token === this.previewToken) this.preview(cx);
    });
  }

  // `clicked`: the board was just given the keys by the click, which watch() has not seen yet.
  preview(cx, clicked = false) {
    const row = previewTarget(this.byKey.get(this.cursor));
    if (!row || !(clicked || this.has)) return;
    const epoch = this.epoch,
      take = () => this.handle.focus();
    this.previewed = row;
    this.lastTerm = row.address; // so follow focus does not take the move for the user's own
    this.holdUntil = Date.now() + HOLD_MS;
    const c = focusCommand(row);
    run(c.name, c.args);
    take();
    // Herdr hands the keys to the shown agent a frame or a few hundred ms later (measured: tab.select
    // and pane.focus both do), so the board watches closely and takes them straight back each time.
    // After the first take-back it watches only 300 ms more, so a click into the agent a moment later
    // stays the user's.
    let until = Date.now() + HOLD_MS + 500;
    const poll = () => {
      if (epoch !== this.epoch || Date.now() > until) return;
      if (refocusDue({ focused: focused(), row, has: this.handle.is_focused() })) {
        take();
        until = Math.min(until, Date.now() + 300);
      }
      cx.timer.after(POLL_MS, poll);
    };
    cx.timer.after(POLL_MS, poll);
  }

  // Esc: the keys go back to the agent in the main area; the board stays shown.
  giveBack(cx) {
    this.previewToken++;
    this.epoch++;
    this.holdUntil = 0;
    const c = giveBackTarget({ previewed: this.previewed, lastPane: this.lastPane, panes: panes() });
    if (c) run(c.name, c.args);
    cx.notify();
  }

  // `u` with no archived row under the cursor: brings back the last archived session.
  undoArchive(u, cx) {
    if (u.kind === "undo") {
      const c = tabCommand("unarchive", u.tab);
      run(c.name, c.args);
      this.undo = null;
      this.say(unarchivedFlash(u.title), undefined, cx);
    } else this.say(NOTHING_TO_UNARCHIVE, undefined, cx);
  }

  // Resumes a nebula session in Herdr: a new tab (or space) in its worktree running
  // `claude --resume`, as a fork while nebula still runs it, named after it. Then shows it.
  // Already resumed here: shows that copy instead of forking another.
  resume(row, cx) {
    const s = row.nebula;
    const have = resumedTerminal(shared(RESUMED), s.id, new Set(terminals().map((t) => t.address)));
    if (have) {
      run("pane.focus", { terminal: have });
      return;
    }
    if (this.resuming.has(s.id)) return;
    this.resuming.add(s.id);
    this.say(resumingFlash(s.name), undefined, cx);
    const plan = planLaunch({
      checkouts: [...this.repos().flatMap((r) => r.checkouts), { path: s.worktree, branch: s.branch }],
      checkout: s.worktree,
      spaces: placedSpaces(spaces(), panes()),
      harness: "claude",
      model: s.model,
      effort: s.effort,
      argv: resumeArgv(s),
      name: s.name,
      from: "board",
    });
    cx.spawn(async (cx) => {
      const r = await runSteps(plan.steps, exec);
      this.resuming.delete(s.id);
      if (r.error || !r.terminal) {
        notify({ title: "Could not resume in Herdr", body: r.error || s.name, level: "error" });
        return;
      }
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

  // Types the resume command into the row's own terminal, whose shell is left at a prompt after
  // the agent exited (a crash, `/exit`, a reboot or a sleep), and clears the asleep mark. The
  // terminal is looked at again first, so a stale row never types into a running agent.
  resumeHere(row, cx) {
    const cmd = resumeCommand(row.session, row.launch);
    if (!cmd || !hasExited(row.address) || this.resuming.has(row.address)) return;
    this.resuming.add(row.address);
    this.say(resumingFlash(row.title), undefined, cx);
    cx.spawn(async (cx) => {
      const r = await hc(["send", row.address, cmd]).catch(() => null);
      this.resuming.delete(row.address);
      if (r?.code !== 0) {
        notify({ title: "Could not resume", body: row.title, level: "error", timeout: 4000 });
        return;
      }
      if (row.asleep) await hc(["label", row.address, `${ASLEEP}=`]).catch(() => null);
      cx.notify();
    });
  }

  // `z`: the agent's CLI exits (its shell stays) and Enter later resumes the conversation. Only
  // an agent that is done, with a conversation to resume; otherwise a toast says why.
  sleep(row, cx) {
    const why = sleepVerdict(row);
    if (why) {
      notify({ title: "Cannot sleep this agent", body: why, level: "info", timeout: 4500 });
      return;
    }
    cx.spawn(async (cx) => {
      const r = await putToSleep(row.address, cx);
      if (r === "stuck") notify({ title: "Could not stop the agent", body: `${row.title} is still running.`, level: "error", timeout: 5000 });
      else if (r === "asleep") this.say(asleepFlash(row.title), undefined, cx);
      cx.notify();
    });
  }

  // Shows the agent in the terminal (a parked one has no pane); a nebula row resumes, and so
  // does an exited or asleep agent with a known conversation, in its own terminal.
  show(row, cx) {
    this.previewToken++; // stepping in: a preview waiting for its 150 ms, or its refocus, must not take the keys back
    this.epoch++;
    this.holdUntil = 0;
    if (row.kind === "nebula") {
      this.resume(row, cx);
      return;
    }
    if (canResume(row)) this.resumeHere(row, cx);
    this.previewed = row;
    const c = focusCommand(row);
    run(c.name, c.args);
  }

  // Shows the agent in the main area and keeps the keys on the board. Herdr hands the keys to the terminal
  // it shows, a beat later, so the board asks for them back with Herdr's own pane.go, now and once more after
  // that beat. A nebula row or an exited agent steps in instead: showing it starts or resumes something.
  showKeep(row, cx) {
    this.show(row, cx);
    if (row.kind === "nebula" || canResume(row)) return;
    const back = () => run("pane.go", { direction: "left" });
    back();
    cx.timer.after(KEEP_MS, back);
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
    if (land.tab !== this.tab) {
      this.repo = land.tab;
      setShared(REPO, land.tab);
      this.cols = {};
    } // this.repo first, so watch() keeps the cursor
    if (this.pc) {
      this.cols = { project: at.repo.root, worktree: at.band.path };
      this.col = 2;
    }
    this.unfoldBand(at.band.path);
    this.unfold(at.repo.root);
    this.cursor = id;
    this.reveal(cx, id);
  }

  onClick(key, cx) {
    let item = this.byKey.get(key);
    if (!item) return;
    this.handle.focus();
    const now = Date.now(),
      dbl = this.last.key === key && now - this.last.at < DOUBLE_CLICK_MS;
    this.last = { key, at: now };
    if (item.type === "session" && this.portClick(item.row, cx)) return;
    if (item.type === "sub") item = this.byKey.get(item.parent) ?? item;
    const shift = this.shift;
    this.shift = false;
    if (item.type === "session") {
      this.col = 2;
      this.place(item.key);
      if (shift) this.pinRow(item.row);
      else if (dbl)
        this.show(item.row, cx); // a double click (or Enter) steps in
      else this.showKeep(item.row, cx); // a click shows the agent; the keys stay on the board (the user's call)
    } else if (item.type === "vacant") this.place(item.key);
    else if (item.type === "project" || item.type === "worktree") this.choose(item.key);
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
    let root = null,
      checkout = null;
    if (this.pc) {
      root = real(this.pc.sel.project);
      if (root && this.col > 0) checkout = this.pc.sel.worktree;
    } else {
      const item = this.byKey.get(this.cursor);
      if (item?.type === "repo") root = real(item.repo.root);
      else if (item?.type === "vacant") {
        root = real(item.root);
        checkout = item.band.path;
      } else if (item?.type === "session") {
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

  openPresets() {
    box(600, 540, { role: "presets" });
  }

  deleteProps(row) {
    const full = buildBoard(this.boardArgs(true));
    return {
      title: row.title,
      worktree: whereIs(full, row.id)?.band.label ?? "",
      status: LABEL[row.status] ?? row.status,
      terminal: row.address,
      tab: row.tab,
      alone: aloneInTab(panes(), row.tab, row.address),
      offer: worktreeOffer(full, row.id),
    };
  }

  // `d` on a band with no session: the delete confirm for the worktree itself (git check, then `wt remove`).
  deleteBand(item) {
    const offer = bandOffer(item.root, item.band);
    if (!offer) {
      notify({ title: "This checkout stays", body: "The repo's own checkout and the default branch are not removed here.", level: "info", timeout: 3500 });
      return;
    }
    box(520, 460, { role: "confirm", worktreeOnly: true, title: offer.branch, worktree: tilde(offer.path, home()), status: "", offer });
  }

  act(action, row, cx) {
    const launch = row.launch;
    action = rowAction(row, action);
    if (action === "sleep") {
      this.sleep(row, cx);
      return;
    }
    if (!actionsFor(row, Boolean(launch)).some((a) => a.id === action)) return;
    if (action === "hide") {
      setShared(HIDDEN, withHidden(shared(HIDDEN), row.nebula.id));
      this.say(HIDDEN_TEXT, undefined, cx);
    } else if (action === "resume") this.show(row, cx);
    else if (action === "rename") box(460, 190, { role: "rename", tab: row.tab, name: row.title === NEW_SESSION ? "" : row.title });
    else if (action === "archive" && mergeSettings(shared(SETTINGS)).confirmArchive) box(440, 190, { role: "archive-confirm", tab: row.tab, title: row.title });
    else if (action === "archive" || action === "unarchive") {
      const c = tabCommand(action, row.tab);
      run(c.name, c.args);
      if (action === "archive") this.say(archivedFlash(row.title), { tab: row.tab, title: row.title }, cx);
      else {
        if (this.undo?.tab === row.tab) this.undo = null;
        this.say(unarchivedFlash(row.title), undefined, cx);
      }
    } else if (action === "delete") {
      const p = this.deleteProps(row);
      box(520, p.offer ? 460 : 250, { role: "confirm", ...p });
    } else if (action === "relaunch") {
      const root = whereIs(this.model, row.id)?.repo.root;
      this.openLaunch({ prefill: { ...launch, ...(root && root !== OTHER ? { root } : {}) } });
    } else if (action.startsWith("port:")) this.openUrl(portUrl(action.slice(5)), cx);
    else if (action === "folder") {
      const { cmd, args } = editorCommand(shared(SETTINGS)?.editor, whereIs(this.model, row.id)?.band.path || row.cwd);
      cx.spawn(async () => {
        await exec(cmd, args).catch(() => null);
      });
    }
    cx.notify();
  }

  // A click in Tree or List that landed on one of the row's port cells opens that port (views/row.js).
  portClick(row, cx) {
    const down = this.listDown;
    this.listDown = null;
    if (!down || Date.now() - down.at > 1500 || !row.ports?.length || !viewOf(this.view).virtual) return false;
    const port = portAt(row.ports, down.fromRight, PORT_HIT());
    if (!port) return false;
    this.openPort(port, cx);
    return true;
  }

  openUrl(url, cx) {
    cx.spawn(async () => {
      await exec(window()?.platform === "macos" ? "open" : "xdg-open", [url]).catch(() => null);
    });
  }

  rowMenu(key, _e, cx) {
    let item = this.byKey.get(key);
    if (item?.type === "sub") item = this.byKey.get(item.parent);
    if (item?.type !== "session") return;
    this.handle.focus();
    this.col = 2;
    this.place(item.key);
    const row = item.row,
      list = actionsFor(row, Boolean(row.launch));
    const height = 10 + list.length * 31 + list.filter((a) => a.sep).length * 9;
    openOverlay({
      mod: "nebula-box",
      kind: "popup",
      at: "pointer",
      width: 270,
      height,
      props: {
        role: "menu",
        id: row.id,
        kind: row.kind,
        archived: row.archived,
        tab: row.tab,
        launch: list.some((a) => a.id === "relaunch"),
        exited: row.exited,
        session: row.session,
        ports: row.ports,
      },
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
    const dir = moveStep(k, m.shift);
    if (m.shift && !dir) return false;
    if (dir) {
      const stops = this.items.filter((i) => i.type === COLUMN_TYPES[this.col]).map((i) => i.key);
      this.choose(stepCursor(stops, this.cursor, dir));
    } else if (k === "h" || k === "left") {
      if (this.col > (this.pc.scoped ? 1 : 0)) this.enterColumn(this.col - 1);
    } else if (k === "l" || k === "right" || (k === "enter" && this.col < 2)) {
      if (this.col < 2) this.enterColumn(this.col + 1);
    } else return false;
    return true;
  }

  // After a refresh: keep the cursor in the focused column, on that column's selection.
  fitColumn() {
    this.col = Math.max(this.col, this.pc.scoped ? 1 : 0); // a project tab has no PROJECTS column
    if (this.col === 2 && !this.pc.sessions.length) this.col = 1;
    const sel = this.pc.sel;
    const key =
      this.col === 0
        ? `proj:${sel.project}`
        : this.col === 1
          ? `wt:${sel.worktree}`
          : this.byKey.get(this.cursor)?.type === "session"
            ? this.cursor
            : this.pc.sessions[0]?.id;
    this.place(this.byKey.has(key) ? key : null);
  }

  // A key on the board; a move of the cursor then shows the agent under it (after the 150 ms).
  key(e, cx) {
    const before = this.cursor;
    this.onKey(e, cx);
    if (this.cursor !== before && !this.filtering) this.schedulePreview(cx);
  }

  onKey(e, cx) {
    const m = e.modifiers ?? {};
    if (this.filtering) {
      this.filterKey(e.key, cx);
      return;
    }
    if (m.control || m.alt || m.platform) return;
    if (e.key === "enter" && Date.now() - this.leftAt < 150) return;
    const k = e.key,
      item = this.byKey.get(this.cursor),
      act = rowActionOf(k, m);
    if (k === "escape") {
      this.giveBack(cx);
      return;
    }
    if (this.pc && this.columnKey(k, m)) {
      cx.notify();
      return;
    }
    const u = k === "u" && !m.shift ? uKey(item?.type === "session" ? item.row : null, this.undo) : null;
    const step = moveStep(k, m.shift);
    if (step) {
      this.place(stepCursor(this.stops, this.cursor, step));
      this.reveal(cx, this.cursor);
    } else if (u && u.kind !== "row") this.undoArchive(u, cx);
    else if (act && item?.type === "session") this.act(act, item.row, cx);
    else if (act === "delete" && item?.type === "vacant") this.deleteBand(item);
    else if (k === "enter") {
      if (item?.type === "session") this.show(item.row, cx);
      else if (item?.type === "repo") this.toggle(item.repo.root);
    } else if ((k === "left" || k === "right") && item?.type === "repo") {
      if (k === "left") {
        this.folded.add(item.repo.root);
        this.persistFolds();
      } else this.unfold(item.repo.root);
    } else if (k === "." || k === ",") {
      const id = attentionTarget(arrange(this.base, { sort: this.sort }), item?.type === "session" ? item.key : null, k === "." ? 1 : -1);
      if (id) this.goTo(id, cx);
      else this.say(NOTHING_WAITING, undefined, cx);
    } else if (k === ";") {
      const id = attentionTarget(arrange(this.base, { sort: this.sort }), item?.type === "session" ? item.key : null, 1, ["unseen"]);
      if (id) this.goTo(id, cx);
      else this.say(NOTHING_DONE, undefined, cx);
    } else if (k === "o") {
      this.setSort(cycleOf(SORTS, this.sort, 1), cx);
    } else if (k === "m") {
      if (this.view === "columns") this.setMode(this.colMode === "status" ? "projects" : "status", cx);
    } else if (k === "-" || k === "=") {
      if (this.canFoldAll()) this.foldAll(k === "-");
    } else if (k === "s") {
      if (item?.type === "session") this.pinRow(item.row);
    } else if (k === "v") {
      this.setView(cycleOf(VIEW_IDS, this.view, 1), cx);
    } else if (k === "?" || (k === "/" && m.shift)) box(HELP_SIZE.width, HELP_SIZE.height, { role: "help" });
    else if (k === "/") this.openJump();
    else if (k === "f") {
      cx.timer.after(1, () => this.input.focus()); // after this key, so the "f" is not typed into it
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
      terminals: terminals(),
      agents: agents(),
      panes: panes(),
      spaces: spaces(),
      repos: this.repos(),
      wt: Object.assign({}, ...Object.values(this.wt)),
      now: Date.now(),
      showArchived,
      showEmpty: this.config().showEmptyWorktrees,
      changeAt: this.changeAt,
      nebula: this.nebulaOn ? shownSessions(this.nebula, shared(HIDDEN)) : [],
      resumed: shared(RESUMED) ?? {},
      ports: this.ports,
    };
  }

  sync() {
    const picked = shared(REPO);
    this.all = buildBoard(this.boardArgs(this.showArchived));
    const stored = shared(OPEN),
      r = syncOpen(stored, this.all, store(), this.seen);
    this.open = r.open ?? [];
    this.seen = r.seen;
    if (r.changed && r.open) this.pendingOpen = r.open; // first run, a gone project, a closed project that needs you; written by watch
    this.base = onlyOpen(this.all, this.open);
    this.tabRoots = this.base.repos.filter((r) => r.root !== OTHER).map((r) => r.root);
    this.tab = tabOf(this.tabRoots, picked);
    this.root = this.tab === ALL ? null : this.tab;
    this.scoped = scopeModel(this.base, this.tab); // the selected tab's part of the open projects: every view draws from it
    this.model = arrange(this.scoped, { filter: this.filter, sort: this.sort });
    this.attn = attentionStrip(this.scoped);
    this.waiting = attentionStrip(this.base, 0); // across every open project: what ⌘] and ⌘J reach
    this.pinned = shared(PINNED);
    this.promptLine = this.config().promptLine;
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
    const shown = agentOrder(
      this.filter ? arrange(this.scoped, { sort: this.sort }) : this.model,
      this.view,
      this.root,
      this.pc ? { mode: "projects", sel: this.cols } : {},
    );
    const order = [...shown, ...agentOrder(this.all, "tree", null).filter((id) => !shown.includes(id))]; // closed projects' agents follow
    const key = order.join("\n");
    if (key !== this.order) {
      this.order = key;
      setAgentOrder(order);
    }
  }

  // The jump palette (nebula-box, role "jump"): every agent of every project, open or closed.
  openJump() {
    const size = jumpSize();
    openOverlay({ mod: "nebula-box", kind: "dialog", width: size.width, height: size.height, props: { role: "jump" } });
  }

  openPicker() {
    openOverlay({
      mod: "nebula-box",
      kind: "popup",
      at: "pointer",
      width: 320,
      height: pickerHeight(projectList(store()).length),
      props: { role: "projects" },
    });
  }

  // One slim row: the four views as icons, the filter, the sort and New session. Presets (e) and folding are keys.
  header(t) {
    const compact = (this.width ?? 9999) < COMPACT_BELOW;
    return h_flex()
      .h(42)
      .flex_none()
      .items_center()
      .gap(8)
      .pl(20)
      .pr(14)
      .border_b(1)
      .border_color(t.border)
      .child(
        h_flex()
          .flex_none()
          .border_1()
          .border_color(t.border)
          .rounded(6)
          .p(1)
          .bg(t.background)
          .children(
            VIEWS.map((v) => {
              const on = v.id === this.view;
              return h_flex()
                .id(`view-${v.id}`)
                .size(22)
                .items_center()
                .justify_center()
                .rounded(4)
                .cursor_pointer()
                .text_color(on ? t.foreground : t.muted)
                .when(on, (el) => el.bg(t.selected))
                .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
                .tooltip(`${VIEW_TITLE[v.id]} · v`)
                .on_mouse_down("left", (_e, cx) => {
                  cx.stop_propagation();
                  this.handle.focus();
                  this.setView(v.id, cx);
                })
                .child(svg(`mods/nebula/icons/${v.id}.svg`).size(13).flex_none());
            }),
          ),
      )
      .child(this.filterBox(t))
      .child(this.sortButton(t))
      .child(
        this.headerButton(
          t,
          "new-session",
          "plus",
          "New session",
          shortcutLabel(keys(), window()?.platform === "macos")({ action: "nebula.new", def: "⌘K" }),
          compact,
          () => this.openLaunch(),
        ),
      );
  }

  filterBox(t) {
    return h_flex()
      .id("filter")
      .flex_1()
      .min_w(0)
      .h(24)
      .items_center()
      .gap(6)
      .px(8)
      .rounded(6)
      .border_1()
      .border_color(this.filtering ? t.accent : t.border)
      .bg(t.background)
      .cursor_text()
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(svg("mods/nebula/icons/search.svg").size(13).flex_none().text_color(t.dim))
      .child(Input.new(this.input).flex_1().min_w(0).h_full().text_size(fs(12)).text_color(t.foreground));
  }

  // One small button that cycles the sort: Urgent (needs you first) or A-Z.
  sortButton(t) {
    return h_flex()
      .id("sort")
      .flex_none()
      .h(24)
      .min_w(rh(54))
      .px(8)
      .items_center()
      .justify_center()
      .rounded(6)
      .border_1()
      .border_color(t.border)
      .bg(t.background)
      .text_size(fs(12))
      .text_color(t.muted)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip(`${SORT_TIP[this.sort]} · o`)
      .on_mouse_down("left", (_e, cx) => {
        cx.stop_propagation();
        this.handle.focus();
        this.setSort(cycleOf(SORTS, this.sort, 1), cx);
      })
      .child(SORT_TITLE[this.sort]);
  }

  // Words joined by " · ": a count in its color (red for needs you, cyan for done), the rest muted. Used by the
  // attention strip and the status line while the terminal has the keys.
  partsRow(t, parts) {
    const tone = { needs: t.ansi1, unseen: t.ansi6, plain: t.muted };
    return h_flex()
      .min_w(0)
      .items_center()
      .gap(6)
      .text_size(fs(12))
      .children(
        parts.flatMap((p, i) => [
          ...(i ? [div().flex_none().text_color(t.dim).child("·")] : []),
          div()
            .flex_none()
            .text_color(tone[p.tone])
            .when(p.tone !== "plain", (el) => el.font_semibold())
            .child(p.text),
        ]),
      );
  }

  // Under the toolbar (render draws it only when something needs you or finished unseen in the shown tab): the counts, the
  // key to go to the next one, and up to three rows to click (the agent shows, the keys stay here).
  strip(t) {
    const a = this.attn;
    const next = shortcutLabel(keys(), window()?.platform === "macos")({ action: "nebula.next", def: "⌘]" });
    return v_flex()
      .id("attention-strip")
      .flex_none()
      .px(20)
      .py(6)
      .gap(2)
      .border_b(1)
      .border_color(t.border)
      .child(this.partsRow(t, stripParts(a, [`${next} next`])).h(rh(20)))
      .children(
        a.items.map(({ row, project }) =>
          h_flex()
            .id(`attn-${row.id}`)
            .h(rh(22))
            .items_center()
            .gap(8)
            .px(6)
            .rounded(6)
            .text_size(fs(12))
            .cursor_pointer()
            .hover((s) => s.bg(t.hover))
            .tooltip(row.prompt || row.title)
            .on_click((_e, cx) => {
              this.handle.focus();
              this.showKeep(row, cx);
              cx.notify();
            })
            .child(ball(row.status, t, 6, false, row.fresh))
            .child(
              div()
                .flex_1()
                .min_w(0)
                .flex()
                .child(rowTitle({ ...row, title: rowText(row, false).title }, t)),
            )
            .child(div().flex_none().text_size(fs(11)).text_color(t.muted).child(project)),
        ),
      )
      .when(a.more > 0, (el) =>
        el.child(
          h_flex()
            .id("attn-more")
            .h(rh(20))
            .items_center()
            .px(6)
            .rounded(6)
            .text_size(fs(11))
            .text_color(t.muted)
            .cursor_pointer()
            .hover((s) => s.bg(t.hover))
            .on_click(() => this.openJump())
            .child(`+${a.more} more`),
        ),
      );
  }

  // At the left of the status line: KEYS (accent) while the board has the keyboard, so a stray letter is never a
  // surprise (Esc gives them back), FILTER while the filter field has them, else a dim TERMINAL.
  keyCap(t, ctx, label) {
    const mine = ctx === "filter" || this.has;
    return h_flex()
      .id("keys-chip")
      .flex_none()
      .h(rh(20))
      .px(6)
      .mr(10)
      .items_center()
      .rounded(4)
      .border_1()
      .border_color(mine ? t.accent : t.border)
      .text_size(fs(11))
      .font_semibold()
      .text_color(mine ? t.accent : t.dim)
      .tooltip(
        mine
          ? "The board has the keys. Esc hands them back to the terminal."
          : `The terminal has the keys. Click the board, or ${label({ action: "nebula.keys", def: "⌃`" })}, to give them to the board.`,
      )
      .child(ctx === "filter" ? "FILTER" : this.has ? "KEYS" : "TERMINAL");
  }

  // The bottom strip: what the last action did (a few seconds); else, while the terminal has the keys, what
  // waits and the keys to go there; else the hints for where you are (four and "? more").
  statusLine(t) {
    const said = liveFlash(this.flash),
      item = this.byKey.get(this.cursor);
    const label = shortcutLabel(keys(), window()?.platform === "macos");
    const ctx = hintContext({ has: this.has, filtering: this.filtering, item, pc: this.pc, col: this.col });
    const text = (color, s) => div().min_w(0).truncate().text_color(color).child(s);
    let body;
    if (said) body = text(t.foreground, said.text);
    else if (ctx === "away") body = this.partsRow(t, awayParts(this.waiting, label));
    else {
      const pairs = hintPairs(ctx, {
        preview: this.config().preview,
        deletable: item?.type === "vacant" && Boolean(item.band.deletable),
      });
      body = text(t.muted, hintLine(pairs, label));
    }
    return h_flex()
      .id("status-line")
      .flex_none()
      .h(rh(26))
      .px(20)
      .items_center()
      .border_t(1)
      .border_color(t.border)
      .text_size(fs(12))
      .child(this.keyCap(t, ctx, label))
      .child(body);
  }

  canFoldAll() {
    return this.view !== "columns" && this.scoped.repos.length > 0;
  }

  headerButton(t, id, icon, label, hint, compact, action) {
    return h_flex()
      .id(id)
      .h(24)
      .items_center()
      .gap(7)
      .pl(10)
      .pr(6)
      .border_1()
      .border_color(t.border)
      .rounded(6)
      .bg(t.raised)
      .text_size(fs(12))
      .text_color(t.foreground)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => action())
      .when(compact, (el) => el.tooltip(label))
      .child(svg(`mods/nebula/icons/${icon}.svg`).size(13).flex_none())
      .when(!compact, (el) => el.child(div().child(label)))
      .child(div().px(4).border_1().border_color(t.selected).rounded(3).text_size(fs(11)).text_color(t.muted).child(hint));
  }

  // No project to show: a centered empty state when there is nothing else to list, or a
  // slim banner above the stray sessions (the Other group) when there is. With projects in the
  // store but none open, it offers the picker instead of adding.
  noProjects(t, alone, listed) {
    const action = (id, text, kind, role, w, h) =>
      h_flex()
        .id(id)
        .h(30)
        .px(14)
        .items_center()
        .rounded(6)
        .border_1()
        .text_size(fs(12))
        .cursor_pointer()
        .border_color(kind === "primary" ? t.solid : t.border)
        .bg(kind === "primary" ? t.solid : t.raised)
        .text_color(kind === "primary" ? t.solid_foreground : t.foreground)
        .hover((s) => s.opacity(0.88))
        .on_click(() => (role ? box(w, h, { role }) : this.openPicker()))
        .child(text);
    const buttons = listed
      ? h_flex()
          .gap(8)
          .flex_none()
          .child(action("empty-open", "Open a project", "primary", null))
      : h_flex()
          .gap(8)
          .flex_none()
          .when(this.hasNebula, (el) => el.child(action("empty-import", "Import from nebula", "primary", "import", 520, 420)))
          .child(action("empty-add", "Add a project", this.hasNebula ? "plain" : "primary", "add", 460, 240));
    if (!alone) {
      return h_flex()
        .id("board-banner")
        .flex_none()
        .mx(12)
        .mt(10)
        .px(14)
        .py(10)
        .gap(12)
        .items_center()
        .rounded(10)
        .border_1()
        .border_color(t.border)
        .bg(t.raised)
        .child(
          div()
            .flex_1()
            .min_w(0)
            .truncate()
            .text_size(fs(12))
            .text_color(t.muted)
            .child(listed ? "No project open" : "No projects yet"),
        )
        .child(buttons);
    }
    return v_flex()
      .id("board-empty")
      .flex_1()
      .items_center()
      .justify_center()
      .gap(14)
      .child(
        div()
          .text_size(fs(13))
          .text_color(t.muted)
          .child(listed ? "No project open" : "No projects yet"),
      )
      .child(buttons);
  }

  render() {
    setTextScale(settings());
    setReduceMotion(this.config().reduceMotion);
    const t = theme();
    this.sync();
    return v_flex()
      .id("board")
      .track_focus(this.handle)
      .size_full()
      .bg(t.chrome)
      .text_size(fs(13))
      .text_color(t.muted)
      .on_size_change((size, cx) => {
        const was = this.width;
        this.width = Math.round(size.width);
        if (was !== this.width) cx.notify(); // the compact header depends on the width
      })
      .border_r(1)
      .border_color(this.has ? t.accent : t.chrome)
      .on_mouse_down("left", (e) => {
        this.shift = Boolean(e.modifiers?.shift);
        this.handle.focus();
      })
      .on_key_down((e, cx) => this.key(e, cx))
      .child(this.header(t))
      .when(this.base.repos.length > 0 && this.open.length > 0 && this.attn.needs + this.attn.unseen > 0, (el) => el.child(this.strip(t)))
      .when(!this.base.repos.length || !this.open.length, (el) => el.child(this.noProjects(t, !this.base.repos.length, projectList(store()).length > 0)))
      .when(this.base.repos.length > 0, (el) => el.child(v_flex().flex_1().min_h(0).child(viewOf(this.view).view.body(this, t))))
      .child(this.statusLine(t));
  }
}
