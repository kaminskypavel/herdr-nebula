// What an agent last said: the conversation the prompt hook saved on its terminal ("nebula.session" label), the
// shell command that reads that transcript's tail, and the one line worth quoting from the agent's last reply.
// Used by the board's Up next card and rows, the welcome-back card and the macOS notification. Pure; no herdr
// imports, so node can test it. Reading it: exec("/bin/sh", ["-c", TRANSCRIPT[s.app], "sh", s.id]) with
// s = sessionOf(terminal.labels["nebula.session"]).

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

// The line to quote: for an agent that needs you the question it asked (else its first prose line), for a finished
// one its first prose line. status: the board's ("needs", "unseen", ...).
export const replyLine = (reply, status) => (status === "needs" ? (question(reply) ?? gist(reply)) : gist(reply));
