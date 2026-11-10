import test from "node:test";
import assert from "node:assert/strict";
import { closing, endsLine, tilde } from "../mods/confirm/lib.js";

const spaces = [
  {
    id: "sp1",
    name: "little-adventures",
    folder: "/Users/pk/devl/little-adventures",
    tabs: [
      { id: "tb1", name: "Meta Hackathon Winners" },
      { id: "tb2", name: "2" },
    ],
  },
];
const agents = [
  { space: "sp1", tab: "tb1", app: "claude-code", status: "done" },
  { space: "sp1", tab: "tb2", app: "codex", status: "blocked" },
  { space: "sp9", tab: "tb9", app: "claude-code", status: "working" },
];

test("closing a space names it, its folder and the agents it would end", () => {
  const c = closing({ name: "space.close", args: { id: "sp1" } }, spaces, agents);
  assert.equal(c.kind, "space");
  assert.equal(c.name, "little-adventures");
  assert.equal(c.folder, "/Users/pk/devl/little-adventures");
  assert.deepEqual(c.agents, [
    { name: "Meta Hackathon Winners", word: "done", tone: "ansi6" },
    { name: "codex", word: "needs you", tone: "ansi1" },
  ]);
  assert.equal(endsLine(c), "Ends 2 agents in 2 tabs:");
});

test("closing a tab lists only that tab's agents; other commands keep Herdr's own text", () => {
  const c = closing({ name: "tab.close", args: { id: "tb1" } }, spaces, agents);
  assert.equal(c.kind, "tab");
  assert.equal(c.name, "Meta Hackathon Winners");
  assert.equal(endsLine(c), "Ends 1 agent:");
  assert.equal(closing({ name: "terminal.kill", args: { id: "t1" } }, spaces, agents), null);
  assert.equal(closing({ name: "space.close", args: { id: "gone" } }, spaces, agents), null);
  assert.equal(endsLine({ kind: "space", tabs: 1, agents: [] }), "No agent is running here.");
  assert.equal(tilde("/Users/pk/devl/x", "/Users/pk"), "~/devl/x");
});
