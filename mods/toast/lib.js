// What the toast says about an agent. Herdr posts its own alert when an agent needs you or finished
// while you weren't looking: the title is "<App> finished" / "<App> needs you", the body the agent's
// "space / tab", and clicking it goes there. This turns that into "<session> finished" over
// "<project> · <the agent's last reply>". Pure, so node can test it. No herdr imports.

// "Claude Code finished" -> "finished", "Codex needs you" -> "needs you", anything else -> null.
export function eventOf(title) {
  const m = String(title ?? "").match(/\b(finished|needs you)$/);
  return m ? m[1] : null;
}

// The terminal the toast is about: the click action's, else the live terminal whose "where" label
// (space / tab) is the body. -> a terminal from terminals(), or null.
export function terminalOf(p, terminals) {
  const id = p?.action?.args?.terminal ?? p?.action?.args?.address ?? null;
  const list = terminals ?? [];
  return (id && list.find((t) => t.address === id)) || (p?.body && list.find((t) => t.labels?.where === p.body)) || null;
}

// The session's name: the tab part of "space / tab"; a tab still called by its number has none.
export function sessionName(where) {
  const tab = String(where ?? "")
    .split(" / ")
    .slice(1)
    .join(" / ")
    .trim();
  return tab && !/^\d+$/.test(tab) ? tab : null;
}

// The project a folder belongs to: the folder's name, or the repo's for a worktree in
// <repo>-worktrees/<branch>.
export function projectOf(cwd) {
  const parts = String(cwd ?? "")
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean);
  const parent = parts.at(-2) ?? "";
  return parent.endsWith("-worktrees") ? parent.slice(0, -"-worktrees".length) : (parts.at(-1) ?? null);
}

// The conversation the prompt hook saved on the terminal ("claude:<id>" / "codex:<id>"), or null.
export function sessionOf(label) {
  const m = String(label ?? "").match(/^(claude|codex):([A-Za-z0-9-]+)$/);
  return m ? { app: m[1], id: m[2] } : null;
}

// The shell command that prints the tail of that conversation's transcript ($1 is the id).
export const TRANSCRIPT = {
  claude: 'f=$(ls "$HOME"/.claude/projects/*/"$1".jsonl 2>/dev/null | head -n 1); [ -n "$f" ] && tail -c 300000 "$f"',
  codex: 'f=$(ls -t "$HOME"/.codex/sessions/*/*/*/*"$1".jsonl 2>/dev/null | head -n 1); [ -n "$f" ] && tail -c 300000 "$f"',
};

// The agent's last reply in a transcript tail (JSON lines; the first may be cut), or null.
// Claude: { type: "assistant", message: { content: [{ type: "text", text }] } }. Codex:
// response_item messages with output_text, agent_message events, task_complete's last_agent_message.
export function lastReply(text) {
  const lines = String(text ?? "").split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    let d;
    try {
      d = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const said = replyIn(d);
    if (said) return said;
  }
  return null;
}

function replyIn(d) {
  if (d?.type === "assistant") return lastText(d.message?.content, "text");
  const p = d?.payload;
  if (p?.type === "message" && p.role === "assistant") return lastText(p.content, "output_text");
  if (p?.type === "agent_message") return p.message || null;
  if (p?.type === "task_complete") return p.last_agent_message || null;
  return null;
}

function lastText(content, kind) {
  const texts = (Array.isArray(content) ? content : []).filter((c) => c?.type === kind && c.text?.trim()).map((c) => c.text);
  return texts.at(-1) ?? null;
}

// A reply's prose lines: code blocks dropped, and no table rows, rules or separators.
function proseLines(reply) {
  return String(reply ?? "")
    .replace(/```[\s\S]*?(```|$)/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^(\||[-*_]{3,}$|[┈┄─╼━]{3})/.test(l));
}

// A line without markdown marks, at most `max` characters.
function plain(line, max) {
  const text = line
    .replace(/^#+\s*|^>\s*|^[-*]\s+|^\d+\.\s+/, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text || null;
}

// One line from a reply: its first prose line, without markdown marks, at most `max` characters.
export function gist(reply, max = 140) {
  const line = proseLines(reply)[0];
  return line ? plain(line, max) : null;
}

// The question an agent that needs you asked: the last sentence ending in "?" in its reply, or null.
export function question(reply, max = 140) {
  const line = proseLines(reply)
    .reverse()
    .find((l) => l.includes("?"));
  if (!line) return null;
  const asked = plain(line, 1000)
    ?.split(/(?<=[.!?])\s+/)
    .reverse()
    .find((x) => x.endsWith("?"));
  return asked ? plain(asked, max) : null;
}

// The line the popup quotes: for needs you the question asked (else the first prose line), for done the first prose line.
export const replyLine = (reply, event) => (event === "needs you" ? (question(reply) ?? gist(reply)) : gist(reply));

// The popup's parts: { name, tag, tone, body }, or null when the toast is not about an agent (it is drawn as
// posted). name: the session, else the start of its last prompt, else the app ("Claude Code"); tag: "needs you"
// or "done", drawn whole beside the name (tone: the theme color); body: "<project> · <what it said>".
// `said` is the line from the agent's last reply (replyLine), when read; until then the last prompt.
export function agentLines(p, term, said) {
  const event = eventOf(p?.title);
  if (!event || !term) return null;
  const labels = term.labels ?? {},
    prompt = labels["nebula.prompt"] ?? null;
  const name = sessionName(labels.where ?? p.body) ?? (prompt ? plain(`› ${prompt}`, 48) : String(p.title).slice(0, -event.length).trim());
  const line = said ?? (prompt ? `› ${prompt}` : null);
  return {
    name,
    tag: event === "needs you" ? "needs you" : "done",
    tone: DOT_OF[event],
    body: [projectOf(term.cwd), line].filter(Boolean).join(" · ") || p.body || "",
  };
}

// The project icon for a folder: the shared "nebula.icons" entry ({ path, initials, color }, keyed by
// project root) of the project holding it (the root itself, a folder under it, or one of its
// <root>-worktrees), the longest root winning. -> the entry, or null.
export function iconOf(icons, cwd) {
  const dir = String(cwd ?? "").replace(/\/+$/, "");
  let best = null;
  for (const [root, icon] of Object.entries(icons ?? {})) {
    const holds = dir === root || dir.startsWith(`${root}/`) || dir.startsWith(`${root}-worktrees/`);
    if (holds && (!best || root.length > best.root.length)) best = { root, icon };
  }
  return best?.icon ?? null;
}

// The status dot's color on the icon: the board's (lib/status.js COLOR), red for needs you, the
// unseen color for finished.
export const DOT_OF = { "needs you": "ansi1", finished: "ansi6" };
