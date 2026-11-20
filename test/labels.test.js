import test from "node:test";
import assert from "node:assert/strict";
import { readLabels, launchLabels, isBoardLaunched, claudeTitleFile, renamedTitle } from "../mods/nebula/lib/labels.js";
import * as labelsLib from "../mods/nebula/lib/labels.js";

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

test("a prompt label drops the CLI's pasted_content tags, so a title made from it does too", () => {
  assert.equal(readLabels({ "nebula.prompt": '<pasted_content id="4e13">This view broke</pasted_content>' }).prompt, "This view broke");
});

test("claudeTitleFile: Claude's project folder name turns every non-alphanumeric into -", () => {
  assert.equal(
    claudeTitleFile("/Users/pk", "/Users/pk/devl/app/.claude/worktrees/x", "abc-1"),
    "/Users/pk/.claude/projects/-Users-pk-devl-app--claude-worktrees-x/abc-1/custom-title.json",
  );
});

test("renamedTitle: a /rename reaches a placeholder tab or one that follows Claude, never a hand-named one", () => {
  const file = JSON.stringify({ customTitle: "integrate-grow" });
  assert.equal(renamedTitle(file, "", true), "integrate-grow");
  assert.equal(renamedTitle(file, "old title", false), "integrate-grow");
  assert.equal(renamedTitle(file, "", false), null);
  assert.equal(renamedTitle(file, "integrate-grow", true), null);
  assert.equal(renamedTitle("not json", "", true), null);
});

test("tabFromWhere: the tab's name from the core's where; a bare position is no name", () => {
  const { tabFromWhere } = labelsLib;
  assert.deepEqual(tabFromWhere("general / I really like the way"), { name: "I really like the way", named: true });
  assert.deepEqual(tabFromWhere("app / 2"), { name: "2", named: false });
  assert.equal(tabFromWhere(""), null);
});
