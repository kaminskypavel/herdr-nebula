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
    [
      ["back", "Back"],
      ["continue:/r/app-worktrees/fix-x", "fix-x"],
    ],
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

test("a session with other worktrees gets one Move to › item, before Archive", async () => {
  const { actionsFor } = await import("../mods/nebula/lib/actions.js");
  const ids = actionsFor({ address: "t1", tab: "tb1", continueTo: [{ path: "/w", label: "fix-x" }] }, false).map((a) => a.id);
  assert.ok(ids.includes("move"));
  assert.ok(ids.indexOf("move") < ids.indexOf("archive"));
  assert.ok(!actionsFor({ address: "t1", tab: "tb1", continueTo: [] }, false).some((a) => a.id === "move"));
});
