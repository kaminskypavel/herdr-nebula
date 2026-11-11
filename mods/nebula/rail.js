// The icon bar: Board (shows or folds the board, the focus key's job), then the project tabs like a
// vertical workspace switcher (All, the open projects in their shared order, calm icons with a red pill for the
// agents that need you and a cyan check for a finish you have not seen, and + for the projects picker), then New window, Help and Settings pinned at the bottom. The project list
// scrolls when it does not fit. A click selects a project (shared nebula.repo, which the board follows);
// a right-click opens a menu with Close. It also owns the keyboard cycle and the jump chords, because a hidden board receives no key commands:
// keys.json binds them to this mod's commands (focus, next, prev, jump), and the rail shows,
// folds or focuses the board (lib/focus.js decides which). The board answers through
// shared values:
//   nebula.boardKeys    true while the board has the keyboard (the board writes it)
//   nebula.focusBoard   a token the rail changes to ask the board for the keyboard
//   nebula.launched     a token the dialogs change after a launch from the board
// It reads nebula.open, nebula.repo, nebula.icons and nebula.cleared (the board and the picker write them) and works
// out each project's alerts itself, so they stay live while the board is folded. It also watches the window: a row
// that starts waiting hops its icon and, with the window in the background, posts a macOS notification; coming back
// after a while opens the welcome-back card (nebula-box role "away").
import { svg, div, image } from "gpui-kit";
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
  window,
  appHome,
  home,
  machines,
  watchFolder,
} from "herdr";
import { putToSleep } from "./sleeper.js";
import { STATE_DIR, STATE_FILE, SYNCED, same, snapshot, parseState, stateText, archiveStep, archiveApply } from "./lib/globalstate.js";
import { applySound } from "./lib/sounds.js";
import { trackIdle, sleepDue, SWEEP_MS, TRACK_MS } from "./lib/sleep.js";
import { mergeSettings } from "./lib/settings.js";
import { groupSessions } from "./lib/projects.js";
import { flatten } from "./lib/order.js";
import { statusOf } from "./lib/status.js";
import { step, findNode, FOLDED, TERMINAL, BOARD } from "./lib/focus.js";
import { STORE, projectList, reposWith, rootsKey, listCheckouts, jumpTarget } from "./lib/repos.js";
import { pickerHeight, summarize, currentOpen, closedNeeding } from "./lib/open.js";
import { buildBoard } from "./lib/viewmodel.js";
import { railTabs, tabHint, pillText, passFocusOn, moveTab, dropSlot } from "./lib/rail.js";
import { landing, rootOf } from "./lib/tabs.js";
import { focusCommand } from "./lib/preview.js";
import { iconFor } from "./lib/icons.js";
import { projectIcon } from "./lib/icon-view.js";
import { FOCUS_BOARD, LAUNCHED, BOARD_KEYS, OPEN, REPO, ICONS, ALL, UPDATE, SETTINGS, PINNED, PINNED_PROJECTS, CLEARED, REPLIES, BACK } from "./lib/shared.js";
import { waitingRows, AWAY_MS, clearKey } from "./lib/waiting.js";
import { projectAlerts, trackArrivals, awayItems } from "./lib/alerts.js";
import { sessionOf, TRANSCRIPT, lastReply, replyLine } from "./lib/reply.js";
import { SESSION } from "./lib/labels.js";
import {
  shq,
  TOOLS_SCRIPT,
  parseTools,
  notifierArgs,
  osascriptArgs,
  fallbackLine,
  FRONT_SCRIPT,
  herdrInFront,
  FRONT_POLL_MS,
  NOTIFIED_DIR,
  notifiedLock,
} from "./lib/notify.js";
import { fs, setTextScale } from "./lib/scale.js";
import { setReduceMotion, animate, markerTops, hopping, FADE, SPRING, HOP_PX } from "./lib/motion.js";
import { jumpSize } from "./lib/jump.js";
import { CHECK_EVERY_MS, updateState, updateNotice, updatedNotice, shouldNotify, reportIn } from "./lib/update.js";
import { HELP_SIZE } from "./lib/hints.js";
import { NOTHING_WAITING } from "./lib/flash.js";

// The bar's width (layouts/nebula.json rail-col): 76 leaves the macOS window buttons room, as Herdr's own folded sidebar does.
const RAIL_W = 76;
const REPICK_MS = 250; // after a project pick, when the bar shows its agent once more (see pick)
const PIN_ICON = "mods/nebula/icons/pin.svg";
const CHECK_ICON = "mods/nebula/icons/check.svg"; // a fresh finish, on the icon's corner
const LOGO = "mods/nebula/icons/nebula-logo.png"; // assets/logo.svg, rendered at 256px
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
    this.drag = null; // a press on a project tab: { root, index, y, moved } (drag to reorder)
    this.dropAt = null; // the slot a moved drag would land in
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
    this.startState(cx);
    this.hops = {}; // { [project root]: when its icon last began to hop }, for a row that just started waiting
    this.seenStatus = null; // each row's status at the last look (lib/alerts.js trackArrivals)
    this.awayAt = null; // when no Herdr window was in front any more, or null while one is
    this.herdrFront = true; // whether a Herdr window (this or another) is the front app, polled while this one is not
    this.frontAt = 0; // when that was last asked
    this.tabs = this.tabsNow();
    this.tabsKey = JSON.stringify([this.tabs, shared(ICONS), this.reduceMotion(), this.hopsNow()]);
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
          openOverlay({ mod: "nebula-box", kind: "dialog", modal: true, width: 640, height: 460 }); // ⌘K from an agent: its project (the board opens it when it has the keys)
        else if (c === "tab0")
          this.pickAll(); // ⌘0
        else if (/^tab[1-9]$/.test(c))
          this.pickTab(Number(c.slice(3))); // ⌘1 to ⌘9
        else if (c === "update")
          this.runUpdate(cx); // the update popup's click, or Settings' Update
        else if (c === "checkupdate")
          this.checkUpdate(cx, true); // Settings' Check now
        else if (c === "changes") this.openBox("changes", 560, 600); // the release notes pane (What changed)
        cx.notify();
      }
    });
    cx.timer.every(200, (cx) => this.watch(cx));
    cx.timer.every(10000, (cx) => this.refresh(cx));
    cx.timer.every(CHECK_EVERY_MS, (cx) => this.checkUpdate(cx)); // and once now, below
    this.checkUpdate(cx);
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
    if (this.pop && Date.now() > this.pop.until) {
      closeOverlay(this.pop.id);
      this.pop = null;
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
    this.look(cx);
    const f = focused(),
      term = f?.terminal ?? f?.agent ?? null,
      root = term ? rootOf(this.model, term) : null;
    if (root) this.lastIn[root] = term;
    const tabsKey = JSON.stringify([this.tabs, shared(ICONS), this.reduceMotion(), this.hopsNow()]);
    if (tabsKey !== this.tabsKey) {
      this.tabsKey = tabsKey;
      cx.notify();
    }
  }

  // The project tabs now: the open projects with what waits on you there (the red count and the finish ring,
  // lib/alerts.js: a row cleared on the board does not count), the selected one, and whether a closed project
  // needs you. Worked out here from the live sessions (the board's summary is stale while it is folded).
  tabsNow() {
    const model = buildBoard({ terminals: terminals(), agents: agents(), panes: panes(), spaces: spaces(), repos: this.repos() });
    this.model = model;
    const open = currentOpen(shared(OPEN), model, store());
    const pinned = shared(PINNED_PROJECTS) ?? [],
      cleared = shared(CLEARED),
      now = Date.now(),
      rowsOf = new Map(model.repos.map((r) => [r.root, r.rows]));
    const summary = summarize(model).map((p) => ({ ...p, ...projectAlerts(rowsOf.get(p.root) ?? [], cleared, now) }));
    return { ...railTabs({ summary, open, selected: shared(REPO), pinned }), open, plus: closedNeeding(model, open, shared(CLEARED) ?? {}) };
  }

  // The projects whose icon is mid-hop now, so the tabs key changes when a hop starts and when it ends.
  hopsNow() {
    const now = Date.now();
    return Object.keys(this.hops).filter((root) => hopping(this.hops[root], now));
  }

  // What changed around the window since the last tick. A row that just started waiting hops its project's icon
  // (not with Reduce motion) and, with the window in the background and the setting on macOS, posts a macOS
  // notification. The window coming back after AWAY_MS opens the welcome-back card for what began waiting meanwhile.
  // One state for every Herdr window (lib/globalstate.js): read ~/.config/herdr-nebula/state.json now and whenever
  // another window writes it.
  startState(cx) {
    this.gs = { ready: false, keys: null, archived: [], before: null, incoming: null, pending: null, wroteAt: 0, writing: false, again: false, at: 0 };
    const dir = `${home()}/${STATE_DIR}`;
    cx.spawn(async (cx) => {
      await exec("/bin/mkdir", ["-p", dir]).catch(() => null);
      await this.readState(false);
      for (;;) {
        await watchFolder(dir).catch(() => null);
        await this.readState(true);
        cx.notify();
      }
    });
  }

  // Applies the file's values here (another window's, or the first read at start). Our own writes are skipped.
  async readState(external) {
    const r = await exec("/bin/cat", [`${home()}/${STATE_DIR}/${STATE_FILE}`]).catch(() => null);
    const st = parseState(r?.code === 0 ? r.stdout : "");
    if (st && !(external && st.from === appHome() && st.at <= this.gs.wroteAt)) {
      for (const [k, v] of Object.entries(st.keys)) if (SYNCED.includes(k) && v !== null && !same(shared(k), v)) setShared(k, v);
      this.gs.keys = snapshot(shared);
      this.gs.incoming = st.archived;
    }
    this.gs.ready = true;
  }

  // Each second: keeps archived tabs and the shared values in step with the file (lib/globalstate.js). Waits for the
  // tabs to load, and for its own settle and unsettle commands to show, so it never mistakes them for the user's.
  syncState(now) {
    const g = this.gs;
    if (!g.ready || now - g.at < 1000 || machines().some((m) => m.layout === "loading")) return;
    g.at = now;
    const tabs = spaces().flatMap((s) => s.tabs),
      ids = tabs.map((x) => x.id),
      settled = tabs.filter((x) => x.settled).map((x) => x.id);
    if (g.pending && now < g.pending.until && (g.pending.settle.some((id) => !settled.includes(id)) || g.pending.unsettle.some((id) => settled.includes(id))))
      return;
    g.pending = null;
    const step =
      g.incoming && g.before !== null
        ? archiveApply({ archived: g.incoming, settled, tabs: ids })
        : archiveStep({ archived: g.incoming ?? g.archived, settled, before: g.before, tabs: ids });
    g.incoming = null;
    for (const id of step.settle) run("tab.settle", { id });
    for (const id of step.unsettle) run("tab.unsettle", { id });
    if (step.settle.length || step.unsettle.length) g.pending = { settle: step.settle, unsettle: step.unsettle, until: now + 2000 };
    g.before = [...new Set([...settled.filter((id) => !step.unsettle.includes(id)), ...step.settle])];
    this.syncSound();
    const keys = snapshot(shared);
    if (!same(keys, g.keys) || !same(step.archived, g.archived)) {
      g.keys = keys;
      g.archived = step.archived;
      this.writeState();
    }
  }

  // The Sound setting is shared, but Herdr reads its sounds from this window's own settings.json: make that file
  // match the choice (once per change, and at start), so every window plays the same sound.
  syncSound() {
    const sound = mergeSettings(shared(SETTINGS)).sound;
    if (sound === this.gs.sound || this.gs.soundBusy) return;
    this.gs.soundBusy = true;
    const file = `${appHome()}/settings.json`;
    exec("/bin/cat", [file])
      .catch(() => null)
      .then((r) => {
        const before = r?.code === 0 ? r.stdout : "",
          text = applySound(before, appHome(), sound);
        if (text.trim() === before.trim()) return null;
        return exec("/bin/sh", ["-c", 'printf %s "$1" > "$2.tmp" && mv "$2.tmp" "$2"', "sh", text, file]);
      })
      .then(() => {
        this.gs.sound = sound;
      })
      .catch(() => null)
      .finally(() => {
        this.gs.soundBusy = false;
      });
  }

  // Writes the file whole (temp file, then mv); a write asked for while one runs follows it.
  writeState() {
    const g = this.gs;
    if (g.writing) {
      g.again = true;
      return;
    }
    g.writing = true;
    g.wroteAt = Date.now();
    const file = `${home()}/${STATE_DIR}/${STATE_FILE}`,
      text = stateText({ keys: g.keys, archived: g.archived, from: appHome(), at: g.wroteAt });
    exec("/bin/sh", ["-c", 'mkdir -p "$(dirname "$2")" && printf %s "$1" > "$2.tmp" && mv "$2.tmp" "$2"', "sh", text, file])
      .catch(() => null)
      .finally(() => {
        g.writing = false;
        if (g.again) {
          g.again = false;
          this.writeState();
        }
      });
  }

  look(cx) {
    const now = Date.now(),
      cleared = shared(CLEARED),
      away = mergeSettings(shared(SETTINGS)).away,
      active = window()?.active !== false;
    this.syncState(now);
    if (active) this.herdrFront = true;
    else if (now - this.frontAt > FRONT_POLL_MS) {
      this.frontAt = now;
      cx.spawn(async () => {
        const r = await exec("/bin/sh", ["-c", FRONT_SCRIPT], { timeout: 3000 }).catch(() => null);
        this.herdrFront = r ? herdrInFront(r.stdout) : this.herdrFront;
      });
    }
    // Away means no Herdr window is in front: switching between two Herdr windows is not away.
    const front = active || this.herdrFront;
    const repoOf = new Map(this.model.repos.flatMap((repo) => repo.rows.map((row) => [row.id, repo])));
    const seen = trackArrivals(
      this.seenStatus,
      this.model.repos.flatMap((repo) => repo.rows),
      cleared,
    );
    this.seenStatus = seen.state;
    for (const row of seen.arrived) {
      const repo = repoOf.get(row.id);
      if (!this.reduceMotion()) this.hops[repo.root] = now;
      if (!front && away === "macos") this.notifyArrival(row, repo, cx);
    }
    if (!front) this.awayAt ??= now;
    else if (this.awayAt !== null) {
      const at = this.awayAt;
      this.awayAt = null;
      if (active && away !== "off" && now - at >= AWAY_MS) this.welcomeBack(at, now); // only the window you came back to
    }
  }

  // Coming back: when something began waiting while you were away, the board opens its Up next stack with "While
  // you were away" (shared BACK; a dialog over your work was too much).
  welcomeBack(at, now) {
    if (awayItems(waitingRows(this.model, shared(CLEARED)), at, shared(REPLIES)).length) setShared(BACK, { at: now, away: now - at });
  }

  // A macOS notification for a row that started waiting: its project and session as the title, the agent's own
  // line as the message. terminal-notifier's click runs `herdr-app do agent.focus` against this window's home;
  // without it (or herdr-app on PATH) osascript posts one with no click. Fired once per state change (look()).
  notifyArrival(row, repo, cx) {
    cx.spawn(async () => {
      await exec("/bin/mkdir", ["-p", NOTIFIED_DIR]).catch(() => null);
      const lock = await exec("/bin/mkdir", [notifiedLock(row.id, clearKey(row))]).catch(() => null);
      if (lock?.code !== 0) return; // another Herdr window posted it
      const [tools, line] = await Promise.all([this.tools(), this.agentLine(row)]);
      const title = `${repo.name} \u00b7 ${row.title}`;
      if (tools.notifier && tools.herdr)
        await exec(tools.notifier, notifierArgs({ title, message: line, group: row.id, home: appHome(), bin: tools.herdr, terminal: row.id })).catch(
          () => null,
        );
      else await exec("osascript", osascriptArgs(title, line)).catch(() => null);
    });
  }

  // Where herdr-app and terminal-notifier live, asked once of a login shell (like the update check) so the user's
  // PATH applies; the answer is kept when it found something.
  async tools() {
    if (this.found) return this.found;
    const r = await exec("/bin/sh", ["-c", `"\${SHELL:-/bin/zsh}" -lic ${shq(TOOLS_SCRIPT)} 2>/dev/null`], { timeout: 30000 }).catch(() => null);
    const found = parseTools(r?.stdout);
    if (found.herdr || found.notifier) this.found = found;
    return found;
  }

  // The line an agent last said (lib/reply.js reads its transcript), else "needs you" or "finished".
  async agentLine(row) {
    const s = sessionOf(terminals().find((t) => t.address === row.id)?.labels?.[SESSION]);
    if (s) {
      const r = await exec("/bin/sh", ["-c", TRANSCRIPT[s.app], "sh", s.id], { timeout: 5000 }).catch(() => null);
      const line = replyLine(lastReply(r?.stdout), row.status);
      if (line) return line;
    }
    return fallbackLine(row.status);
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
    const changed = Object.fromEntries(this.model.repos.flatMap((r) => r.rows.map((x) => [x.id, x.changedAt])));
    const to = jumpTarget(terminals(), this.repos(), f?.terminal ?? f?.agent ?? null, dir, { cleared: shared(CLEARED), changed });
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
  // ⌘0: the All tab, with the same name flash as ⌘1 to ⌘9.
  pickAll() {
    setShared(REPO, ALL);
    const id = openOverlay({
      mod: "nebula-box",
      kind: "window",
      key: "nebula-hud",
      frame: "none",
      width: 300,
      height: 60,
      props: { role: "hud", root: null, name: "All projects", n: 0, at: Date.now() },
    });
    this.hud = { id, until: Date.now() + 900 };
  }

  // Updates (lib/update.js): asks `herdr-nebula update --check` in a login shell (so node and ~/.local/bin are
  // on PATH), shares the report for the gear dot and Settings, and offers a new update once in a popup whose
  // click runs nebula.update. A changed HEAD since the last check means an update landed: it says so once.
  checkUpdate(cx, manual = false) {
    if (this.checking) return;
    this.checking = true;
    cx.spawn(async (cx) => {
      try {
        const r = await exec("/bin/sh", ["-c", `"\${SHELL:-/bin/zsh}" -lic 'herdr-nebula update --check --json' 2>/dev/null`], { timeout: 90000 }).catch(
          () => null,
        );
        const report = r?.code === 0 ? reportIn(r.stdout) : null;
        if (!report) {
          if (manual) this.popup({ title: "Could not check for herdr-nebula updates", body: "Is herdr-nebula installed and online?", level: "warning" });
          return;
        }
        setShared(UPDATE, { ...report, checkedAt: Date.now() });
        const head = localStorage.getItem("update.head");
        if (head && head !== report.head) this.popup(updatedNotice(report));
        localStorage.setItem("update.head", report.head);
        if (manual && updateState(report) === "current")
          this.popup({
            title: "herdr-nebula is up to date",
            body: report.version || report.head,
            level: "success",
            actions: [{ label: "What changed", name: "nebula.changes", args: {} }],
          });
        else if (manual || shouldNotify(report, localStorage.getItem("update.seen"))) {
          const n = updateNotice(report);
          if (n) this.popup(n);
          localStorage.setItem("update.seen", report.latest);
        }
      } finally {
        this.checking = false;
        cx.notify();
      }
    });
  }

  // Runs the update. Its reinstall reloads this mod, so success is told by the next check (a new HEAD).
  runUpdate(cx) {
    this.popup({ title: "Updating herdr-nebula", body: "Pulling and reinstalling", level: "info", timeout: 3000 });
    cx.spawn(async () => {
      const r = await exec("/bin/sh", ["-c", `"\${SHELL:-/bin/zsh}" -lic 'herdr-nebula update' 2>&1`], { timeout: 300000 }).catch(() => null);
      if (r?.code !== 0)
        this.popup({
          title: "herdr-nebula update failed",
          body: String(r?.stdout ?? "no reply")
            .trim()
            .split("\n")
            .pop(),
          level: "error",
        });
    });
  }

  // herdr-nebula's own popup (nebula-box/popup.js): a frameless window just above the bar's bottom, beside it.
  // Herdr's toast mod is its own and restored on every start, so update news does not go through notify().
  popup({ title, body = "", level = "info", actions = [], timeout = 9000 }) {
    const h = this.size?.height ?? 700;
    const id = openOverlay({
      mod: "nebula-box",
      kind: "window",
      key: "nebula-popup",
      frame: "none",
      width: 420,
      height: 64,
      at: { x: RAIL_W + 10, y: Math.max(10, h - 64 - 12) },
      props: { role: "popup", title, body, level, actions },
    });
    this.pop = { id, until: Date.now() + timeout };
  }

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
  button(t, id, tip, action, child, { on = false, dot = false, dotColor = null, mark = false, size = 32, menu = null, num = null } = {}) {
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
      .when(dot, (el) =>
        el.child(
          div()
            .absolute()
            .top(5)
            .right(5)
            .size(7)
            .rounded_full()
            .bg(dotColor ?? t.ansi1)
            .border_1()
            .border_color(t.chrome),
        ),
      );
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

  // A tile the size of a project icon around a glyph: the All tab's four squares, the + of the picker.
  tile(t, name, size = 18) {
    return div()
      .size(ICON)
      .flex_none()
      .rounded(7)
      .bg(t.raised)
      .border_1()
      .border_color(t.border)
      .flex()
      .items_center()
      .justify_center()
      .child(svg(icon(name)).size(size));
  }

  // A project's tab: its icon (the shared picture or initials), calm: a red pill with how many agents there need
  // you, a cyan check while a finish waits unseen (fading over its last minute), and a hop when a row just started
  // waiting. No status dot: four dots alike told you nothing.
  projectTab(t, p, { open, selected, n }) {
    const icons = shared(ICONS) ?? {},
      hint = tabHint(p.name, n),
      ring = p.on ? t.selected : t.chrome;
    const face = projectIcon({ icon: iconFor(icons, p.root, p.name), size: ICON });
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
    // A fresh finish: a cyan check on the icon's corner (a ring read as "selected"), fading over its last minute;
    // the red needs-you pill wins the corner.
    const hop = hopping(this.hops[p.root], Date.now());
    const lifted = animate(
      div()
        .id(`hop-${p.root}`)
        .relative()
        .size(ICON)
        .flex_none()
        .top(hop ? -HOP_PX : 0)
        .child(shown)
        .when(p.ring > 0 && !(p.needs > 0), (el) =>
          el.child(
            div()
              .absolute()
              .right(-6)
              .bottom(-6)
              .size(17)
              .rounded_full()
              .bg(t.ansi6)
              .border_2()
              .border_color(ring)
              .flex()
              .items_center()
              .justify_center()
              .opacity(p.ring)
              .child(svg(CHECK_ICON).size(10).text_color(t.background)),
          ),
        ),
      (el) => el.spring("top", SPRING),
    );
    const i = n - 1,
      d = this.drag?.moved ? this.drag : null,
      slot = d && this.dropAt !== null && this.dropAt !== d.index && this.dropAt !== d.index + 1 ? this.dropAt : null;
    const tab = this.button(
      t,
      `proj-${p.root}`,
      p.pinned ? `${hint.tip} · pinned` : hint.tip,
      () => {
        if (!this.drag?.moved) this.pick(p.root); // the release that ends a drag is not a click
      },
      lifted,
      { on: p.on, size: 42, num: hint.num, menu: () => this.projectMenu(p, open, selected) },
    );
    // Drag to reorder (lib/rail.js moveTab): press, move 4px, and a line shows where it lands; the rail's
    // mouse-up drops it. The line sits on the tab's top or bottom edge, so nothing shifts while it moves.
    const line = (top) =>
      div()
        .absolute()
        .left(5)
        .right(5)
        .h(2)
        .rounded(1)
        .bg(t.accent)
        .when(top, (el) => el.top(-3))
        .when(!top, (el) => el.bottom(-3));
    return div()
      .id(`drag-${p.root}`)
      .relative()
      .flex_none()
      .when(d?.root === p.root, (el) => el.opacity(0.4))
      .on_mouse_down("left", (e) => {
        this.drag = { root: p.root, index: i, y: e.position.y, moved: false };
        this.dropAt = null;
      })
      .on_mouse_move((e, cx) => {
        if (!this.drag) return;
        if (!this.drag.moved && Math.abs(e.position.y - this.drag.y) < 4) return;
        const at = e.local_position && e.bounds ? dropSlot(i, e.local_position.y, e.bounds.height) : i;
        if (this.drag.moved && at === this.dropAt) return;
        this.drag.moved = true;
        this.dropAt = at;
        cx.notify();
      })
      .child(tab)
      .when(slot === i, (el) => el.child(line(true)))
      .when(slot === i + 1, (el) => el.child(line(false)));
  }

  // The rail's mouse-up: a moved drag lands in its slot (the open order and the pins change together).
  dropTab(cx) {
    const d = this.drag;
    this.drag = null;
    if (!d?.moved || this.dropAt === null) {
      this.dropAt = null;
      return;
    }
    const order = this.tabs.items.map((x) => x.root),
      moved = moveTab(order, shared(PINNED_PROJECTS) ?? [], d.index, this.dropAt);
    this.dropAt = null;
    if (moved) {
      const open = shared(OPEN) ?? [];
      setShared(OPEN, [...moved.order, ...open.filter((r) => !moved.order.includes(r))]);
      setShared(PINNED_PROJECTS, moved.pinned);
    }
    cx.notify();
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
    setTextScale(settings(), mergeSettings(shared(SETTINGS)).textSize);
    setReduceMotion(this.reduceMotion());
    const t = theme();
    const needs = flatten(groupSessions(terminals(), this.repos())).some((x) => statusOf(x) === "needs");
    const tabs = this.tabs,
      selected = tabs.items.find((p) => p.on)?.root ?? null;
    const b = (id, tip, action, name, opts) => this.button(t, id, tip, action, svg(icon(name)).size(16), opts);
    return (
      v_flex()
        .id("rail")
        .size_full()
        .bg(t.chrome)
        .items_center()
        .on_mouse_up("left", (_e, cx) => this.dropTab(cx))
        .on_size_change((size) => {
          this.size = size; // where the popup goes (popup())
        })
        .on_hover((over, cx) => {
          if (over || !this.drag) return; // the pointer left the bar mid-drag: drop nothing
          this.drag = null;
          this.dropAt = null;
          cx.notify();
        })
        .gap(4)
        .pt(6)
        .pb(10)
        .child(this.button(t, "logo", "About herdr-nebula", () => this.openBox("about", 380, 400), image(LOGO).size(30).rounded(8), { size: 42 }))
        .when(tabs.items.length > 0, (el) =>
          el.child(
            this.button(t, "all", "All projects  \u23180", () => setShared(REPO, ALL), this.tile(t, "layout-grid"), {
              on: tabs.all,
              mark: true,
              size: 42,
              num: 0,
            }),
          ),
        )
        // A bold line between All and the projects (user: "insert here a bold separator").
        .when(tabs.items.length > 0, (el) => el.child(div().flex_none().w(32).h(2).my(2).rounded_full().bg(t.muted).opacity(0.55)))
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
        .child(this.button(t, "projects", "Open or close projects", () => this.openProjects(), this.tile(t, "plus", 16), { dot: tabs.plus, size: 42 }))
        .child(div().flex_1())
        // Show or fold the board (also ⌃`): at the bottom with the other window controls.
        .child(b("board", "Board (\u2303`)", (_e, cx) => this.toggleBoard(cx), "panel-left", { on: this.shown, dot: needs }))
        .child(b("window", "New window", (_e, cx) => this.newWindow(cx), "copy"))
        .child(b("help", "Shortcuts", () => this.openBox("help", HELP_SIZE.width, HELP_SIZE.height), "circle-help"))
        .child(
          this.button(
            t,
            "settings",
            updateState(shared(UPDATE) ?? {}) === "available" ? "Settings · an update is ready" : "Settings",
            () => this.openBox("settings", 580, 700),
            svg("mods/workspace-chrome/settings.svg").size(16),
            { dot: updateState(shared(UPDATE) ?? {}) === "available", dotColor: t.accent },
          ),
        )
    );
  }
}
