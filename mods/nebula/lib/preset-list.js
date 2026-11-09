import { HARNESSES, runProgram } from "./harness.js";
import { harnessOf, kindOf, same } from "./presets.js";

const lower = (s) => String(s ?? "").toLowerCase();

export const NEW_PRESET = { name: "", kind: "claude", custom_harness: null, model: null, effort: null, prefix: "", postfix: "", skip_task: false };

export function harnessReason(id, known) {
  const h = HARNESSES[id];
  const entry = h && (known ?? []).find((a) => runProgram(a) === h.program);
  if (!entry) return "no Herdr program";
  return entry.installed ? null : "not installed";
}

export const disabledReason = (p, known) => harnessReason(harnessOf(p), known);

export function rowsOf(presets, known, query) {
  const q = lower(query).trim();
  return presets
    .filter((p) => !q || [p.name, harnessOf(p), p.model, p.effort].some((v) => lower(v).includes(q)))
    .map((preset) => ({ preset, reason: disabledReason(preset, known) }));
}

export const removePreset = (presets, name) => presets.filter((p) => !same(p.name, name));

export function savePreset(presets, edited, was) {
  const name = String(edited.name ?? "").trim();
  if (!name) return { error: "Give the preset a name." };
  if (presets.some((p) => !(was && same(p.name, was)) && same(p.name, name))) return { error: `A preset named "${name}" already exists.` };
  const next = { ...edited, name };
  const i = was ? presets.findIndex((p) => same(p.name, was)) : -1;
  return { presets: i >= 0 ? presets.map((p, n) => (n === i ? next : p)) : [...presets, next] };
}

export function presetFrom(base, f) {
  const known = Boolean(HARNESSES[f.harness]);
  return {
    ...base, name: f.name.trim(), kind: known ? kindOf(f.harness) : "custom", custom_harness: known ? null : f.harness,
    model: f.model.trim() || null, effort: f.effort.trim() || null, prefix: f.prefix, postfix: f.postfix,
  };
}

// ctx also carries what the box had: task, checkout and root, so choosing a preset keeps them.
export const launchPrefill = (p, { newWorktree, branch, task, checkout, root }) => ({
  harness: harnessOf(p), model: p.model ?? null, effort: p.effort ?? null, preset: p.name, newWorktree, branch,
  ...(task ? { task } : {}), ...(checkout ? { checkout } : {}), ...(root ? { root } : {}),
});

// A write the host refused because the file changed under us ("The file changed outside
// Herdr..." / "The file changed while saving...") is stale; anything else is a real failure.
export const isStale = (error) => /\bfile changed\b/i.test(String(error?.message ?? error));
export const writeFailure = (error, stale) => (isStale(error) ? stale : String(error?.message ?? error));
