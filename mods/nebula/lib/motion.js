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
