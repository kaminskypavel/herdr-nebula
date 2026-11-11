// herdr-nebula is inspired by nebula but no longer reads it: nebula's past sessions are copied once into
// ~/.config/herdr-nebula/history.json (on the first run, or again by Import from nebula), and the board lists that
// file from then on. Reading nebula (its CLI and its sqlite db) lives here. Pure; `exec` is passed in.
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
