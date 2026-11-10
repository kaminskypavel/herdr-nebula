// The board's status line says what an action did for FLASH_MS, then goes back to the key hints
// (lib/hints.js). A flash is { text, until, undo? }; undo is { tab, title } of the archive that
// `u` takes back. The dialogs, which live in another mod, send theirs through the shared value
// nebula.flash = { text, n, undo? } (flashValue); the board shows each new n. No herdr imports,
// so node can test it.

export const FLASH_MS = 3000;
export const NOTHING_WAITING = "Nothing waiting";
export const HIDDEN_TEXT = "Hidden from board";
export const NOTHING_TO_UNARCHIVE = "Nothing to unarchive";
export const RENAMED = "Renamed";

const MAX = 36;
const short = (s) => {
  const t = String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > MAX ? `${t.slice(0, MAX - 1)}…` : t;
};

export const archivedFlash = (title) => `Archived '${short(title)}' · u undo`;
export const unarchivedFlash = (title) => `Unarchived '${short(title)}'`;
export const asleepFlash = (title) => `Asleep: ${short(title)}`;
export const resumingFlash = (title) => `Resuming ${short(title)}`;
export const startedFlash = (project, branch) => `Started in ${[project, branch].filter(Boolean).join(" / ")}`;

/** The shared value a dialog writes to flash a line on the board. */
export const flashValue = (text, undo) => ({ text, n: Math.random(), ...(undo ? { undo } : {}) });

/** A new flash from a text (and the archive it can undo), shown from `now`. */
export const makeFlash = (text, undo, now = Date.now()) => ({ text, until: now + FLASH_MS, ...(undo ? { undo } : {}) });

/** The flash to draw at `now`, or null once it has run out. */
export const liveFlash = (flash, now = Date.now()) => (flash && now < flash.until ? flash : null);

/**
 * What `u` does. On an archived row it is that row's Unarchive ("row", the row action handles it);
 * with no archived row under the cursor it takes back the last archive ("undo" with its tab and
 * title), or says there is none ("none").
 */
export const uKey = (row, last) => (row?.archived ? { kind: "row" } : last ? { kind: "undo", ...last } : { kind: "none" });
