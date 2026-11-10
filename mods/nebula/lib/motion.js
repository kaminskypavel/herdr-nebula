// The one switch for motion. The Reduce motion setting (lib/settings.js) turns every animation off: each mod
// sets it at the top of its render from the stored settings (setReduceMotion), and every animation is added
// through animate(), so a still look is one place. No herdr imports, so node can test it.

import { rh } from "./scale.js";

let off = false;

/** Sets the switch (the Reduce motion setting); returns it. Anything but `true` is motion on. */
export const setReduceMotion = (reduce) => {
  off = reduce === true;
  return off;
};

/** Whether motion is off. */
export const reduced = () => off;

/** Applies `fn` (a chain of .loop, .transition, .spring, .frames) to `el` unless motion is off. */
export const animate = (el, fn) => (off ? el : fn(el));

// Claude Code's own star spinner, shown in place of a working row's dot.
export const STAR = ["·", "✢", "✳", "✶", "✻", "✽"];
export const STAR_MS = 110;

// The agent icon's bob while its row works.
export const BOB = { from: 0, to: -2, period: 800 };

// A row that just began needing you wiggles sideways for its first moments, then its red bar breathes
// for as long as it needs you and nobody is looking at it.
export const NUDGE = { from: 0, to: 3, period: 140 };
export const BREATHE = { from: 0.45, to: 1, period: 1200 };

// Springs settle in about 300 ms and do not overshoot. A done dot is drawn POP px for its first moments, then springs back.
export const SPRING = { response: 300, damping: 1 };
export const POP = 12;

// The icon bar's accent marker: a tab button is 42 px, 4 px apart; a short line (1 px, 2 px above and below)
// separates the pinned tabs from the rest. The marker is 16 px tall, centered on its button.
const TAB = 42,
  TAB_GAP = 4,
  DIVIDER = 5,
  MARK_H = 16;

/**
 * The marker's `top` for each tab of the scrolling project list, measured from the list's own top (so it
 * scrolls with the tabs). `items` are the tabs in order, each with `pinned`.
 */
export function markerTops(items) {
  const tops = [];
  let y = 0;
  items.forEach((p, i) => {
    if (i > 0 && items[i - 1].pinned && !p.pinned) y += DIVIDER + TAB_GAP;
    tops.push(y + (TAB - MARK_H) / 2);
    y += TAB + TAB_GAP;
  });
  return tops;
}

export const FADE = { duration: 180, easing: "ease-out" };

/**
 * The attention strip's height for what it shows (lib/strip.js: `items` rows and `more` the rest): 6 px of padding
 * above and below, the 1 px rule, the count line (20), each row (22), the "+N more" line (20), 2 px between lines.
 * The board springs the strip's height to this, or to 0 when nothing needs attention.
 */
export const stripHeight = ({ items, more }) => 13 + rh(20) + items.length * (2 + rh(22)) + (more > 0 ? 2 + rh(20) : 0);

// A session row that appears for the first time fades in and rises. It is drawn at its start (invisible, 6 px
// down) for ENTER_FROM_MS, then at rest, and the transitions carry it across; ENTER_MS later it is forgotten.
export const ENTER = { duration: 180, easing: "ease-out" };
export const ENTER_RISE = 6;
const ENTER_FROM_MS = 50;
const ENTER_MS = 400;

/**
 * Notes the rows that are new: `state` is the last call's ({ known: Set, at: Map id -> ms }, null the first time),
 * `ids` the rows now. The first call that has any rows takes them all as already there (a started board does not
 * animate every row), and a row seen again after it went is new again. -> the new state.
 */
export function trackEntering(state, ids, now) {
  if (!state && !ids.length) return null;
  const prev = state ?? { known: new Set(ids), at: new Map() };
  const at = new Map();
  for (const [id, since] of prev.at) if (now - since < ENTER_MS && ids.includes(id)) at.set(id, since);
  for (const id of ids) if (!prev.known.has(id) && !at.has(id)) at.set(id, now);
  return { known: new Set(ids), at };
}

/** -> Map id -> "from" (draw at the start) or "to" (draw at rest, so the transition runs), for the rows still entering. */
export function enterPhase(state, now) {
  const out = new Map();
  for (const [id, since] of state?.at ?? []) if (now - since < ENTER_MS) out.set(id, now - since < ENTER_FROM_MS ? "from" : "to");
  return out;
}
