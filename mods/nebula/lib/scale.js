// Text sizes follow the terminal text size in Herdr's settings (⌘, then Look): the panels'
// 13px base text becomes that size, and every other size moves with it. Each mod sets the
// scale from settings() at the top of its render; fs() reads it.
const BASE = 13;
let k = 1;

/** Sets the scale from Herdr's look (settings()); returns it. */
export function setTextScale(look) {
  const n = Number(look?.font_size);
  k = n > 0 ? n / BASE : 1;
  return k;
}

/** A text size in px, scaled, to the half pixel. */
export const fs = (n) => Math.round(n * k * 2) / 2;

/** A row height in px, scaled, to the whole pixel. */
export const rh = (n) => Math.round(n * k);
