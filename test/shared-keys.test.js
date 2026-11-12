import test from "node:test";
import assert from "node:assert/strict";
import * as K from "../mods/nebula/lib/shared.js";
import { SYNCED } from "../mods/nebula/lib/globalstate.js";

// Herdr keeps shared() values per window: each app home (a second Herdr window has its own HERDR_APP_HOME) has its
// own shared.json. A value that must hold in every window (open projects, settings, archived, cleared...) goes in
// lib/globalstate.js SYNCED, which ~/.config/herdr-nebula/state.json keeps in step; one that belongs to a single
// window (its selected tab, a cache, a one-shot signal) goes here. A new key in neither fails this test.
const PER_WINDOW = new Set([
  K.REPO, // the tab this window shows
  K.FOCUS_BOARD,
  K.LAUNCHED,
  K.BOARD_KEYS,
  K.ROW_ACTION, // a one-shot signal from a dialog to this window's board
  K.RESUMED, // nebula session -> terminal this window resumed it into
  K.UPDATE, // each window's own update check
  K.SUMMARY,
  K.ICONS, // paths into this window's own icon cache
  K.DRAFT,
  K.FLASH,
  K.GOTO,
  K.REPLIES, // a cache of agents' lines, read again per window
  K.BACK, // this window's return from away
  K.RECENT_TOASTS, // alerts this window showed (dedupe)
]);

test("every nebula.* shared key is declared shared by all windows (SYNCED) or per window, not both", () => {
  const keys = Object.values(K).filter((v) => typeof v === "string" && v.startsWith("nebula."));
  for (const key of new Set(keys)) {
    const synced = SYNCED.includes(key),
      own = PER_WINDOW.has(key);
    assert.ok(
      synced !== own,
      `${key}: add it to lib/globalstate.js SYNCED (it must hold in every Herdr window) or to PER_WINDOW in this test (it belongs to one window)`,
    );
  }
});
