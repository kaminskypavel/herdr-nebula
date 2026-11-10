import test from "node:test";
import assert from "node:assert/strict";
import {
  FLASH_MS,
  archivedFlash,
  unarchivedFlash,
  asleepFlash,
  resumingFlash,
  startedFlash,
  makeFlash,
  liveFlash,
  flashValue,
  uKey,
  NOTHING_WAITING,
  HIDDEN_TEXT,
  RENAMED,
} from "../mods/nebula/lib/flash.js";

test("the messages read as the spec says", () => {
  assert.equal(archivedFlash("Fix login"), "Archived 'Fix login' · u undo");
  assert.equal(unarchivedFlash("Fix login"), "Unarchived 'Fix login'");
  assert.equal(asleepFlash("api refactor"), "Asleep: api refactor");
  assert.equal(resumingFlash("api refactor"), "Resuming api refactor");
  assert.equal(startedFlash("herdr-nebula", "feat-x"), "Started in herdr-nebula / feat-x");
  assert.equal(NOTHING_WAITING, "Nothing waiting");
  assert.equal(HIDDEN_TEXT, "Hidden from board");
  assert.equal(RENAMED, "Renamed");
});

test("a launch with no branch (a plain folder) names only the project", () => {
  assert.equal(startedFlash("notes", null), "Started in notes");
  assert.equal(startedFlash("notes", undefined), "Started in notes");
});

test("a long or multi-line title is cut to one short line", () => {
  const text = archivedFlash(`${"x".repeat(80)}\nsecond line`);
  assert.ok(!text.includes("\n"));
  assert.ok(text.includes("…"));
  assert.ok(text.length < 60);
  assert.equal(asleepFlash("  spaced   out  "), "Asleep: spaced out");
});

test("no message has an em dash", () => {
  const all = [archivedFlash("a"), unarchivedFlash("a"), asleepFlash("a"), resumingFlash("a"), startedFlash("a", "b"), NOTHING_WAITING, HIDDEN_TEXT, RENAMED];
  assert.ok(all.every((t) => !t.includes(String.fromCharCode(0x2014))));
});

test("a flash lasts three seconds, then the hints are back", () => {
  assert.equal(FLASH_MS, 3000);
  const f = makeFlash("Renamed", undefined, 1000);
  assert.equal(f.until, 4000);
  assert.equal(liveFlash(f, 1000), f);
  assert.equal(liveFlash(f, 3999), f);
  assert.equal(liveFlash(f, 4000), null);
  assert.equal(liveFlash(null, 0), null);
});

test("an archive flash carries what u undoes", () => {
  assert.deepEqual(makeFlash("x", { tab: "tab3", title: "T" }, 0).undo, { tab: "tab3", title: "T" });
  assert.equal("undo" in makeFlash("x", undefined, 0), false);
});

test("a dialog's shared value changes every time, so the board shows a repeat", () => {
  const a = flashValue("Renamed"),
    b = flashValue("Renamed");
  assert.equal(a.text, "Renamed");
  assert.notEqual(a.n, b.n);
  assert.deepEqual(flashValue("x", { tab: "t", title: "T" }).undo, { tab: "t", title: "T" });
});

test("u on an archived row is that row's Unarchive", () => {
  assert.deepEqual(uKey({ archived: true }, { tab: "t9", title: "Old" }), { kind: "row" });
});

test("u with no archived row under the cursor takes back the last archive", () => {
  assert.deepEqual(uKey({ archived: false }, { tab: "t9", title: "Old" }), { kind: "undo", tab: "t9", title: "Old" });
  assert.deepEqual(uKey(null, { tab: "t9", title: "Old" }), { kind: "undo", tab: "t9", title: "Old" });
});

test("u with nothing archived says so", () => {
  assert.deepEqual(uKey({ archived: false }, null), { kind: "none" });
  assert.deepEqual(uKey(null, null), { kind: "none" });
});
