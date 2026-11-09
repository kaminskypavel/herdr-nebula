// What the "Import from nebula" dialog and the board's empty state need, apart from
// the windows: where nebula keeps its files, how to read them, and what an import
// changes. Everything here is read-only against nebula and pure, so node can test it.
// No herdr imports.
import { HARNESSES } from "./harness.js";
import { mergeSettings } from "./settings.js";
import { addProject, projectList } from "./repos.js";
import { norm } from "./projects.js";

export const SQLITE = "/usr/bin/sqlite3";
export const PROJECTS_SQL = "select name, repo_path, sort_order from projects order by sort_order, created_at";

export function nebulaFiles(home) {
  const dir = `${home}/Library/Application Support/dev.nebula.nebula`;
  return { db: `${dir}/nebula.db`, config: `${dir}/config.json` };
}

// sqlite3 -json prints nothing for an empty table. Malformed text throws.
export function parseNebulaProjects(jsonText) {
  const text = String(jsonText ?? "").trim();
  if (!text) return [];
  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) throw new TypeError("nebula's project list is not a list");
  const out = [];
  for (const r of rows) {
    const root = typeof r?.repo_path === "string" ? norm(r.repo_path.trim()) : "";
    if (!root) continue;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    out.push({ root, name: name || root.split("/").pop() || root });
  }
  return out;
}

// "default" (any case) and anything that is not text mean no override.
const pick = (v) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s && s.toLowerCase() !== "default" ? s : null;
};

const first = (config, keys) => keys.map((k) => config[k]).find((v) => typeof v === "boolean");

// -> { harnesses?, editor?, confirmArchive? }, only the parts nebula sets. Models outside
// our lists stay as free text.
export function settingsFromNebula(config) {
  const c = config && typeof config === "object" && !Array.isArray(config) ? config : {};
  const patch = {},
    harnesses = {};
  for (const id of Object.keys(HARNESSES)) {
    const keys = id === "opencode" ? ["opencode", "open_code"] : [id];
    const model = keys.map((k) => pick(c[`${k}_model`])).find(Boolean) ?? null;
    const effort = keys.map((k) => pick(c[`${k}_effort`])).find(Boolean) ?? null;
    if (model || effort) harnesses[id] = { model, effort };
  }
  if (Object.keys(harnesses).length) patch.harnesses = harnesses;
  const editor = typeof c.editor === "string" ? c.editor.trim() : "";
  if (editor) patch.editor = editor;
  const confirm = first(c, ["ask_before_archive", "confirm_on_archive"]);
  if (confirm !== undefined) patch.confirmArchive = confirm;
  return patch;
}

// The patch laid over the current settings. A harness the patch names changes only the
// parts it carries, so an effort nebula leaves at default keeps ours.
export function applySettings(current, patch) {
  const s = mergeSettings(current),
    harnesses = { ...s.harnesses };
  for (const [id, c] of Object.entries(patch.harnesses ?? {})) {
    harnesses[id] = { model: c.model ?? harnesses[id]?.model ?? null, effort: c.effort ?? harnesses[id]?.effort ?? null };
  }
  const { harnesses: _h, ...rest } = patch;
  return mergeSettings({ ...s, ...rest, harnesses });
}

// "claude: opus, high effort; editor: nano"
export function describeSettings(patch) {
  const parts = Object.entries(patch.harnesses ?? {}).map(([id, c]) => `${id}: ${[c.model, c.effort && `${c.effort} effort`].filter(Boolean).join(", ")}`);
  if (patch.editor) parts.push(`editor: ${patch.editor}`);
  if (typeof patch.confirmArchive === "boolean") parts.push(`confirm archive: ${patch.confirmArchive ? "on" : "off"}`);
  return parts.join("; ");
}

// Adds the roots that are neither listed nor removed on purpose, in nebula's order.
export function planImport(store, projects) {
  const removed = new Set((store?.removed ?? []).map(norm));
  let next = store ?? {},
    added = 0;
  for (const p of projects) {
    if (removed.has(norm(p.root))) continue;
    const was = projectList(next).length;
    next = addProject(next, p.root, { name: p.name });
    if (projectList(next).length > was) added++;
  }
  return { store: next, added, skipped: projects.length - added };
}
