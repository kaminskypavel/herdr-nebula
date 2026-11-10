// The one-line strip at the bottom of the board lists the keys for where you are, after nebula's
// footer. `hintContext` names the place, `hintPairs` the [key, text] pairs for it, `hintLine` draws
// them. A key is a literal or { action, def }, drawn as the key bound to the action in keys()
// (lib/settings.js shortcutLabel), so a rebind shows. No herdr imports, so node can test it.
import { canResume } from "./resume.js";

/** The Help dialog's size, for the rail's button and the board's `?`. */
export const HELP_SIZE = { width: 560, height: 500 };

const act = (action, def) => ({ action, def });
const FOLD = act("nebula.focus", "⌃`");
const JUMP = act("nebula.jump", "⌘J");

/**
 * Where the board's user is. `has`: the board has the keys; `filtering`: the filter field has them;
 * `item`: the item under the cursor; `pc`: the Projects mode of Columns is drawn and `col` its
 * focused column (0 projects, 1 worktrees, 2 sessions).
 * -> "away" | "filter" | "columns" | "nebula" | "archived" | "exited" | "row" | "vacant" | "repo" | "empty"
 */
export function hintContext({ has, filtering, item, pc, col }) {
  if (filtering) return "filter";
  if (!has) return "away";
  if (pc && col < 2) return "columns";
  if (item?.type === "session") {
    const row = item.row;
    if (row.kind === "nebula") return "nebula";
    if (row.archived) return "archived";
    return canResume(row) ? "exited" : "row";
  }
  if (item?.type === "vacant") return "vacant";
  if (item?.type === "repo") return "repo";
  return "empty";
}

/** The [key, text] pairs for a place. `preview`: the setting, which changes what Enter is said to do. */
export function hintPairs(ctx, { preview = false, deletable = false } = {}) {
  const enter = preview ? "step in" : "open";
  switch (ctx) {
    case "away":
      return [
        [FOLD, "keys to the board"],
        [JUMP, "jump to an agent"],
        ["click", "a row to open"],
      ];
    case "filter":
      return [
        ["↩", "first match"],
        ["Esc", "clear"],
      ];
    case "columns":
      return [
        ["j k", "move"],
        ["h l", "column"],
        ["↩", "open"],
        ["p", "new session"],
        ["/", "jump"],
        ["?", "keys"],
      ];
    case "nebula":
      return [
        ["↩", "resume"],
        ["d", "hide"],
        ["/", "jump"],
        ["?", "keys"],
      ];
    case "archived":
      return [
        ["↩", "show"],
        ["u", "unarchive"],
        ["d", "delete"],
        ["/", "jump"],
        ["?", "keys"],
      ];
    case "exited":
      return [
        ["↩", "resume"],
        ["a", "archive"],
        ["d", "delete"],
        ["/", "jump"],
        ["?", "keys"],
      ];
    case "row":
      return [
        ["↩", enter],
        ["Esc", "to terminal"],
        ["r", "rename"],
        ["a", "archive"],
        ["d", "delete"],
        ["/", "jump"],
        ["?", "keys"],
      ];
    case "vacant":
      return [["p", "new session"], ...(deletable ? [["d", "delete worktree"]] : []), ["/", "jump"], ["?", "keys"]];
    case "repo":
      return [
        ["↩", "fold"],
        ["p", "new session"],
        ["/", "jump"],
        ["?", "keys"],
      ];
    default:
      return [
        ["p", "new session"],
        ["/", "jump"],
        [FOLD, "fold"],
        ["?", "keys"],
      ];
  }
}

/** "↩ step in · Esc to terminal · ..." with the live key for each bound action. `label` is shortcutLabel(keys(), mac). */
export const hintLine = (pairs, label) => pairs.map(([k, text]) => `${label(k)} ${text}`).join(" · ");
