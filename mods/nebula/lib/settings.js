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
import { HARNESSES } from "./harness.js";

export const VIEW_TITLE = { tree: "Tree", cards: "Cards", list: "List", columns: "Columns" };
export const VIEW_IDS = Object.keys(VIEW_TITLE);
export const SIDES = ["prefix", "postfix"];

export const DEFAULTS = {
  view: "tree", harness: "claude", harnesses: {}, newWorktree: false, autoTitle: true,
  presetSide: "prefix", confirmArchive: false, editor: "open", gradientTiles: true, nebulaSessions: true,
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
    gradientTiles: typeof s.gradientTiles === "boolean" ? s.gradientTiles : DEFAULTS.gradientTiles,
    nebulaSessions: typeof s.nebulaSessions === "boolean" ? s.nebulaSessions : DEFAULTS.nebulaSessions,
  };
}

export const defaultHarness = (s, ids) => (ids.includes(s.harness) ? s.harness : ids[0] ?? null);

export const harnessChoice = (s, id) => ({ model: s.harnesses[id]?.model ?? null, effort: s.harnesses[id]?.effort ?? null });

export const cycleOf = (list, current, dir) => list[(Math.max(0, list.indexOf(current)) + dir + list.length) % list.length];

export function strokeLabel(keys, mac) {
  const names = mac ? { ctrl: "⌃", alt: "⌥", shift: "⇧", cmd: "⌘", fn: "fn" } : { ctrl: "Ctrl", alt: "Alt", shift: "Shift", cmd: "Super", fn: "Fn" };
  const alias = { secondary: mac ? "cmd" : "ctrl", super: "cmd", win: "cmd" };
  return String(keys).trim().split(/\s+/).filter(Boolean).map((stroke) => {
    const parts = stroke.split("-");
    let key = parts.pop();
    if (key === "") { key = "-"; parts.pop(); }
    const held = new Set(parts.map((m) => alias[m.toLowerCase()] ?? m.toLowerCase()));
    if (/^[A-Z]$/.test(key)) held.add("shift");
    const mods = Object.keys(names).filter((m) => held.has(m)).map((m) => names[m]);
    const label = key.length === 1 ? (mods.length ? key.toUpperCase() : key) : key[0].toUpperCase() + key.slice(1).toLowerCase();
    return [...mods, label].join(mac ? "" : "+");
  }).join(" ");
}

const b = (action, def) => ({ action, def });
const SHORTCUTS = [
  { group: "Anywhere", col: 0, rows: [
    { keys: [b("nebula.focus", "⌃`")], text: "board: take keys, fold" },
    { keys: [b("nebula.next", "⌘]"), b("nebula.prev", "⌘[")], text: "next, previous needs-you" },
    { keys: [b("mod.open:nebula-box", "⌘K")], text: "new session" },
  ] },
  { group: "New-session box", col: 0, rows: [
    { keys: ["^P", "^T", "Tab"], text: "repo, checkout, agent" },
    { keys: ["^N", "^B"], text: "new worktree, branch" },
    { keys: ["^O", "⇧Tab"], text: "next preset, presets list" },
    { keys: ["^G"], text: "pick the agent" },
  ] },
  { group: "Board", col: 1, rows: [
    { keys: ["j", "k", "↑", "↓"], text: "move highlight" },
    { keys: ["↩", "click"], text: "show agent" },
    { keys: [".", ","], text: "next, previous needs-you" },
    { keys: ["p", "e", "v"], text: "new, presets, view" },
    { keys: ["r", "a", "u", "d"], text: "rename, archive, unarchive, delete" },
    { keys: ["⇧P", "⇧↩", "A"], text: "relaunch, open folder, archived" },
    { keys: ["1 to 9"], text: "repo" },
  ] },
];

export function groupShortcuts(binds, mac) {
  const label = (k) => {
    if (typeof k === "string") return k;
    const hit = (binds ?? []).find((e) => e.action === k.action && String(e.keys ?? "").trim());
    return hit ? strokeLabel(hit.keys, mac) : k.def;
  };
  return SHORTCUTS.map((g) => ({ group: g.group, col: g.col, rows: g.rows.map((r) => ({ keys: r.keys.map(label).join(" "), text: r.text })) }));
}

// The two theme colors of a project tile's gradient, by the tile's place on the rail, so
// neighbours never share colors. Pairs of the theme's ANSI colors.
const TILE_PAIRS = [["ansi5", "ansi4"], ["ansi6", "ansi4"], ["ansi2", "ansi6"], ["ansi3", "ansi1"], ["ansi1", "ansi5"], ["ansi4", "ansi6"], ["ansi3", "ansi2"], ["ansi5", "ansi1"]];
export const tileColors = (index) => TILE_PAIRS[((index % TILE_PAIRS.length) + TILE_PAIRS.length) % TILE_PAIRS.length];
