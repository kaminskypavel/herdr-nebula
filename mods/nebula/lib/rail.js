// What the icon bar draws for the project tabs: the open projects in their shared order, each with
// its most urgent status, and which tab is selected. Pure; no herdr imports, so node can test it.
//
// summary: the per-project list ([{ root, name, status, needs }], lib/open.js summarize), open: the open
// roots in tab order, selected: the shared "nebula.repo" value (a root, ALL or nothing).
import { ALL, tabOf } from "./tabs.js";

// -> { all (the All tab is selected), items: [{ root, name, status, needs, on, pinned }] }. A root missing
// from the summary is left out. Pinned projects come first, in pin order; the rest keep the open list's
// order: picking a project never moves it.
export function railTabs({ summary, open, selected, pinned = [] }) {
  const tab = tabOf(open, selected),
    by = new Map(summary.map((p) => [p.root, p]));
  const pins = pinned.filter((r) => open.includes(r));
  const items = [...pins, ...open.filter((r) => !pins.includes(r))]
    .filter((r) => by.has(r))
    .map((root) => ({
      root,
      name: by.get(root).name,
      status: by.get(root).status,
      needs: by.get(root).needs ?? 0,
      on: root === tab,
      pinned: pins.includes(root),
    }));
  return { all: tab === ALL, items };
}

// The pin list after the project menu's Pin or Unpin on `root`: a new pin goes last among the pins.
export const togglePinned = (pinned, root) => ((pinned ?? []).includes(root) ? pinned.filter((r) => r !== root) : [...(pinned ?? []), root]);

// The ⌘ number rule: only the first 9 project tabs have a key (⌘1 to ⌘9). n is the tab's place from 1.
// The digit is always drawn: "show the numbers while ⌘ is held" is not possible, because Herdr reports
// modifier changes (on_modifiers_changed) only on the keyboard focus path, and while you type in an
// agent the terminal has it, so the icon bar never hears ⌘.
// -> { tip (the tooltip: "name  ⌘n", or just the name), num (the digit drawn on the icon's corner, or null) }.
export const tabHint = (name, n) => (n <= 9 ? { tip: `${name}  \u2318${n}`, num: n } : { tip: name, num: null });

// The count in a tab's red pill: the number of sessions that need you, "9+" past nine.
export const pillText = (n) => (n > 9 ? "9+" : String(n));

// A click on a project icon also hands the (focusable) icon bar the keys, and Herdr tells it "focus"; the bar
// passes such a "focus" on to the board, except right after a project pick, when the keys belong to the agent
// the pick showed. pending: a re-show still waiting; at: when the last re-show ran (ms); ms: the re-show delay.
export const passFocusOn = ({ pending, at, now, ms }) => !pending && now - (at ?? 0) > ms * 2;

// Dragging a project in the icon bar. order: the roots as drawn (pins first); pinned: the pin list; from: the
// dragged index; to: the slot it lands in (0..order.length, before item `to`). Landing among the pins pins it,
// below them unpins it, and on the boundary it keeps its state, so the pins stay one group on top.
// -> { order, pinned } with pins of projects not drawn kept at the end, or null for a move that changes nothing.
export function moveTab(order, pinned, from, to) {
  const pins = pinned ?? [],
    root = order[from];
  if (root === undefined || to === from || to === from + 1) return null;
  const was = pins.includes(root),
    rest = order.filter((_, i) => i !== from),
    slot = to > from ? to - 1 : to,
    p = rest.filter((r) => pins.includes(r)).length; // pins above the boundary once it is lifted out
  const now = slot < p ? true : slot > p ? false : was;
  const next = [...rest.slice(0, slot), root, ...rest.slice(slot)];
  return { order: next, pinned: [...next.filter((r) => (r === root ? now : pins.includes(r))), ...pins.filter((r) => !order.includes(r))] };
}

// The slot a drag lands in while it hovers icon `index`: before it on the top half, after it on the bottom.
export const dropSlot = (index, y, height) => (y > height / 2 ? index + 1 : index);
