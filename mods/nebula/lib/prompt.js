// What a Tree or List session row says: its title and, under it, one line: what the agent said (a row that needs
// you or finished unseen, once the board has read its reply: viewmodel sets `said`), else the last prompt.
// A row still called "New session" has nothing better to show than its prompt, so the prompt
// becomes the title; a row whose title is already its task (`taskTitle`) does not repeat it. Any other row keeps its
// title and gets the line dim under it (the "Prompt line on rows" setting turns that line off). Pure; no herdr imports.
import { NEW_SESSION } from "./viewmodel.js";

const clean = (s) => String(s ?? "").trim();

/** -> { title, sub }: `sub` is the second line's text or "" for none. */
export function rowText(row, promptLine = true) {
  const prompt = clean(row.prompt),
    said = clean(row.said);
  const asTitle = !row.taskTitle && row.title === NEW_SESSION && Boolean(prompt);
  const sub = said || (asTitle || row.taskTitle ? "" : prompt);
  return { title: asTitle ? prompt : row.title, sub: promptLine ? sub : "" };
}

/**
 * `text` cut to fit `lines` lines of about `chars` characters each: words wrap greedily, and when more is left the
 * last line ends with an ellipsis. GPUI has no line clamp, so Cards cut the text and hold it in a fixed-height box.
 */
export function clampLines(text, chars, lines) {
  const wrapped = [];
  let line = "";
  for (const w of clean(text).split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + w.length > chars) {
      wrapped.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) wrapped.push(line);
  const cut = (l, more) => (l.length + (more ? 1 : 0) > chars ? `${l.slice(0, chars - 1)}…` : more ? `${l}…` : l);
  return wrapped
    .slice(0, lines)
    .map((l, i) => cut(l, wrapped.length > lines && i === lines - 1))
    .join("\n");
}

/** One line for a row's sub-agents: "2 subagents · sonnet-high-worker, reviewer", or "" for none. */
export function subSummary(subs) {
  if (!subs?.length) return "";
  const names = [...new Set(subs.map((s) => s.text).filter(Boolean))];
  return [`${subs.length} ${subs.length === 1 ? "subagent" : "subagents"}`, names.join(", ")].filter(Boolean).join(" · ");
}
