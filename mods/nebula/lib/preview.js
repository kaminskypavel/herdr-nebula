// Preview as you move (the setting, OFF by default): the highlighted agent is shown in the main area
// and the board tries to keep the keyboard; Enter or a double click steps in.
// Why it is off: Herdr gives the keyboard to whatever it shows. Measured on 2026-11-10, both
// `pane.focus` and `tab.select` (with or without `space.select`) move the keys into the shown
// terminal a beat after the command, so a mod cannot show an agent without taking the keys off the
// board. The board takes them back (polling every POLL_MS, board.js preview()), but a quick j or k
// still landed in the agent, and the user ruled: j, k and a click only highlight; only Enter (or a
// double click) opens an agent. Do not turn preview back on by default without a Herdr API that shows
// a terminal without focusing it. `terminal.peek` was not used: it is an overlay drawer over the tab,
// not the main area; a preview block would mean rewriting the layout on every keypress. No herdr
// imports, so node can test it.

/** How long the cursor must rest on a row before it is shown. */
export const PREVIEW_MS = 150;

/** How long the board insists it has the keys after asking a preview, while Herdr moves focus. */
export const HOLD_MS = 1000;

/** How often the board checks, after a preview, whether Herdr moved the keys to the agent. */
export const POLL_MS = 25;

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
