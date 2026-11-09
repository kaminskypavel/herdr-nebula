import { isBoardLaunched } from "./labels.js";

// Herdr's word for each status -> the board's: blocked is needs you, working is
// working, done is finished and unseen, idle is finished and seen. An agent error
// counts as needing you, as in Herdr's own Agents list.
const FROM_HERDR = { blocked: "needs", error: "needs", working: "working", done: "unseen", idle: "seen" };

export const COLOR = { needs: "ansi1", working: "ansi3", unseen: "ansi6", seen: "ansi2", exited: "unknown" };

const SHELLS = new Set(["sh", "bash", "zsh", "fish", "nu", "pwsh"]);
const atPrompt = (t) => Boolean(t.program?.shell) || SHELLS.has(String(t.program?.name ?? t.agent ?? "").toLowerCase());

export function statusOf(t) {
  if (isBoardLaunched(t?.labels)) return atPrompt(t) ? "exited" : FROM_HERDR[t.status] ?? "exited";
  return FROM_HERDR[t?.status] ?? null;
}

export const STATUS_ORDER = ["needs", "working", "unseen", "seen"];

export function tally(statuses) {
  const n = { needs: 0, working: 0, unseen: 0, seen: 0, exited: 0 };
  for (const s of statuses) n[s]++;
  return n;
}
