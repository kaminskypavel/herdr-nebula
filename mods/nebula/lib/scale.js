// Text sizes follow the terminal text size in Herdr's settings (⌘, then Look): the panels'
// 13px base text becomes that size, and every other size moves with it, times the Text size
// setting (percent). Each mod sets the scale at the top of its render; fs() reads it.
const BASE = 13;
let k = 1;

/** The Text size setting's choices, in percent of the terminal's text size. */
export const TEXT_SIZES = [90, 100, 110, 125, 140];
export const textSizeLabel = (pct) => `${pct}%`;

/** Sets the scale from Herdr's look (settings()) and the Text size percent; returns it. */
export function setTextScale(look, pct = 100) {
  const n = Number(look?.font_size);
  const f = TEXT_SIZES.includes(pct) ? pct / 100 : 1;
  k = (n > 0 ? n / BASE : 1) * f;
  return k;
}

/** A text size in px, scaled, to the half pixel. */
export const fs = (n) => Math.round(n * k * 2) / 2;

/** A row height in px, scaled, to the whole pixel. */
export const rh = (n) => Math.round(n * k);
