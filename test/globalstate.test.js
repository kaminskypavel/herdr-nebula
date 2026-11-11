import test from "node:test";
import assert from "node:assert/strict";
import { snapshot, parseState, stateText, archiveStep, archiveApply, same, SYNCED } from "../mods/nebula/lib/globalstate.js";

test("the file round-trips; anything else is no state", () => {
  const s = { keys: { "nebula.open": ["/r/a"] }, archived: ["tb1"], from: "/h", at: 5 };
  assert.deepEqual(parseState(stateText(s)), s);
  assert.equal(parseState(""), null);
  assert.equal(parseState("{}"), null);
  assert.equal(parseState("nope"), null);
});

test("the snapshot holds every synced key, missing ones as null", () => {
  const snap = snapshot((k) => (k === "nebula.open" ? ["/r/a"] : undefined));
  assert.deepEqual(Object.keys(snap), SYNCED);
  assert.deepEqual(snap["nebula.open"], ["/r/a"]);
  assert.equal(snap["nebula.settings"], null);
  assert.equal(
    same(
      snap,
      snapshot((k) => (k === "nebula.open" ? ["/r/a"] : null)),
    ),
    true,
  );
});

test("first look: the file's archived tabs get settled here, and this screen's own join", () => {
  const r = archiveStep({ archived: ["tb1", "tbGone"], settled: ["tb2"], before: null, tabs: ["tb1", "tb2", "tb3"] });
  assert.deepEqual(r.archived.sort(), ["tb1", "tb2"]);
  assert.deepEqual(r.settle, ["tb1"]);
});

test("later looks follow this screen: settled here joins, brought back here leaves", () => {
  const tabs = ["tb1", "tb2", "tb3"];
  assert.deepEqual(archiveStep({ archived: ["tb1"], settled: ["tb1", "tb3"], before: ["tb1"], tabs }).archived.sort(), ["tb1", "tb3"]);
  assert.deepEqual(archiveStep({ archived: ["tb1", "tb3"], settled: ["tb3"], before: ["tb1", "tb3"], tabs }).archived, ["tb3"]);
  assert.deepEqual(archiveStep({ archived: ["tb1"], settled: ["tb1"], before: ["tb1"], tabs }).settle, []);
});

test("another window's list: settle what it archived, bring back what it dropped", () => {
  const r = archiveApply({ archived: ["tb1", "tbGone"], settled: ["tb2"], tabs: ["tb1", "tb2"] });
  assert.deepEqual(r, { archived: ["tb1"], settle: ["tb1"], unsettle: ["tb2"] });
});
