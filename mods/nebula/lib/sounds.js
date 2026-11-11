// The notification sound, as Herdr's settings.json wants it. Pure, so node can test it; the
// settings overlay does the reading, the writing and the preview. No herdr imports.

// The mp3 of a file sound (chirp, ping, drop) in the app folder, or null for herdr and off.
export const soundFile = (home, sound) => (sound === "herdr" || sound === "off" ? null : `${home}/mods/nebula/sounds/${sound}.mp3`);

// What to play when the person picks a sound: "done" (Herdr's own) or a file path; null for off.
export const soundPreview = (home, sound) => (sound === "off" ? null : (soundFile(home, sound) ?? "done"));

// The text of Herdr's settings.json after choosing `sound`. `text` is the file as it is now (missing or
// invalid counts as empty). sounds.enabled follows off; a file sound sets done and blocked, herdr or off
// clears them; every other key stays as it was.
export function applySound(text, home, sound) {
  let cur;
  try {
    cur = JSON.parse(text);
  } catch {
    cur = null;
  }
  const base = cur && typeof cur === "object" && !Array.isArray(cur) ? cur : {};
  const old = base.sounds && typeof base.sounds === "object" && !Array.isArray(base.sounds) ? base.sounds : {};
  const { done: _d, blocked: _b, ...rest } = old;
  const file = soundFile(home, sound);
  const out = JSON.stringify({ ...base, sounds: { ...rest, enabled: sound !== "off", ...(file ? { done: file, blocked: file } : {}) } }, null, 2);
  return `${out}\n`;
}
