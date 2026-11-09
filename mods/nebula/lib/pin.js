// Pin one agent beside the active tab. The pin is a second block, "pinned", in the layout's
// terminal row ("work-body") next to "main", showing one terminal: { terminal: <address> }.
// Herdr has no command that changes one node's content (layout.set takes a whole tree, and
// layout.show/hide only flip a node), so the board reads layout(), edits a deep copy here and
// layout.sets it. Unpin removes the node. No herdr imports, so node can test it.
import { findNode } from "./focus.js";

export const PIN_ID = "pinned";
export const BODY_ID = "work-body";

// Same card look as "main" (layouts/nebula.json), drawn on the block: a terminal block has no pane header.
const look = () => ({
  background: "background",
  border: { width: 1, color: "border" },
  radius: 10,
  focus: { border: { width: 1, color: "accent" } },
});

// Pin decision for a row: the new pin (an address), or null to unpin.
export const togglePin = (current, address) => (current === address ? null : address);

// A live or archived Herdr session can be pinned; a nebula row has no terminal until resumed.
export const pinnable = (row) => Boolean(row?.address) && row.kind !== "nebula";

// The terminal a layout tree pins now (also read at start, in case the layout kept it).
export const pinnedIn = (tree) => findNode(tree, PIN_ID)?.content?.terminal ?? null;

// The pin is gone when its terminal is no longer listed.
export const pinGone = (pinned, addresses) => Boolean(pinned) && !addresses.includes(pinned);

// A copy of the layout tree with `address` pinned (or the pin removed for null). Null when the
// layout has no "work-body" row, so other layouts are left alone. A pin already there keeps its
// size and look and only gets the new terminal.
export function withPin(tree, address) {
  const copy = JSON.parse(JSON.stringify(tree ?? null));
  const body = findNode(copy, BODY_ID);
  if (!body || !Array.isArray(body.children)) return null;
  const at = body.children.findIndex((c) => c.id === PIN_ID);
  if (!address) {
    if (at >= 0) body.children.splice(at, 1);
    delete body.gap;
  } else if (at >= 0) body.children[at].content = { terminal: address };
  else {
    body.children.push({ id: PIN_ID, type: "block", content: { terminal: address }, size: { weight: 1 }, min: 240, ...look() });
    body.gap = 8;
  }
  return copy;
}
