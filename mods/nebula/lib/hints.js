// The one-line strip at the bottom of the board lists the keys for where you are, after nebula's
// footer: at most four pairs and "? more" while the board has the keys, and while the terminal has them
// (`awayParts`) what waits for you and the keys that go there. `hintContext` names the place,
// `hintPairs` the [key, text] pairs for it, `hintLine` draws them. A key is a literal or { action, def }, drawn as the key bound to the action in keys()
// (lib/settings.js shortcutLabel), so a rebind shows. No herdr imports, so node can test it.
import { canResume } from "./resume.js";
import { stripParts } from "./strip.js";

/** The Help dialog's size, for the rail's button and the board's `?`. */
export const HELP_SIZE = { width: 560, height: 500 };

const act = (action, def) => ({ action, def });
const FOLD = act("nebula.keys", "⌃`");
const JUMP = act("nebula.jump", "⌘J");
const NEXT = act("nebula.next", "⌘]");
const NEW = act("mod.open:nebula-box", "⌘K");

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

/** Most hint pairs shown while the board has the keys; "? more" follows them. */
export const MAX_HINTS = 4;

const more = (pairs) => [...pairs.filter(([k]) => k !== "?").slice(0, MAX_HINTS), ["?", "more"]];

/**
 * The status line while the terminal has the keys: what waits and the keys to get there, as [{ text, tone }]
 * (lib/strip.js stripParts). `waiting` is { needs, unseen } across the open projects. `label` is shortcutLabel(keys(), mac).
 */
export function awayParts(waiting, label) {
  if (waiting.needs > 0) return stripParts({ needs: waiting.needs, unseen: 0 }, [`${label(NEXT)} go`, `${label(JUMP)} jump`]);
  if (waiting.unseen > 0) return stripParts({ needs: 0, unseen: waiting.unseen }, [`${label(JUMP)} jump`]);
  return [{ text: "All quiet", tone: "plain" }, ...stripParts({ needs: 0, unseen: 0 }, [`${label(NEW)} new session`])];
}

/** The [key, text] pairs for a place (not "away", which is awayParts). `preview`: the setting, which changes what Enter is said to do. */
export function hintPairs(ctx, { preview = false, deletable = false } = {}) {
  const enter = preview ? "step in" : "open";
  switch (ctx) {
    case "filter":
      return [
        ["↩", "first match"],
        ["Esc", "clear"],
      ];
    case "columns":
      return more([
        ["j k", "move"],
        ["h l", "column"],
        ["↩", "open"],
        ["p", "new session"],
        ["/", "jump"],
      ]);
    case "nebula":
      return more([
        ["↩", "resume"],
        ["d", "hide"],
        ["/", "jump"],
      ]);
    case "archived":
      return more([
        ["↩", "show"],
        ["u", "unarchive"],
        ["d", "delete"],
        ["/", "jump"],
      ]);
    case "exited":
      return more([
        ["↩", "resume"],
        ["a", "archive"],
        ["d", "delete"],
        ["/", "jump"],
      ]);
    case "row":
      return more([
        ["↩", enter],
        ["Esc", "to terminal"],
        ["r", "rename"],
        ["a", "archive"],
        ["d", "delete"],
        ["/", "jump"],
      ]);
    case "vacant":
      return more([["p", "new session"], ...(deletable ? [["d", "delete worktree"]] : []), ["/", "jump"]]);
    case "repo":
      return more([
        ["↩", "fold"],
        ["p", "new session"],
        ["/", "jump"],
      ]);
    default:
      return more([
        ["p", "new session"],
        ["/", "jump"],
        [FOLD, "fold"],
      ]);
  }
}

/** "↩ step in · Esc to terminal · ..." with the live key for each bound action. `label` is shortcutLabel(keys(), mac). */
export const hintLine = (pairs, label) => pairs.map(([k, text]) => `${label(k)} ${text}`).join(" · ");
