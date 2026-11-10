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
