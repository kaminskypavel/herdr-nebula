// What a session row's second line says besides its age: the agent's icon (its name when
// Herdr has no icon for it), then the model and effort when known. Pure; no herdr imports.

// Agents with an icons/<id>.svg in Herdr's icon folder (the harness ids plus the other CLIs it knows).
const ICONS = new Set(["claude", "codex", "cursor", "pi", "muse", "grok", "opencode", "gemini", "amp", "copilot"]);

const known = (v) => {
  const s = String(v ?? "").trim();
  return s && s.toLowerCase() !== "default" ? s : "";
};

// -> { icon: "icons/<id>.svg" | null, text } ; text is "" when there is nothing to say.
// Rows launched from the box know their harness; others fall back to the program name.
export function rowMeta(row) {
  const id = String(row.launch?.harness || row.program || "").toLowerCase();
  const icon = ICONS.has(id) ? `icons/${id}.svg` : null;
  const text = [icon ? "" : row.program, known(row.model), known(row.effort)].filter(Boolean).join(" · ");
  return { icon, text };
}
