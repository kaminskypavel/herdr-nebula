// The count line shared by the status line while the terminal has the keys: what waits, as words in tones.
// (The Up next card, lib/upnext.js, replaced the attention strip that was here.) Pure; no herdr imports.

/** "2 need you", "1 needs you". */
export const needText = (n) => `${n} ${n === 1 ? "needs" : "need"} you`;

/**
 * The count line as [{ text, tone }] with tone "needs" | "unseen" | "plain", joined by " · " by the caller:
 * "2 need you", "1 done", then each of `tail` (plain words such as "⌘] next"). Empty counts leave their part out.
 */
export function stripParts({ needs, unseen }, tail = []) {
  return [
    ...(needs > 0 ? [{ text: needText(needs), tone: "needs" }] : []),
    ...(unseen > 0 ? [{ text: `${unseen} done`, tone: "unseen" }] : []),
    ...tail.map((text) => ({ text, tone: "plain" })),
  ];
}
