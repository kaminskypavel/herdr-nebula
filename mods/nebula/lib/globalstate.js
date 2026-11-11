// One herdr-nebula state for every Herdr window. Each window (app home) has its own shared values and Herdr keeps
// settled ("archived") tabs per screen, so closing a project or archiving a session in one window was lost when
// Herdr next opened the other. The icon bar keeps ~/.config/herdr-nebula/state.json in step with this window: it
// writes what changed here and applies what another window wrote (watchFolder). Pure; no herdr imports.
import { PROJECTS, OPEN, PINNED_PROJECTS, PINNED, HIDDEN, SETTINGS, CLEARED } from "./shared.js";

// Under home().
export const STATE_DIR = ".config/herdr-nebula";
export const STATE_FILE = "state.json";
// The shared values every window shares (not the selected tab, icons, drafts or anything per screen).
export const SYNCED = [PROJECTS, OPEN, PINNED_PROJECTS, PINNED, HIDDEN, SETTINGS, CLEARED];

export const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The synced values now, from `get` (herdr's shared). -> { [key]: value | null }. */
export const snapshot = (get) => Object.fromEntries(SYNCED.map((k) => [k, get(k) ?? null]));

/** The file's state, or null when it is missing or not ours. -> { keys, archived, from, at }. */
export function parseState(text) {
  try {
    const d = JSON.parse(String(text ?? ""));
    if (!d || typeof d !== "object" || typeof d.keys !== "object") return null;
    return {
      keys: d.keys ?? {},
      archived: Array.isArray(d.archived) ? d.archived.filter((x) => typeof x === "string") : [],
      from: d.from ?? null,
      at: Number(d.at) || 0,
    };
  } catch {
    return null;
  }
}

export const stateText = ({ keys, archived, from, at }) => `${JSON.stringify({ v: 1, from, at, keys, archived }, null, 2)}\n`;

/**
 * The archived list after one look. archived: the list so far; settled: the tabs settled on this screen now;
 * before: those settled at the last look (null at the first look); tabs: every tab that exists now.
 * The first look merges: what the file says plus what this screen already had. Later looks follow this screen:
 * a tab settled here joins, one brought back here (shown, or its agent needs you) leaves. Tabs that are gone drop.
 * -> { archived, settle (tabs to settle here), unsettle (tabs to bring back here) }.
 */
export function archiveStep({ archived, settled, before, tabs }) {
  const live = new Set(tabs),
    here = new Set(settled);
  let next;
  if (before === null) next = [...new Set([...archived, ...settled])];
  else {
    const was = new Set(before);
    const added = settled.filter((id) => !was.has(id)),
      removed = before.filter((id) => !here.has(id));
    next = [...new Set([...archived, ...added])].filter((id) => !removed.includes(id));
  }
  next = next.filter((id) => live.has(id));
  return { archived: next, settle: next.filter((id) => !here.has(id)), unsettle: [] };
}

/** Another window's list applied here: settle what it archived, bring back what it no longer has. */
export function archiveApply({ archived, settled, tabs }) {
  const live = new Set(tabs),
    want = new Set(archived.filter((id) => live.has(id)));
  return { archived: [...want], settle: [...want].filter((id) => !settled.includes(id)), unsettle: settled.filter((id) => !want.has(id)) };
}
