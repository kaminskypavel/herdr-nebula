import test from "node:test";
import assert from "node:assert/strict";
import { continueTargets, continueItems, handoffTask } from "../mods/nebula/lib/handoff.js";

const model = {
  repos: [
    {
      root: "/r/app",
      bands: [
        { path: "/r/app", label: "master", rows: [{ id: "t1" }] },
        { path: "/r/app-worktrees/fix-x", label: "fix-x", rows: [] },
        { path: "", label: "", rows: [{ id: "t9" }] },
      ],
    },
  ],
};

test("a session can continue in its project's other worktrees, not its own", () => {
  assert.deepEqual(continueTargets(model, "t1"), [{ path: "/r/app-worktrees/fix-x", label: "fix-x" }]);
  assert.deepEqual(continueTargets(model, "nope"), []);
  assert.deepEqual(
    continueItems(continueTargets(model, "t1")).map((i) => [i.id, i.label]),
    [["continue:/r/app-worktrees/fix-x", "Continue in fix-x"]],
  );
});

test("the handoff names the task, where it got to and where its changes are", () => {
  const task = handoffTask({ title: "Fix login", prompt: "fix the redirect", said: "Found the bug in auth.ts.", fromPath: "/r/app", fromLabel: "master" });
  assert.match(task, /session "Fix login" from the worktree master \(\/r\/app\)/);
  assert.match(task, /Its task: fix the redirect/);
  assert.match(task, /its last reply\): Found the bug/);
  assert.match(task, /git -C \/r\/app status/);
  assert.ok(!handoffTask({ title: "x", prompt: "", said: "", fromPath: "/a", fromLabel: "main" }).includes("Its task"), "no prompt: no task line");
});
