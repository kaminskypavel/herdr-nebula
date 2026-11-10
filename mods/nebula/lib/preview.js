// Preview as you move: the highlighted agent is shown in the main area while the keyboard stays on
// the board; Enter or a double click steps in. The mechanism is `pane.focus` (it selects the agent's
// space and tab, and marks an unseen finish seen, as opening it does) followed at once by the board
// taking its keys back, and again after REFOCUS_MS in case Herdr hands them over late
// (lib/focus.js). `terminal.peek` was not used: it is an overlay drawer over the tab, not the main
// area; a preview block would mean rewriting the layout on every keypress. No herdr imports, so
// node can test it.

/** How long the cursor must rest on a row before it is shown. */
export const PREVIEW_MS = 150;

/** How long the board insists it has the keys after asking a preview, while Herdr moves focus. */
export const HOLD_MS = 1000;

/** The command that shows a session's agent: its pane, else (a parked agent has none) the agent itself. */
export const focusCommand = (row) => (row.pane ? { name: "pane.focus", args: { pane: row.pane } } : { name: "agent.focus", args: { terminal: row.address } });

/**
 * The row to preview for the item under the cursor, or null. Only a live Herdr session counts: a
 * nebula row has no terminal, and an archived one would be unarchived by showing it.
 */
export const previewTarget = (item) => {
  const row = item?.type === "session" ? item.row : null;
  return row && row.kind !== "nebula" && !row.archived && row.address ? row : null;
};

/**
 * Whether the board should take its keys back after a preview command: Herdr moved focus onto the
 * previewed agent (so the board does not have it and nobody else asked for it). `focused` is
 * focused() from Herdr. A different terminal in focus means the user clicked elsewhere; leave it.
 */
export function refocusDue({ focused, row, has }) {
  if (has || !focused) return false;
  return focused.terminal === row.address || focused.agent === row.address || (Boolean(row.pane) && focused.pane === row.pane);
}

/**
 * Where Esc hands the keys: the agent last previewed or shown (still there), else the pane that had
 * the keys before the board did. -> a command { name, args } or null. `panes` is panes() from Herdr.
 */
export function giveBackTarget({ previewed, lastPane, panes }) {
  if (previewed && (!previewed.pane || panes.some((p) => p.pane === previewed.pane))) return focusCommand(previewed);
  if (lastPane && panes.some((p) => p.pane === lastPane)) return { name: "pane.focus", args: { pane: lastPane } };
  return null;
}
