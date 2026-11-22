import { isBoardLaunched } from "./labels.js";

// Herdr's word for each status -> the board's: blocked is needs you, working is
// working, done is finished and unseen, idle is finished and seen. An agent error
// counts as needing you, as in Herdr's own Agents list.
const FROM_HERDR = { blocked: "needs", error: "needs", working: "working", done: "unseen", idle: "seen" };

export const COLOR = { needs: "ansi1", working: "ansi3", unseen: "ansi6", seen: "ansi2", exited: "unknown" };

const SHELLS = new Set(["sh", "bash", "zsh", "fish", "nu", "pwsh"]);
const atPrompt = (t) => Boolean(t.program?.shell) || SHELLS.has(String(t.program?.name ?? t.agent ?? "").toLowerCase());

export function statusOf(t) {
  if (isBoardLaunched(t?.labels)) return atPrompt(t) ? "exited" : (FROM_HERDR[t.status] ?? "exited");
  // An agent Herdr started that exited to its shell still carries its conversation: a stopped agent (Enter resumes).
  if (t?.labels?.["nebula.session"] && atPrompt(t)) return "exited";
  return FROM_HERDR[t?.status] ?? null;
}

// terminals() keeps the core's word, so an agent that finished stays "done" there after you looked;
// agents() turns it "idle" once someone looks on any Herdr client. Take that seen verdict.
export function withSeen(terminals, agents) {
  const said = new Map(agents.map((a) => [a.address, a.status]));
  return terminals.map((t) => (t.status === "done" && said.get(t.address) === "idle" ? { ...t, status: "idle" } : t));
}

// A plain terminal in a Herdr tab (a shell from ⌘T or Open terminal, or a dev server): no agent status, not one the
// board launched (that is an agent still starting), and in a Herdr tab. The board lists it as a quiet row.
export const isShell = (t) => statusOf(t) === null && !isBoardLaunched(t?.labels) && Boolean(t?.labels?.["herdr.tab"]);

export const STATUS_ORDER = ["needs", "working", "unseen", "seen"];

export function tally(statuses) {
  const n = { needs: 0, working: 0, unseen: 0, seen: 0, exited: 0 };
  for (const s of statuses) n[s]++;
  return n;
}
