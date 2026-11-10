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

export function readLabels(labels) {
  const l = labels ?? {};
  return {
    board: isBoardLaunched(l),
    launch: launchOf(l[LAUNCH]),
    prompt: text(l[PROMPT]),
    autotitle: text(l[AUTOTITLE]),
    claudetitle: text(l[CLAUDETITLE]),
    session: text(l[SESSION]),
    asleep: Boolean(text(l[ASLEEP])),
  };
}

export const launchLabels = (launch, name = null) => ({ [BOARD]: "1", [LAUNCH]: JSON.stringify(launch), ...(name ? { [LAUNCHNAME]: name } : {}) });
