// Resuming a conversation: the CLI's session id lives on the terminal as the label
// nebula.session, "<app>:<id>" (the prompt hook writes it, as nebula saves the id once a turn
// has run: the transcript a resume reads only exists after the first prompt). When the agent
// has left the shell, the board types the resume command into the same terminal. Pure; no
// herdr imports, so node can test it. The id goes into a shell line, so only a plain token
// is ever accepted.
import { buildArgv } from "./harness.js";

// The apps whose hook reports a session id, and the arguments that resume it. Codex resumes
// with a subcommand (`codex resume <id>`), Claude with a flag; the launch flags (model,
// effort, Codex's --no-daemon) follow, as buildArgv orders them.
const RESUME = { claude: (id) => ["--resume", id], codex: (id) => ["resume", id] };
export const SESSION_APPS = Object.keys(RESUME);

// What the agent types to leave, and the keys that stop it if that is not enough.
export const EXIT_TEXT = "/exit";
export const EXIT_KEYS = ["ctrl+c", "ctrl+c"];

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export const sessionValue = (app, id) => `${app}:${id}`;

/** -> { app, id } or null. A label that is not "<known app>:<plain token>" is no session. */
export function parseSession(value) {
  const s = String(value ?? "").trim();
  const i = s.indexOf(":");
  const app = s.slice(0, i),
    id = s.slice(i + 1);
  return i > 0 && Object.hasOwn(RESUME, app) && ID.test(id) ? { app, id } : null;
}

/**
 * The label value the prompt hook should write, or null to leave it. `current` is the stored
 * label, `payloadId` the hook payload's session_id. The same id writes nothing (a resume or a
 * compact keeps its id); a different one is a new conversation (/clear, /new) and replaces it.
 */
export function nextSession(app, current, payloadId) {
  const id = typeof payloadId === "string" ? payloadId.trim() : "";
  if (!Object.hasOwn(RESUME, app) || !ID.test(id)) return null;
  const value = sessionValue(app, id);
  return value === current ? null : value;
}

const quote = (a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`);

/**
 * The shell line that resumes a conversation: `claude --resume <id> [--model m] [--effort e]`,
 * `codex resume <id> --no-daemon [--model m] [-c model_reasoning_effort=e]`. The model and
 * effort come from the launch label, only when it launched the same app. Null when the
 * session label is missing or unreadable.
 */
export function resumeCommand(sessionLabel, launch) {
  const s = parseSession(sessionLabel);
  if (!s) return null;
  const same = launch?.harness === s.app;
  const [program, ...rest] = buildArgv({ harness: s.app, model: same ? launch.model : null, effort: same ? launch.effort : null });
  return [program, ...RESUME[s.app](s.id), ...rest].map(quote).join(" ");
}

/** A row the board can resume in its own terminal: the agent has left and its id is known. */
export const canResume = (row) => Boolean(row?.exited && row.session && row.address && row.kind !== "nebula");

/** What the right-hand text of a resumable row says; "" for any other. */
export const resumeHint = (row) => (canResume(row) ? `${row.asleep ? "asleep" : "exited"} · Enter resumes` : "");
