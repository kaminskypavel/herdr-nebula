import test from "node:test";
import assert from "node:assert/strict";
import { hintContext, hintPairs, hintLine, HELP_SIZE } from "../mods/nebula/lib/hints.js";
import { shortcutLabel } from "../mods/nebula/lib/settings.js";

const session = (extra = {}) => ({ type: "session", row: { id: "t1", address: "t1", ...extra } });
const base = { has: true, filtering: false, item: session(), pc: null, col: 2 };
const mac = shortcutLabel([], true);

test("the place is named from the focus, the filter and the cursor", () => {
  assert.equal(hintContext(base), "row");
  assert.equal(hintContext({ ...base, has: false }), "away");
  assert.equal(hintContext({ ...base, filtering: true }), "filter");
  assert.equal(hintContext({ ...base, filtering: true, has: false }), "filter", "typing in the filter beats everything");
  assert.equal(hintContext({ ...base, item: session({ kind: "nebula" }) }), "nebula");
  assert.equal(hintContext({ ...base, item: session({ archived: true }) }), "archived");
  assert.equal(hintContext({ ...base, item: session({ exited: true, session: "claude:abc123" }) }), "exited");
  assert.equal(hintContext({ ...base, item: { type: "vacant", band: {} } }), "vacant");
  assert.equal(hintContext({ ...base, item: { type: "repo" } }), "repo");
  assert.equal(hintContext({ ...base, item: undefined }), "empty");
});

test("Columns in Projects mode has hints for its project and worktree columns, rows in the session column", () => {
  const pc = { scoped: false };
  assert.equal(hintContext({ ...base, pc, col: 0, item: { type: "project" } }), "columns");
  assert.equal(hintContext({ ...base, pc, col: 1, item: { type: "worktree" } }), "columns");
  assert.equal(hintContext({ ...base, pc, col: 2 }), "row");
});

test("a row says what Enter does, and that Esc hands the keys back", () => {
  assert.equal(hintLine(hintPairs("row"), mac), "↩ open · Esc to terminal · r rename · a archive · d delete · / jump · ? keys");
  assert.match(hintLine(hintPairs("row", { preview: true }), mac), /^↩ step in /);
});

test("an empty worktree offers a new session, and delete only where the board may remove it", () => {
  assert.equal(hintLine(hintPairs("vacant", { deletable: true }), mac), "p new session · d delete worktree · / jump · ? keys");
  assert.equal(hintLine(hintPairs("vacant"), mac), "p new session · / jump · ? keys");
});

test("the filter says how to leave it", () => {
  assert.equal(hintLine(hintPairs("filter"), mac), "↩ first match · Esc clear");
});

test("Columns lists the column keys", () => {
  assert.match(hintLine(hintPairs("columns"), mac), /^j k move · h l column · ↩ open/);
});

test("an archived row offers unarchive, a nebula row hide, an exited row resume", () => {
  assert.match(hintLine(hintPairs("archived"), mac), /u unarchive/);
  assert.match(hintLine(hintPairs("nebula"), mac), /^↩ resume · d hide/);
  assert.match(hintLine(hintPairs("exited"), mac), /^↩ resume /);
});

test("with the keys elsewhere, the hint says how to get them, from the live keymap", () => {
  assert.equal(hintLine(hintPairs("away"), mac), "⌃` keys to the board · ⌘J jump to an agent · click a row to show it");
  const rebound = shortcutLabel(
    [
      { section: "layout:nebula", keys: "ctrl-space", action: "nebula.keys" },
      { section: "layout:nebula", keys: "cmd-p", action: "nebula.jump" },
    ],
    true,
  );
  assert.equal(hintLine(hintPairs("away"), rebound), "⌃Space keys to the board · ⌘P jump to an agent · click a row to show it");
});

test("the empty board and a repo header have hints too", () => {
  assert.equal(hintLine(hintPairs("empty"), mac), "p new session · / jump · ⌃` fold · ? keys");
  assert.match(hintLine(hintPairs("repo"), mac), /^↩ fold/);
});

test("no hint has an em dash, and every context has pairs", () => {
  for (const ctx of ["away", "filter", "columns", "nebula", "archived", "exited", "row", "vacant", "repo", "empty"]) {
    const line = hintLine(hintPairs(ctx, { deletable: true }), mac);
    assert.ok(line.length > 0 && !line.includes(String.fromCharCode(0x2014)), ctx);
  }
});

test("the Help dialog is big enough for the board's keys", () => {
  assert.ok(HELP_SIZE.width >= 560 && HELP_SIZE.height >= 460);
});

test("a click opens a row in every view, so the away hint says so", () => {
  assert.deepEqual(hintPairs("away").at(-1), ["click", "a row to show it"]);
});
