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
