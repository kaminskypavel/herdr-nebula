// The one switch for motion. The Reduce motion setting (lib/settings.js) turns every animation off: each mod
// sets it at the top of its render from the stored settings (setReduceMotion), and every animation is added
// through animate(), so a still look is one place. No herdr imports, so node can test it.

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
