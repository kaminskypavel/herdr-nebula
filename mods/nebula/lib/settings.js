// The settings overlay's data and the shortcuts overlay's list, apart from the windows
// that show them. Settings live in shared("nebula.settings") as one object; a stored
// object may hold only some keys, and mergeSettings fills the rest. No herdr imports,
// so node can test it.
//
//   view            the view the board opens in when none was stored on this machine:
//                   tree, cards, list or columns
//   harness         the agent the new-session box starts on (when installed)
//   harnesses       per agent id: { model, effort }, null for the agent's own default
//   newWorktree     whether the new-session box starts with a new worktree on
//   autoTitle       sessions name themselves (the prompt hook reads this key; only
//                   false turns it off)
//   presetSide      where a new preset's text goes first: prefix (before the task) or
//                   postfix (after it)
//   confirmArchive  ask before archiving a session
//   editor          the command that opens a checkout (the folder is appended)
//   nebulaSessions  show nebula's own sessions on the board (a click resumes one)
//   promptLine      Tree and List rows carry a dim second line with the last prompt
//   showEmptyWorktrees  every checkout gets a band, one with no session in it too
//   preview         moving the highlight shows that agent in the main area while the board keeps
//                   the keys; Enter or a click steps in (lib/preview.js)
//   reduceMotion    every animation off, a static look (lib/motion.js animate())
//   sleepAfter      minutes a finished, seen agent may idle out of view before the rail stops its
//                   CLI to free memory (0 off, 5, 15, 30 or 60; a malformed value is 15, not off)
import { HARNESSES } from "./harness.js";
import { SLEEP_CHOICES, SLEEP_DEFAULT } from "./sleep.js";

export const VIEW_TITLE = { tree: "Tree", cards: "Cards", list: "List", columns: "Columns" };
export const VIEW_IDS = Object.keys(VIEW_TITLE);
export const SIDES = ["prefix", "postfix"];

export const DEFAULTS = {
  view: "tree",
  harness: "claude",
  harnesses: {},
  newWorktree: false,
  autoTitle: true,
  presetSide: "prefix",
  confirmArchive: false,
  editor: "open",
  nebulaSessions: true,
  promptLine: true,
  showEmptyWorktrees: true,
  preview: false,
  reduceMotion: false,
  sleepAfter: SLEEP_DEFAULT,
};

const text = (v) => (typeof v === "string" && v.trim() ? v : null);

function readHarnesses(v) {
  const out = {};
  if (!v || typeof v !== "object") return out;
  for (const id of Object.keys(HARNESSES)) {
    const c = v[id];
    if (c && typeof c === "object") out[id] = { model: text(c.model), effort: text(c.effort) };
  }
  return out;
}

export function mergeSettings(stored) {
  const s = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  return {
    ...s,
    view: VIEW_IDS.includes(s.view) ? s.view : DEFAULTS.view,
    harness: Object.hasOwn(HARNESSES, s.harness) ? s.harness : DEFAULTS.harness,
    harnesses: readHarnesses(s.harnesses),
    newWorktree: typeof s.newWorktree === "boolean" ? s.newWorktree : DEFAULTS.newWorktree,
    autoTitle: typeof s.autoTitle === "boolean" ? s.autoTitle : DEFAULTS.autoTitle,
    presetSide: SIDES.includes(s.presetSide) ? s.presetSide : DEFAULTS.presetSide,
    confirmArchive: typeof s.confirmArchive === "boolean" ? s.confirmArchive : DEFAULTS.confirmArchive,
    editor: text(s.editor) ?? DEFAULTS.editor,
    nebulaSessions: typeof s.nebulaSessions === "boolean" ? s.nebulaSessions : DEFAULTS.nebulaSessions,
    promptLine: typeof s.promptLine === "boolean" ? s.promptLine : DEFAULTS.promptLine,
    showEmptyWorktrees: typeof s.showEmptyWorktrees === "boolean" ? s.showEmptyWorktrees : DEFAULTS.showEmptyWorktrees,
    preview: typeof s.preview === "boolean" ? s.preview : DEFAULTS.preview,
    reduceMotion: typeof s.reduceMotion === "boolean" ? s.reduceMotion : DEFAULTS.reduceMotion,
    sleepAfter: SLEEP_CHOICES.includes(s.sleepAfter) ? s.sleepAfter : DEFAULTS.sleepAfter,
  };
}

export const defaultHarness = (s, ids) => (ids.includes(s.harness) ? s.harness : (ids[0] ?? null));

export const harnessChoice = (s, id) => ({ model: s.harnesses[id]?.model ?? null, effort: s.harnesses[id]?.effort ?? null });

export const cycleOf = (list, current, dir) => list[(Math.max(0, list.indexOf(current)) + dir + list.length) % list.length];

export function strokeLabel(keys, mac) {
  const names = mac ? { ctrl: "⌃", alt: "⌥", shift: "⇧", cmd: "⌘", fn: "fn" } : { ctrl: "Ctrl", alt: "Alt", shift: "Shift", cmd: "Super", fn: "Fn" };
  const alias = { secondary: mac ? "cmd" : "ctrl", super: "cmd", win: "cmd" };
  return String(keys)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((stroke) => {
      const parts = stroke.split("-");
      let key = parts.pop();
      if (key === "") {
        key = "-";
        parts.pop();
      }
      const held = new Set(parts.map((m) => alias[m.toLowerCase()] ?? m.toLowerCase()));
      if (/^[A-Z]$/.test(key)) held.add("shift");
      const mods = Object.keys(names)
        .filter((m) => held.has(m))
        .map((m) => names[m]);
      const label = key.length === 1 ? (mods.length ? key.toUpperCase() : key) : key[0].toUpperCase() + key.slice(1).toLowerCase();
      return [...mods, label].join(mac ? "" : "+");
    })
    .join(" ");
}

const b = (action, def) => ({ action, def });
const SHORTCUTS = [
  {
    group: "Anywhere",
    col: 0,
    rows: [
      { keys: [b("nebula.keys", "⌃`")], text: "board: take keys, fold" },
      { keys: [b("nebula.next", "⌘]"), b("nebula.prev", "⌘[")], text: "next, previous needs-you" },
      { keys: [b("nebula.new", "⌘K")], text: "new session (p on the board)" },
      { keys: [b("nebula.jump", "⌘J")], text: "jump to any agent, any project" },
      { keys: [b("nebula.tab1", "⌘1"), b("nebula.tab9", "⌘9")], text: "first to ninth project" },
    ],
  },
  {
    group: "New-session box",
    col: 0,
    rows: [
      { keys: ["^P", "^T", "Tab"], text: "repo, checkout, agent" },
      { keys: ["^N", "^B"], text: "new worktree, branch" },
      { keys: ["^O", "⇧Tab"], text: "next preset, presets list" },
      { keys: ["^G"], text: "pick the agent" },
    ],
  },
  {
    group: "Board",
    col: 1,
    rows: [
      { keys: ["j", "k", "↑", "↓", "Tab", "⇧Tab"], text: "move" },
      { keys: ["click"], text: "show it, keys stay here" },
      { keys: ["↩", "double click"], text: "step in, resume if exited" },
      { keys: ["Esc"], text: "keys back to the terminal" },
      { keys: ["/", "f", "?"], text: "jump to any agent, filter, help" },
      { keys: [".", ","], text: "next, previous needs-you" },
      { keys: [";"], text: "next done, not seen yet" },
      { keys: ["p", "e", "v"], text: "new, presets, view" },
      { keys: ["o", "m"], text: "sort, Columns by status or project" },
      { keys: ["-", "="], text: "fold all, expand all" },
      { keys: ["p", "d"], text: "on an empty worktree: new, delete" },
      { keys: ["s"], text: "pin beside, again to unpin" },
      { keys: ["r", "a", "u", "d"], text: "rename, archive, unarchive (or undo), delete" },
      { keys: ["⇧P", "⇧↩", "A"], text: "relaunch, open folder, archived" },
      { keys: ["⇧R"], text: "resume exited or asleep" },
      { keys: ["z"], text: "sleep agent now" },
      { keys: ["0", "1 to 9"], text: "All tab, project tab" },
    ],
  },
];

// A key of the lists above: a literal string, or { action, def } drawn as the key bound to the
// action in keys() (def when none is).
export const shortcutLabel = (binds, mac) => (k) => {
  if (typeof k === "string") return k;
  const hit = (binds ?? []).find((e) => e.action === k.action && String(e.keys ?? "").trim());
  return hit ? strokeLabel(hit.keys, mac) : k.def;
};

// The colors of the status dots and titles, for the Help sheet: status (lib/status.js COLOR gives its color) and
// what the row looks like. The same words the board uses.
export const LEGEND = [
  { status: "needs", label: "needs you", text: "red title, bar and dot" },
  { status: "working", label: "working", text: "yellow dot" },
  { status: "unseen", label: "done, not seen", text: "bold title, cyan age" },
  { status: "seen", label: "done, seen", text: "muted title, green dot" },
];

export function groupShortcuts(binds, mac) {
  const label = shortcutLabel(binds, mac);
  return SHORTCUTS.map((g) => ({ group: g.group, col: g.col, rows: g.rows.map((r) => ({ keys: r.keys.map(label).join(" "), text: r.text })) }));
}
