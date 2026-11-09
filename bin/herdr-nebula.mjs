#!/usr/bin/env node
// herdr-nebula: the command behind the nebula board's prompt hook, session titles and hook
// installation. Dependency-free. Usage:
//   herdr-nebula title <3-4 Title Case words>   the agent names its own tab, only while unnamed
//   herdr-nebula hook prompt claude|codex       the UserPromptSubmit hook (stdin: the hook JSON)
//   herdr-nebula hook subagent claude start|stop  the SubagentStart / SubagentStop hooks (stdin: the hook JSON)
//   herdr-nebula install-hooks                  merge the hooks into Claude and Codex settings
// The hook prints nothing and exits 0 on every path that is not a reply to the agent.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AUTOTITLE, CLAUDETITLE, PROMPT } from "../mods/nebula/lib/labels.js";
import { SETTINGS } from "../mods/nebula/lib/shared.js";
import { SUB_PREFIX } from "../mods/nebula/lib/subagents.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOKS_DIR = path.join(HERE, "..", "hooks");

// The hook must answer well inside Claude's 5 second limit: every child call shares one budget.
const BUDGET_MS = 1800;
let deadline = Date.now() + BUDGET_MS;
function run(cmd, args) {
  const left = deadline - Date.now();
  if (left <= 0) throw new Error("out of time");
  return execFileSync(cmd, args, { encoding: "utf8", timeout: left, stdio: ["ignore", "pipe", "ignore"] });
}

const hcLabels = (term) => JSON.parse(run("hc", ["get", term, "--json"])).labels ?? {};
const setLabel = (term, key, value) => run("hc", ["label", term, `${key}=${value}`]);

// The tab with this id, as { name, named }. `herdr-app ls` does not say whether a tab was
// named; an unnamed tab shows its position ("2"), so that is the test.
// ponytail: a tab the user names with its own position number reads as unnamed.
function findTab(id) {
  for (const space of JSON.parse(run("herdr-app", ["ls"])).spaces ?? []) {
    const i = (space.tabs ?? []).findIndex((t) => t.id === id);
    if (i >= 0) { const name = String(space.tabs[i].name ?? ""); return { name, named: name !== String(i + 1) }; }
  }
  return null;
}
const renameTab = (id, name) => run("herdr-app", ["do", "tab.rename", JSON.stringify({ id, name })]);

const clean = (s) => String(s).replace(/[\p{Cc}]/gu, " ").split(/\s+/).filter(Boolean).join(" ");

const sanitizeTitle = (s) => Array.from(clean(s)).slice(0, 60).join("").trimEnd();

const INJECTED = ["[nebula]", "[herdr-nebula]", "[Cross-session idle notice]", "<cross-session-message", "<task-notification", "<agent-message"];
const MAX_PROMPT = 200;

function condense(raw) {
  const text = clean(raw ?? "");
  if (!text || INJECTED.some((p) => text.startsWith(p))) return null;
  const chars = Array.from(text);
  return chars.length > MAX_PROMPT ? chars.slice(0, MAX_PROMPT - 1).join("") + "…" : text;
}

export const TITLE_INSTRUCTION = "[herdr-nebula] Before addressing the user's request, run this shell command exactly once:\n\n  herdr-nebula title <title>\n\nReplace <title> with 3-4 Title Case words describing the user's request, unquoted (example: herdr-nebula title Fix Login Redirect). If it reports the session is already titled, accept that and move on. Then continue with the request. Don't mention the rename to the user.";

const appHome = () => process.env.HERDR_APP_HOME || path.join(os.homedir(), ".config", "herdr-app");

function autoTitleOn() {
  try {
    const shared = JSON.parse(fs.readFileSync(path.join(appHome(), "shared.json"), "utf8"));
    return shared?.[SETTINGS]?.autoTitle !== false;
  } catch { return true; }
}

// The title Claude holds for the session (`/rename`), from the file it keeps beside the transcript.
function claudeTitle(input) {
  if (!input.transcript_path || !input.session_id) return "";
  try {
    const file = path.join(path.dirname(input.transcript_path), input.session_id, "custom-title.json");
    return sanitizeTitle(JSON.parse(fs.readFileSync(file, "utf8")).customTitle ?? "");
  } catch { return ""; }
}

function hookPrompt(app) {
  const term = process.env.HC_TERMINAL_ID;
  if (!term) return;
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, "utf8")); } catch {}
  if (input.agent_id) return;

  const labels = hcLabels(term);
  const tabId = labels["herdr.tab"];
  const prompt = condense(input.prompt);
  if (prompt && prompt !== labels[PROMPT]) setLabel(term, PROMPT, prompt);
  const auto = autoTitleOn();
  if (app === "codex" && !auto) return;

  let tab = tabId ? findTab(tabId) : null;
  if (!tab) return;

  let held = labels[CLAUDETITLE] ?? "";
  if (app === "claude") {
    const theirs = claudeTitle(input);
    if (theirs && theirs !== held && (!tab.named || held)) {
      if (tab.name !== theirs) renameTab(tabId, theirs);
      tab = { name: theirs, named: true };
      setLabel(term, CLAUDETITLE, theirs);
      held = theirs;
    }
  }

  const out = {};
  if (!tab.named && auto) {
    out.additionalContext = TITLE_INSTRUCTION;
  } else if (app === "claude" && tab.named && tab.name !== held) {
    out.sessionTitle = tab.name;
    setLabel(term, CLAUDETITLE, tab.name);
  }
  if (Object.keys(out).length) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", ...out } }));
}

// Claude Code's SubagentStart / SubagentStop hooks. Documented stdin fields (code.claude.com
// /docs/en/hooks): session_id, transcript_path, cwd, hook_event_name, agent_id, agent_type
// (SubagentStop adds agent_transcript_path, last_assistant_message). The payload has no
// description or model, so those come from the sub-agent's meta file that Claude Code keeps
// beside the transcript: <dir of transcript_path>/<session_id>/subagents/agent-<id>.meta.json
// with { agentType, description, model? }. Start labels the terminal (see lib/subagents.js
// for the label format); stop removes the label.
const MODEL_FAMILY = /opus|sonnet|haiku/i;

function subagentMeta(input, id) {
  if (!input.transcript_path || !input.session_id) return {};
  const file = path.join(path.dirname(input.transcript_path), input.session_id, "subagents", `agent-${id.replace(/^agent-/, "")}.meta.json`);
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; }
}

function hookSubagent(phase) {
  const term = process.env.HC_TERMINAL_ID;
  if (!term) return;
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, "utf8")); } catch {}
  const id = String(input.agent_id ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  if (!id) return;
  const key = SUB_PREFIX + id;
  if (phase === "stop") { setLabel(term, key, ""); return; }
  const meta = subagentMeta(input, id);
  const model = clean(meta.model ?? "");
  const value = {
    type: clean(input.agent_type ?? meta.agentType ?? "").slice(0, 60),
    desc: Array.from(clean(meta.description ?? "")).slice(0, 120).join(""),
    model: MODEL_FAMILY.exec(model)?.[0].toLowerCase() ?? model.slice(0, 40),
    at: Date.now(),
  };
  setLabel(term, key, JSON.stringify(value));
}

function title(words) {
  const term = process.env.HC_TERMINAL_ID;
  const name = sanitizeTitle(words.join(" "));
  if (!name) { console.error("usage: herdr-nebula title <3-4 Title Case words>"); process.exitCode = 2; return; }
  if (!term) { console.log("Not inside a Herdr terminal, nothing renamed."); return; }
  deadline = Date.now() + 10000;
  const labels = hcLabels(term);
  const tabId = labels["herdr.tab"];
  const tab = tabId ? findTab(tabId) : null;
  if (!tab) { console.log("Could not find this session's tab, nothing renamed."); return; }
  if (tab.named && tab.name !== (labels[AUTOTITLE] ?? "")) { console.log(`Session is already titled "${tab.name}". Leave it.`); return; }
  setLabel(term, AUTOTITLE, name);
  renameTab(tabId, name);
  console.log(`Session titled "${name}".`);
}

const readTemplate = (file) => JSON.parse(fs.readFileSync(path.join(HOOKS_DIR, file), "utf8"));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const managed = (g) => g && typeof g === "object" && g._herdrNebulaManaged === true;

function merge(settings, template) {
  const next = structuredClone(settings);
  for (const [event, groups] of Object.entries(template.hooks ?? {})) {
    next.hooks ??= {};
    next.hooks[event] ??= [];
    if (!Array.isArray(next.hooks[event])) throw new Error(`hooks.${event} is not a list`);
    const list = next.hooks[event];
    const at = list.findIndex(managed);
    const rest = list.filter((g) => !managed(g));
    rest.splice(at < 0 ? rest.length : at, 0, ...groups);
    next.hooks[event] = rest;
  }
  for (const rule of template.permissions?.allow ?? []) {
    next.permissions ??= {};
    const allow = (next.permissions.allow ??= []);
    if (!Array.isArray(allow)) throw new Error("permissions.allow is not a list");
    if (!allow.includes(rule)) allow.push(rule);
  }
  return next;
}

function installOne(label, file, templateFile) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) { console.log(`${label}: ${dir} not found, skipped.`); return true; }
  const { _comment, ...template } = readTemplate(templateFile);
  const exists = fs.existsSync(file);
  let current = {};
  if (exists) {
    try { current = JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (e) { console.error(`${label}: ${file} is not valid JSON (${e.message}). Nothing changed.`); return false; }
    if (!current || typeof current !== "object" || Array.isArray(current)) { console.error(`${label}: ${file} is not a JSON object. Nothing changed.`); return false; }
  }
  let next;
  try { next = merge(current, template); }
  catch (e) { console.error(`${label}: ${file}: ${e.message}. Nothing changed.`); return false; }
  if (same(next, current)) { console.log(`${label}: already installed in ${file}.`); return true; }
  const real = exists ? fs.realpathSync(file) : file;
  if (exists) {
    const backup = `${file}.${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
    fs.copyFileSync(real, backup);
    console.log(`${label}: backed up to ${backup}`);
  }
  // Keep the file's permission bits (settings.json holds API tokens); a new file starts private.
  const mode = exists ? fs.statSync(real).mode & 0o777 : 0o600;
  const tmp = `${real}.herdr-nebula.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", { mode });
  fs.chmodSync(tmp, mode);
  fs.renameSync(tmp, real);
  const added = [...Object.keys(template.hooks ?? {}).map((e) => `${e} hook`), ...(template.permissions?.allow ?? []).map((r) => `allow rule ${r}`)];
  console.log(`${label}: updated ${file} (${added.join(", ")}).`);
  return true;
}

function installHooks() {
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  const codexDir = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const ok = [
    installOne("Claude", path.join(claudeDir, "settings.json"), "claude.json"),
    installOne("Codex", path.join(codexDir, "hooks.json"), "codex.json"),
  ];
  if (!ok.every(Boolean)) process.exitCode = 1;
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "hook" && rest[0] === "prompt" && (rest[1] === "claude" || rest[1] === "codex")) {
    try { hookPrompt(rest[1]); } catch {}
  } else if (cmd === "hook" && rest[0] === "subagent" && rest[1] === "claude" && (rest[2] === "start" || rest[2] === "stop")) {
    try { hookSubagent(rest[2]); } catch {}
  } else if (cmd === "title") title(rest);
  else if (cmd === "install-hooks") installHooks();
  else {
    console.error("usage: herdr-nebula title <words> | hook prompt claude|codex | hook subagent claude start|stop | install-hooks");
    process.exitCode = 2;
  }
} catch (e) {
  console.error(`herdr-nebula: ${e.message}`);
  process.exitCode = 1;
}
