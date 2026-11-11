import test from "node:test";
import assert from "node:assert/strict";
import { focusCommand, previewTarget, refocusDue, giveBackTarget, PREVIEW_MS, HOLD_MS } from "../mods/nebula/lib/preview.js";
import { REFOCUS_MS } from "../mods/nebula/lib/focus.js";

const live = { id: "t1", address: "t1", pane: "p1", status: "seen", archived: false };
const item = (row, type = "session") => ({ type, key: row.id, row });

test("a live session is previewed, with its pane when it has one", () => {
  assert.equal(previewTarget(item(live)), live);
  assert.deepEqual(focusCommand(live), { name: "pane.focus", args: { pane: "p1" } });
});

test("an agent with no pane (its tab is gone) gets a tab of its own, never a split of the current one", () => {
  assert.deepEqual(focusCommand({ ...live, pane: null }), { name: "terminal.keep", args: { terminal: "t1" } });
});

test("nothing is previewed for a nebula row, an archived row (showing it would unarchive it), a header or nothing", () => {
  assert.equal(previewTarget(item({ ...live, kind: "nebula" })), null);
  assert.equal(previewTarget(item({ ...live, archived: true })), null);
  assert.equal(previewTarget(item(live, "repo")), null);
  assert.equal(previewTarget(item(live, "vacant")), null);
  assert.equal(previewTarget(undefined), null);
  assert.equal(previewTarget(item({ ...live, address: "" })), null);
});

test("the board takes its keys back when Herdr moved focus onto the previewed agent", () => {
  assert.equal(refocusDue({ focused: { terminal: "t1", pane: "p1" }, row: live, has: false }), true);
  assert.equal(refocusDue({ focused: { terminal: null, pane: "p1", agent: null }, row: live, has: false }), true, "a pane match is enough");
  assert.equal(refocusDue({ focused: { terminal: null, pane: null, agent: "t1" }, row: { ...live, pane: null }, has: false }), true);
});

test("the board does not fight the user: another terminal in focus, or the board already holding the keys, asks for nothing", () => {
  assert.equal(refocusDue({ focused: { terminal: "t2", pane: "p2" }, row: live, has: false }), false);
  assert.equal(refocusDue({ focused: { terminal: "t1", pane: "p1" }, row: live, has: true }), false);
  assert.equal(refocusDue({ focused: null, row: live, has: false }), false);
  assert.equal(refocusDue({ focused: { terminal: null, pane: null }, row: { ...live, pane: null }, has: false }), false, "no pane to match is no match");
});

test("Esc hands the keys to the agent shown, if its pane is still there", () => {
  const panes = [{ pane: "p1" }, { pane: "p9" }];
  assert.deepEqual(giveBackTarget({ previewed: live, lastPane: "p9", panes }), { name: "pane.focus", args: { pane: "p1" } });
});

test("Esc falls back to the pane that had the keys before the board, then to nothing", () => {
  assert.deepEqual(giveBackTarget({ previewed: live, lastPane: "p9", panes: [{ pane: "p9" }] }), { name: "pane.focus", args: { pane: "p9" } });
  assert.deepEqual(giveBackTarget({ previewed: null, lastPane: "p9", panes: [{ pane: "p9" }] }), { name: "pane.focus", args: { pane: "p9" } });
  assert.equal(giveBackTarget({ previewed: null, lastPane: "gone", panes: [{ pane: "p9" }] }), null);
  assert.equal(giveBackTarget({ previewed: null, lastPane: null, panes: [] }), null);
});

test("a parked agent shown last still gets the keys by its address", () => {
  assert.deepEqual(giveBackTarget({ previewed: { ...live, pane: null }, lastPane: null, panes: [] }), { name: "agent.focus", args: { terminal: "t1" } });
});

test("the preview waits about 150 ms and the board insists it has the keys for a second", () => {
  assert.equal(PREVIEW_MS, 150);
  assert.ok(HOLD_MS > Math.max(...REFOCUS_MS), "the hold outlasts the last refocus ask");
});
