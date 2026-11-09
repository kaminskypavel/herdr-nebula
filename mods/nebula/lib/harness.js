// How each agent CLI takes its model, effort and first prompt: nebula's harness table
// (nebula-core/src/harness.rs) and argv order (nebula-daemon/src/registry.rs), without
// the resume, system-prompt and permission flags a board launch does not use. No
// herdr imports.
//
// program: the command. pre: flags every launch starts with. model/effort: the flag
// that carries them (effort `config` is Codex's `-c key=value` pair). compose: model
// and effort join into one id (Cursor). promptFlag: the flag that carries the first
// prompt where the positional is something else (OpenCode's is the project path).
// models/efforts: the choices a picker offers, before "default".
const list = (s) => s.split(" ");
export const HARNESSES = {
  claude: { label: "Claude", program: "claude", model: "--model", effort: { flag: "--effort" }, models: list("fable opus sonnet haiku"), efforts: list("low medium high xhigh max") },
  codex: { label: "Codex", program: "codex", pre: ["--no-daemon"], model: "--model", effort: { config: ["-c", "model_reasoning_effort"] }, models: list("gpt-5.6-sol gpt-5.6-terra gpt-5.6-luna gpt-5.5"), efforts: list("minimal low medium high xhigh") },
  cursor: { label: "Cursor", program: "cursor-agent", model: "--model", compose: true, models: [], efforts: [] },
  pi: { label: "Pi", program: "pi", model: "--model", effort: { flag: "--thinking" }, models: list("opus sonnet haiku gpt-5.5"), efforts: list("off minimal low medium high xhigh max") },
  muse: { label: "Muse", program: "muse", model: "--model", models: [], efforts: [] },
  grok: { label: "Grok Build", program: "grok", model: "--model", effort: { flag: "--reasoning-effort" }, models: [], efforts: [] },
  opencode: { label: "OpenCode", program: "opencode", model: "--model", promptFlag: "--prompt", models: list("opencode/big-pickle anthropic/claude-fable-5-1 anthropic/claude-opus-5 anthropic/claude-sonnet-5 openai/gpt-5.5"), efforts: [] },
};

const choice = (v) => {
  const s = String(v ?? "").trim();
  return s && s.toLowerCase() !== "default" ? s : null;
};

export function buildArgv({ harness, model, effort, task }) {
  const h = HARNESSES[harness];
  const m = choice(model), e = choice(effort), t = String(task ?? "").trim();
  const argv = [h.program, ...(h.pre ?? [])];
  if (m && h.model) argv.push(h.model, h.compose && e ? `${m}-${e}` : m);
  if (e && !h.compose && h.effort) argv.push(...(h.effort.flag ? [h.effort.flag, e] : [h.effort.config[0], `${h.effort.config[1]}=${e}`]));
  // Codex reads a task starting with "-" (a markdown bullet) as a flag, so "--" ends its options.
  if (t) argv.push(...(h.promptFlag ? [h.promptFlag, t] : [...(harness === "codex" && t.startsWith("-") ? ["--"] : []), t]));
  return argv;
}

export const runProgram = (entry) => String(entry.run?.[0] ?? "").split("/").pop();
