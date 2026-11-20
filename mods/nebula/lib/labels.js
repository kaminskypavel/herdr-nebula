// The labels the board keeps on a terminal in herdr-core, which outlive Herdr
// restarts: nebula.board (launched from the board), nebula.launch (JSON: harness,
// model, effort, preset, checkout), nebula.prompt (the last prompt, condensed to one
// line), nebula.autotitle (the title the agent gave its tab) and nebula.claudetitle
// (the title last read from Claude's own rename file), nebula.session ("<app>:<id>", the
// CLI's conversation id, written by the prompt hook; lib/resume.js) and nebula.asleep ("1"
// while the board has put the agent to sleep; lib/sleep.js) and nebula.launchname (the name the board gave
// the tab from the task at launch: a placeholder the agent's own title replaces). No herdr imports.

export const BOARD = "nebula.board";
export const LAUNCH = "nebula.launch";
export const PROMPT = "nebula.prompt";
export const AUTOTITLE = "nebula.autotitle";
export const CLAUDETITLE = "nebula.claudetitle";
export const SESSION = "nebula.session";
export const ASLEEP = "nebula.asleep";
export const LAUNCHNAME = "nebula.launchname";

export const isBoardLaunched = (labels) => Boolean(labels?.[BOARD]);

const text = (v) => (typeof v === "string" ? v : "");

function launchOf(v) {
  try {
    const d = JSON.parse(v);
    return d && typeof d === "object" && !Array.isArray(d) ? d : null;
  } catch {
    return null;
  }
}

// A paste the CLI wrapped (<pasted_content id="ac93">...</pasted_content>) reads as its text, not the tags.
export const unwrapPaste = (s) =>
  String(s ?? "")
    .replace(/<\/?pasted_content\b[^>]*>/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();

export function readLabels(labels) {
  const l = labels ?? {};
  return {
    board: isBoardLaunched(l),
    launch: launchOf(l[LAUNCH]),
    prompt: unwrapPaste(text(l[PROMPT])),
    autotitle: text(l[AUTOTITLE]),
    claudetitle: text(l[CLAUDETITLE]),
    session: text(l[SESSION]),
    asleep: Boolean(text(l[ASLEEP])),
  };
}

export const launchLabels = (launch, name = null) => ({ [BOARD]: "1", [LAUNCH]: JSON.stringify(launch), ...(name ? { [LAUNCHNAME]: name } : {}) });

// Where Claude Code keeps a conversation's /rename title: ~/.claude/projects/<its folder, every character that is
// not a letter or digit turned into "-">/<id>/custom-title.json.
export const claudeTitleFile = (home, folder, id) => `${home}/.claude/projects/${String(folder).replace(/[^A-Za-z0-9]/g, "-")}/${id}/custom-title.json`;

/**
 * The title a /rename in Claude gave the conversation, when the tab should take it, else null. `text` is
 * custom-title.json; `held` the title the tab last took from Claude (nebula.claudetitle). The tab takes it when it
 * changed and the tab still has a placeholder name (`placeholder`) or already followed Claude (`held` is set): a name
 * typed into the tab by hand stays.
 */
/**
 * A tab's name from the core's `where` ("space / tab", hc ls --json), as { name, named }, or null. Herdr shows an
 * unnamed tab by its position ("2"), so a bare number is not a name.
 */
export function tabFromWhere(where) {
  const w = String(where ?? ""),
    cut = w.indexOf(" / ");
  if (cut < 0) return null;
  const name = w.slice(cut + 3);
  return { name, named: !/^\d+$/.test(name) };
}

export function renamedTitle(text, held, placeholder) {
  let title = "";
  try {
    title = String(JSON.parse(text)?.customTitle ?? "");
  } catch {
    return null;
  }
  title = Array.from(title.replace(/\s+/g, " ").trim()).slice(0, 60).join("").trimEnd();
  return title && title !== (held ?? "") && (placeholder || Boolean(held)) ? title : null;
}
