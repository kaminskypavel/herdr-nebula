// Sessions you can resume that no Herdr tab holds: nebula's past sessions, copied once into
// ~/.config/herdr-nebula/history.json (on the first run, or again by Import from nebula), and Herdr sessions whose
// tab or pane closed while their conversation was known (⌘W on a pane ends its terminal). The board lists them. Reading nebula (its CLI and its sqlite db) lives here. Pure; `exec` is passed in.
import { nebulaFiles, SQLITE } from "./nebula-import.js";
import { nebulaBin, SESSIONS_ARGS, AGENTS_SQL, parseSessions, parseAgents, joinSessions } from "./nebula-sessions.js";

// Under home().
export const HISTORY = ".config/herdr-nebula/history.json";

/** The file's sessions, or null when the text is not a list. */
export function parseHistory(text) {
  try {
    const d = JSON.parse(String(text ?? ""));
    return Array.isArray(d) ? d : null;
  } catch {
    return null;
  }
}

/** nebula's sessions now (its CLI's list joined with its db's conversations), or null when nebula can't be read. */
export async function readNebulaSessions(exec, home) {
  const files = nebulaFiles(home);
  const [a, b] = await Promise.all([
    exec(nebulaBin(home), SESSIONS_ARGS, { timeout: 30000 }).catch(() => null),
    exec(SQLITE, ["-readonly", "-json", files.db, AGENTS_SQL], { timeout: 30000 }).catch(() => null),
  ]);
  if (a?.code !== 0 || b?.code !== 0) return null;
  try {
    return joinSessions(parseSessions(a.stdout), parseAgents(b.stdout));
  } catch {
    return null;
  }
}

// How many entries the history keeps (newest first).
export const HISTORY_MAX = 200;

/** A Herdr session that ended (its tab or pane closed) as a history entry, resumable by its conversation. */
export function closedEntry({ row, repo, band, claude }) {
  const launch = (() => {
    if (row.launch && typeof row.launch === "object") return row.launch;
    try {
      return JSON.parse(row.launch ?? "null") ?? {};
    } catch {
      return {};
    }
  })();
  return {
    id: `herdr:${claude}`,
    source: "herdr",
    name: row.title,
    worktree: band?.path || row.cwd || repo?.root || "",
    project: repo?.name ?? "",
    branch: band?.branch ?? null,
    status: "closed",
    alive: false,
    summary: row.said || row.prompt || "",
    claude,
    model: launch.model ?? (row.model || null),
    effort: launch.effort ?? (row.effort || null),
  };
}

/** The history with `entry` first (an older entry for the same conversation goes), at most `max` long. */
export const addToHistory = (list, entry, max = HISTORY_MAX) => [entry, ...(list ?? []).filter((e) => e.id !== entry.id)].slice(0, max);
