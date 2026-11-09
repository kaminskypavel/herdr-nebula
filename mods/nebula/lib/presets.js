// Agent presets in nebula's agent_presets.json (nebula-tui/src/agent_presets.rs): a
// JSON list of { name, kind, custom_harness, model, effort, prefix, postfix,
// skip_task }. Read entry by entry: a missing or malformed file reads as empty, and a
// save keeps what this reader can't read (a preset for a kind a newer nebula added)
// and every field it has no name for, so nebula sharing the file loses nothing.
// No herdr imports, so node can test it.

// nebula's AgentKind names, which are the same as Herdr's program names but open_code.
const KINDS = new Set(["claude", "codex", "cursor", "pi", "muse", "grok", "open_code", "custom"]);
const FROM_KIND = { open_code: "opencode" };
const TO_KIND = { opencode: "open_code" };

export const harnessOf = (p) => (p.kind === "custom" ? p.custom_harness : FROM_KIND[p.kind] ?? p.kind);
export const kindOf = (harness) => TO_KIND[harness] ?? harness;

const optText = (v) => v === undefined || v === null || typeof v === "string";

function readEntry(e) {
  if (!e || typeof e !== "object" || typeof e.name !== "string") return null;
  const kind = e.kind ?? "claude";
  if (!KINDS.has(kind) || !optText(e.custom_harness) || !optText(e.model) || !optText(e.effort) || !optText(e.prefix) || !optText(e.postfix)) return null;
  if (e.skip_task !== undefined && typeof e.skip_task !== "boolean") return null;
  return { ...e, name: e.name, kind, custom_harness: e.custom_harness ?? null, model: e.model ?? null, effort: e.effort ?? null, prefix: e.prefix ?? "", postfix: e.postfix ?? "", skip_task: e.skip_task ?? false };
}

const entries = (text) => {
  try {
    const d = JSON.parse(text);
    return Array.isArray(d) ? d : [];
  } catch { return []; }
};

// text may be null (no file yet): that reads as no presets.
export const readPresets = (text) => entries(text ?? "").map(readEntry).filter(Boolean);

export const same = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();

export function writePresets(presets, storedText) {
  const stored = entries(storedText ?? "");
  const out = presets.map((p) => ({ ...(stored.find((e) => typeof e?.name === "string" && same(e.name, p.name)) ?? {}), ...p }));
  for (const e of stored) {
    if (!readEntry(e) && !presets.some((p) => typeof e?.name === "string" && same(e.name, p.name))) out.push(e);
  }
  return JSON.stringify(out, null, 2) + "\n";
}

export const composePrompt = (p, task) => [p.prefix, task, p.postfix].map((s) => String(s ?? "").trim()).filter(Boolean).join("\n\n");
