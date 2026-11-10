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

// One line from a reply: its first line that is prose (not in a code block, not a table row, rule or
// separator), without markdown marks, at most `max` characters.
export function gist(reply, max = 140) {
  const line = String(reply ?? "")
    .replace(/```[\s\S]*?(```|$)/g, "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !/^(```|\||[-*_]{3,}$|[┈┄─╼━]{3})/.test(l));
  if (!line) return null;
  const plain = line
    .replace(/^#+\s*|^>\s*|^[-*]\s+|^\d+\.\s+/, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain || null;
}

// The two lines: { title, body }, or null when the toast is not about an agent (it is drawn as posted).
// `reply` is the gist of the agent's last reply, when read.
export function agentLines(p, term, reply) {
  const event = eventOf(p?.title);
  if (!event || !term) return null;
  const labels = term.labels ?? {};
  const name = sessionName(labels.where ?? p.body) ?? (labels["nebula.prompt"] ? "New session" : null);
  const project = projectOf(term.cwd);
  const said = reply ?? (labels["nebula.prompt"] ? `› ${labels["nebula.prompt"]}` : null);
  return {
    title: name ? `${name} ${event}` : p.title,
    body: [project, said].filter(Boolean).join(" · ") || p.body || "",
  };
}
