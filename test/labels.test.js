import test from "node:test";
import assert from "node:assert/strict";
import { readLabels, launchLabels, isBoardLaunched } from "../mods/nebula/lib/labels.js";

const launch = { harness: "claude", model: "opus", effort: "high", preset: "reviewer", checkout: "/Users/dev/devl/acme-web" };

test("launch labels read back as written", () => {
  const out = readLabels({
    ...launchLabels(launch),
    "nebula.prompt": "fix login",
    "nebula.autotitle": "Fix login",
    "nebula.claudetitle": "Fix login",
    "nebula.session": "claude:s1",
    "nebula.asleep": "1",
  });
  assert.deepEqual(out, { board: true, launch, prompt: "fix login", autotitle: "Fix login", claudetitle: "Fix login", session: "claude:s1", asleep: true });
});

test("label values that are not valid JSON are ignored", () => {
  const out = readLabels({ "nebula.board": "1", "nebula.launch": "{not json" });
  assert.equal(out.launch, null);
  assert.equal(out.board, true);
});

test("a launch label that is JSON but not an object is ignored", () => {
  assert.equal(readLabels({ "nebula.launch": "42" }).launch, null);
});

test("terminals without labels are not board launched", () => {
  assert.equal(isBoardLaunched(undefined), false);
  assert.equal(isBoardLaunched({}), false);
  assert.equal(isBoardLaunched(launchLabels(launch)), true);
  assert.deepEqual(readLabels(null), { board: false, launch: null, prompt: "", autotitle: "", claudetitle: "", session: "", asleep: false });
});
