import test from "node:test";
import assert from "node:assert/strict";
import { updateState, updateNotice, shouldNotify, parseCheck } from "../mods/nebula/lib/update.js";

test("an installed copy behind main has an update; one with its own changes is left to git", () => {
  assert.equal(updateState({ behind: 3 }), "available");
  assert.equal(updateState({ behind: 0 }), "current");
  assert.equal(updateState({ behind: 3, dirty: true }), "local");
  assert.equal(updateState({ behind: 3, ahead: 1 }), "local");
  assert.equal(updateState({ behind: 3, branch: "feat/x" }), "local");
  assert.equal(updateState({ behind: 0, dirty: true }), "current");
});

test("the popup names the changes and runs nebula.update on click; a local copy gets a plain notice", () => {
  const n = updateNotice({ behind: 2, subjects: ["feat: motion", "fix: x"], latest: "abc" });
  assert.equal(n.title, "herdr-nebula update");
  assert.equal(n.body, "2 changes · feat: motion · click to update");
  assert.deepEqual(n.action, { name: "nebula.update", args: {} });
  assert.equal(updateNotice({ behind: 1, dirty: true }).action, undefined);
  assert.equal(updateNotice({ behind: 0 }), null);
});

test("each new latest commit notifies once", () => {
  const r = { behind: 1, latest: "abc" };
  assert.equal(shouldNotify(r, null), true);
  assert.equal(shouldNotify(r, "abc"), false);
  assert.equal(shouldNotify({ behind: 0, latest: "abc" }, null), false);
});

test("git's outputs become the report", () => {
  assert.deepEqual(parseCheck({ counts: "3\t1\n", status: " M x\n", branch: "main\n", head: "aaa\n", latest: "bbb\n", log: "one\ntwo\n" }), {
    behind: 3,
    ahead: 1,
    dirty: true,
    branch: "main",
    head: "aaa",
    latest: "bbb",
    subjects: ["one", "two"],
  });
});
