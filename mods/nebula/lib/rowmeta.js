import { clearKey } from "./waiting.js";

// What a session row's second line says besides its age: the agent's icon (its name when
// Herdr has no icon for it), then the model and effort when known. Pure; no herdr imports.

// Agents with an icons/<id>.svg in Herdr's icon folder (the harness ids plus the other CLIs it knows).
const ICONS = new Set(["claude", "codex", "cursor", "pi", "muse", "grok", "opencode", "gemini", "amp", "copilot"]);

const known = (v) => {
  const s = String(v ?? "").trim();
  return s && s.toLowerCase() !== "default" ? s : "";
};

// The agent and model a row runs on, as one comparable string.
const metaKey = (row) => `${String(row.launch?.harness || row.program || "").toLowerCase()}|${known(row.model)}`;

/**
 * Marks which rows of one project run something other than the project's usual agent and model: sets
 * `metaOdd` on each row (true: its harness or model differs from the most common one; a tie goes to the
 * one met first). The board shows the agent icon and model only on those rows and on the selected one.
 * Mutates the rows (buildBoard makes fresh ones every time).
 */
export function stampOdd(rows) {
  const count = new Map();
  let common = null;
  for (const r of rows) {
    const k = metaKey(r),
      n = (count.get(k) ?? 0) + 1;
    count.set(k, n);
    if (common === null || n > count.get(common)) common = k;
  }
  for (const r of rows) r.metaOdd = metaKey(r) !== common;
}

// -> { icon: "icons/<id>.svg" | null, text } ; text is "" when there is nothing to say.
// Rows launched from the box know their harness; others fall back to the program name.
export function rowMeta(row) {
  const id = String(row.launch?.harness || row.program || "").toLowerCase();
  const icon = ICONS.has(id) ? `icons/${id}.svg` : null;
  const text = [icon ? "" : row.program, known(row.model), known(row.effort)].filter(Boolean).join(" · ");
  return { icon, text };
}

const waiting = (row) => row.status === "needs" || row.status === "unseen";

/**
 * The line an agent last said, for a row that needs you or finished unseen: the cached reply when it was read for
 * this very state (its key is the row's clearKey), else "". A moved-on state never shows an old line.
 */
export const saidBy = (replies, row) => (waiting(row) && replies?.[row.id]?.key === clearKey(row) ? (replies[row.id].line ?? "") : "");

/** How long a task is when it stands in for a title. */
export const TASK_MAX = 48;

/**
 * A session named like its project says nothing the project's name does not, so its task (the last prompt) stands in
 * as its title, cut to TASK_MAX. Sets `title` and `taskTitle` (the views then do not repeat the prompt under it) and keeps the
 * tab's own name in `tabName` (for rename). Mutates the rows of one project (buildBoard makes fresh ones every time).
 */
export function stampTask(rows, project) {
  const same = (s) =>
    String(s ?? "")
      .trim()
      .toLowerCase();
  for (const r of rows) {
    const task = String(r.prompt ?? "").trim();
    if (!task || r.kind === "nebula" || same(r.title) !== same(project)) continue;
    r.tabName = r.title;
    r.title = task.length > TASK_MAX ? `${task.slice(0, TASK_MAX - 1).trimEnd()}…` : task;
    r.taskTitle = true;
  }
}
