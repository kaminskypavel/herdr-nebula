// Nebula's own sessions on the board, read only: `nebula sessions --json` lists them,
// nebula.db says which Claude conversation each one holds. This file parses both outputs,
// joins them, hides what is already resumed here, builds the board rows and the resume
// argv. Pure, so node can test it. No herdr imports.
//
// shared("nebula.resumed") is { [nebulaId]: herdrTerminalAddress }: the sessions this
// board resumed. A still-running nebula session resumes as a fork (the original keeps
// running there), so its row stays, marked forked; an idle one moves to Herdr and its
// row hides while that terminal exists.
import { buildArgv } from "./harness.js";
import { norm } from "./projects.js";

export const nebulaBin = (home) => `${home}/.local/bin/nebula`;
export const SESSIONS_ARGS = ["sessions", "--json"];
export const AGENTS_SQL = "select id, claude_session_id, model, effort, archived from agents where archived = 0 and kind = 'claude'";

const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

function json(out) {
  try { return JSON.parse(String(out ?? "").trim() || "null"); } catch { return null; }
}

// The CLI prints { sessions: [...] }; a bare list is accepted too. Anything else: [].
export function parseSessions(out) {
  const d = json(out);
  const list = Array.isArray(d) ? d : d?.sessions;
  return Array.isArray(list) ? list.filter((s) => s && typeof s === "object") : [];
}

// sqlite3 -json prints nothing for an empty table. -> Map id -> { claude, model, effort }
export function parseAgents(out) {
  const d = json(out), map = new Map();
  for (const a of Array.isArray(d) ? d : []) {
    const id = text(a?.id), claude = text(a?.claude_session_id);
    if (id && claude && !a.archived) map.set(id, { claude, model: text(a.model), effort: text(a.effort) });
  }
  return map;
}

// Claude sessions that have a conversation id and a folder. Alive ones first.
export function joinSessions(sessions, agents) {
  const out = [];
  for (const s of sessions) {
    const a = agents.get(s.id), worktree = text(s.worktree), name = text(s.name);
    if (s.harness !== "claude" || !a || !worktree || !name) continue;
    out.push({
      id: s.id, name, worktree: norm(worktree), project: text(s.project) ?? "", branch: text(s.branch),
      status: text(s.status) ?? "idle", alive: s.alive === true, summary: text(s.summary) ?? "", ...a,
    });
  }
  return out.sort((x, y) => Number(y.alive) - Number(x.alive));
}

// The Herdr terminal this board already resumed nebula session `id` in, while it still exists; else null.
export function resumedTerminal(resumed, id, live) {
  const t = resumed?.[id];
  return t && live.has(t) ? t : null;
}

// What stays on the board: not an idle session that is already open in Herdr. `live` is a
// Set of the terminal addresses that exist now. Each gets `forked`: resumed here and still
// running in nebula.
export function visibleSessions(list, resumed, live) {
  const out = [];
  for (const s of list) {
    const open = Boolean(resumedTerminal(resumed, s.id, live));
    if (open && !s.alive) continue;
    out.push({ ...s, forked: open });
  }
  return out;
}

// A board row (see sessionRow in viewmodel.js). Its ball is grey (status exited) and its
// title dim; `age` carries the words. kind "nebula" tells actionsFor and the board.
export function nebulaRow(s) {
  const state = s.alive ? "running in nebula" : s.status;
  return {
    id: `nebula:${s.id}`, kind: "nebula", nebula: s, address: null, pane: null, tab: null, cwd: s.worktree,
    status: "exited", exited: true, offers: [], archived: false, title: s.name, badge: "nebula",
    program: "claude", model: s.model ?? "", effort: s.effort ?? "", launch: null, prompt: s.summary === s.name ? "" : s.summary,
    age: s.forked ? `${state} (forked)` : state, subs: [],
  };
}

// claude --resume <conversation> [--fork-session] [--model m] [--effort e]
export function resumeArgv(s) {
  const [program, ...rest] = buildArgv({ harness: "claude", model: s.model, effort: s.effort });
  return [program, "--resume", s.claude, ...(s.alive ? ["--fork-session"] : []), ...rest];
}

// The shared value after recording a resume; entries whose terminal is gone are dropped.
export function recordResumed(resumed, id, terminal, live) {
  const next = {};
  for (const [k, v] of Object.entries(resumed ?? {})) if (live.has(v)) next[k] = v;
  next[id] = terminal;
  return next;
}
