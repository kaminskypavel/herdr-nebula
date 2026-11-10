import test from "node:test";
import assert from "node:assert/strict";
import {
  WT,
  branchOf,
  withoutEnter,
  seedTask,
  draftOf,
  planLaunch,
  runSteps,
  bind,
  worktreePath,
  installedHarnesses,
  usablePresets,
  applyPreset,
  cyclePreset,
  prefillOf,
  checkoutIndex,
} from "../mods/nebula/lib/launch.js";
import { launchLabels } from "../mods/nebula/lib/labels.js";

const repo = { root: "/w/app", name: "app" };
const checkouts = [
  { path: "/w/app", branch: "main" },
  { path: "/w/app-worktrees/fix-x", branch: "fix-x" },
];
const base = {
  repo,
  checkouts,
  checkout: "/w/app",
  newWorktree: false,
  branch: "",
  branchExists: false,
  spaces: [],
  harness: "claude",
  model: null,
  effort: null,
  preset: null,
  task: "Fix X",
  from: "board",
};
const plan = (o) => planLaunch({ ...base, ...o });
const launchStep = (p) => p.steps.find((s) => s.launch);

test("a checkout already shown in a space plans tab.new in that space", () => {
  const p = plan({ spaces: [{ id: "s1", path: "/w/app/src" }] });
  assert.deepEqual(
    p.steps.map((s) => (s.type === "do" ? s.name : s.type)),
    ["space.select", "tab.new", "labels", "keys"],
  );
  assert.deepEqual(launchStep(p).args, { space: "s1", folder: "/w/app", argv: ["claude", "Fix X"] });
});

test("a space inside a deeper checkout does not count for the outer one", () => {
  const nested = [
    { path: "/w/app", branch: "main" },
    { path: "/w/app/.wt/a", branch: "a" },
  ];
  const p = plan({ checkouts: nested, spaces: [{ id: "s9", path: "/w/app/.wt/a" }] });
  assert.equal(launchStep(p).name, "space.new");
});

test("a checkout with no space plans space.new at its path", () => {
  const p = plan({ checkout: "/w/app-worktrees/fix-x", spaces: [{ id: "s1", path: "/w/app" }] });
  assert.deepEqual(
    p.steps.map((s) => (s.type === "do" ? s.name : s.type)),
    ["space.new", "labels", "keys"],
  );
  assert.deepEqual(launchStep(p).args, { folder: "/w/app-worktrees/fix-x", argv: ["claude", "Fix X"] });
});

test("^N with a new branch plans wt switch --create, then space.new at the path wt returns", () => {
  const p = plan({ newWorktree: true, branch: "fix-x2" });
  assert.deepEqual(p.steps[0], { type: "wt", args: ["-C", "/w/app", "switch", "--create", "fix-x2", "--no-cd", "-y", "--format", "json"], timeout: 600000 });
  assert.equal(launchStep(p).name, "space.new");
  assert.equal(launchStep(p).args.folder, WT);
  const bound = { steps: bind(p.steps, "/w/app-worktrees/fix-x2") };
  assert.equal(launchStep(bound).args.folder, "/w/app-worktrees/fix-x2");
  assert.equal(bound.steps.find((s) => s.type === "labels").launch.checkout, "/w/app-worktrees/fix-x2");
});

test("^N with a branch that exists without a worktree plans wt switch without --create", () => {
  const p = plan({ newWorktree: true, branch: "old", branchExists: true });
  assert.deepEqual(p.steps[0].args, ["-C", "/w/app", "switch", "old", "--no-cd", "-y", "--format", "json"]);
});

test("^N with a branch that already has a worktree plans no wt call and reuses it", () => {
  const p = plan({ newWorktree: true, branch: "fix-x", branchExists: true, spaces: [{ id: "s2", path: "/w/app-worktrees/fix-x" }] });
  assert.ok(!p.steps.some((s) => s.type === "wt"));
  assert.deepEqual(launchStep(p).args, { space: "s2", folder: "/w/app-worktrees/fix-x", argv: ["claude", "Fix X"] });
  assert.equal(p.existing, true);
});

test("an empty task plans the bare harness argv", () => {
  assert.deepEqual(launchStep(plan({ task: "  " })).args.argv, ["claude"]);
});

test("a multi-line task stays one trailing argv item", () => {
  assert.deepEqual(launchStep(plan({ task: "a\nb" })).args.argv, ["claude", "a\nb"]);
});

test("a preset with prefix 'Think first' and task 'Fix X' composes prefix, a blank line, then the task", () => {
  const p = plan({ preset: { name: "Careful", prefix: "Think first", postfix: "" } });
  assert.deepEqual(launchStep(p).args.argv, ["claude", "Think first\n\nFix X"]);
  assert.equal(p.steps.find((s) => s.type === "labels").launch.preset, "Careful");
});

test("a preset that skips the task leaves the typed task out", () => {
  const p = plan({ preset: { name: "Just go", prefix: "Go", postfix: "", skip_task: true } });
  assert.deepEqual(launchStep(p).args.argv, ["claude", "Go"]);
});

test("model and effort reach the argv and the launch label", () => {
  const p = plan({ model: "opus", effort: "high" });
  assert.deepEqual(launchStep(p).args.argv, ["claude", "--model", "opus", "--effort", "high", "Fix X"]);
  assert.deepEqual(p.steps.find((s) => s.type === "labels").launch, { harness: "claude", model: "opus", effort: "high", preset: null, checkout: "/w/app" });
  assert.ok(launchLabels(p.steps.find((s) => s.type === "labels").launch)["nebula.board"]);
});

test("a launch from the board plans keys staying on the board; from Cmd+K they move to the agent", () => {
  assert.deepEqual(plan({ from: "board" }).steps.at(-1), { type: "keys", to: "board" });
  assert.deepEqual(plan({ from: "terminal" }).steps.at(-1), { type: "keys", to: "agent" });
});

test("a harness that is not installed never appears in the picker", () => {
  const known = [
    { key: "claude", name: "Claude Code", run: ["claude"], installed: true },
    { key: "codex", name: "Codex", run: ["codex"], installed: false },
    { key: "cursor", name: "Cursor", run: ["cursor-agent"], installed: true },
    { key: "nvim", name: "Neovim", run: ["nvim"], installed: true },
  ];
  assert.deepEqual(installedHarnesses(known), ["claude", "cursor"]);
});

test("presets of a harness that is not installed are not offered, and applying one sets harness, model and effort", () => {
  const presets = [
    { name: "A", kind: "claude", model: "opus", effort: "high" },
    { name: "B", kind: "codex", model: null, effort: null },
    { name: "C", kind: "custom", custom_harness: "mine" },
    { name: "D", kind: "open_code", model: "x", effort: null },
  ];
  assert.deepEqual(
    usablePresets(presets, ["claude", "opencode"]).map((p) => p.name),
    ["A", "D"],
  );
  assert.deepEqual(applyPreset(presets[0]), { harness: "claude", model: "opus", effort: "high" });
  assert.deepEqual(applyPreset(presets[3]), { harness: "opencode", model: "x", effort: null });
});

test("cycling presets walks none, each preset, then none again, both ways", () => {
  const ps = [{ name: "A" }, { name: "B" }];
  assert.equal(cyclePreset(ps, null, 1).name, "A");
  assert.equal(cyclePreset(ps, "A", 1).name, "B");
  assert.equal(cyclePreset(ps, "B", 1), null);
  assert.equal(cyclePreset(ps, null, -1).name, "B");
  assert.equal(cyclePreset(ps, "A", -1), null);
  assert.equal(cyclePreset([], null, 1), null);
});

test("shift-P prefills harness, model, effort, preset and checkout from a session's launch label", () => {
  const launch = { harness: "codex", model: "gpt-5.5", effort: "medium", preset: "Careful", checkout: "/w/app-worktrees/fix-x" };
  assert.deepEqual(prefillOf(launch, ["claude", "codex"]), { ...launch, root: null, task: "" });
  const kept = { ...launch, root: "/w/app", task: "fix it" };
  assert.deepEqual(prefillOf(kept, ["codex"]), kept);
  assert.equal(prefillOf(null, ["claude"]), null);
  assert.equal(prefillOf({ ...launch, harness: "pi" }, ["claude"]).harness, null);
});

test("the new worktree path sits beside the repo in <repo>-worktrees", () => {
  assert.equal(worktreePath("/w/app", "fix/x y"), "/w/app-worktrees/fix-x-y");
});

test("checkoutIndex picks the deepest checkout holding a folder, else -1", () => {
  assert.equal(checkoutIndex("/w/app-worktrees/fix-x/src", checkouts), 1);
  assert.equal(checkoutIndex("/w/app/src", checkouts), 0);
  assert.equal(checkoutIndex("/elsewhere", checkouts), -1);
});

test("the branch follows the task until the user types in the branch field", () => {
  assert.equal(branchOf(null, "Fix the login bug", "amber-otter"), "fix-the-login-bug");
  assert.equal(branchOf(null, "Fix the login bug now please", "amber-otter"), "fix-the-login-bug-now");
  assert.equal(branchOf("my-branch", "Something else entirely", "amber-otter"), "my-branch");
  assert.equal(branchOf("my-branch", "", "amber-otter"), "my-branch");
});

test("a Hebrew or empty task proposes the random two-word name, and an emptied field falls back to it", () => {
  assert.equal(branchOf(null, "תקן את הבאג", "amber-otter"), "amber-otter");
  assert.equal(branchOf(null, "", "amber-otter"), "amber-otter");
  assert.equal(branchOf("  ", "תקן", "amber-otter"), "amber-otter");
});

test("Enter's newline is dropped wherever it landed; Shift+Enter keeps its own", () => {
  assert.equal(withoutEnter("fix it", "fix it\n"), "fix it");
  assert.equal(withoutEnter("fix it", "fix\n it"), "fix it");
  assert.equal(withoutEnter("", "\n"), "");
  assert.equal(withoutEnter("fix it", "fix it, now"), "fix it, now");
});

test("the box opens on the draft Esc kept, unless a preset or relaunch brings its own task", () => {
  assert.equal(seedTask(undefined, "half a thought"), "half a thought");
  assert.equal(seedTask("", "half a thought"), "half a thought");
  assert.equal(seedTask("from a preset", "half a thought"), "from a preset");
  assert.equal(seedTask(undefined, undefined), "");
  assert.equal(seedTask(undefined, null), "");
  assert.equal(seedTask(undefined, 7), "");
});

test("Esc keeps a task as typed, and nothing for a blank one", () => {
  assert.equal(draftOf("fix the\nlogin"), "fix the\nlogin");
  assert.equal(draftOf("  trailing  "), "  trailing  ");
  for (const blank of ["", "  \n ", undefined, null]) assert.equal(draftOf(blank), "");
});

test("an Enter that came before the box was ready leaves no line break in the queued task", () => {
  // the field held "fix it", then Enter made it "fix it\n" before submit fired
  assert.equal(withoutEnter("fix it", "fix it\n"), "fix it");
  // after the field is rewritten clean, asking again keeps it as it is
  assert.equal(withoutEnter("fix it", "fix it"), "fix it");
});

// runSteps with a stub exec that records calls and answers by program.
const stub = (replies) => {
  const calls = [];
  const exec = async (prog, args) => {
    calls.push([prog, ...args]);
    const r = replies[prog === "herdr-app" ? args[1] : prog];
    if (r instanceof Error) throw r;
    return typeof r === "function" ? r(args) : (r ?? { code: 0, stdout: "{}", stderr: "" });
  };
  return { calls, exec };
};
const wtPlan = () => plan({ newWorktree: true, branch: "fix-y" }).steps;
const ok = (o) => ({ code: 0, stdout: JSON.stringify(o), stderr: "" });

test("a wt failure stops the run with wt's words and makes no later call", async () => {
  const { calls, exec } = stub({ wt: { code: 1, stdout: "", stderr: "\x1b[31mbranch busy\x1b[0m\nmore" } });
  const r = await runSteps(wtPlan(), exec);
  assert.deepEqual(r, { terminal: null, error: "branch busy more" });
  assert.equal(calls.length, 1);
});

test("wt output without a path is an error and stops the run", async () => {
  const { calls, exec } = stub({ wt: ok({}) });
  const r = await runSteps(wtPlan(), exec);
  assert.match(r.error, /did not say where/);
  assert.equal(calls.length, 1);
});

test("the wt path is bound into the later steps", async () => {
  const { calls, exec } = stub({ wt: ok({ path: "/w/app-worktrees/fix-y" }), "space.new": ok({ terminal: "t1" }) });
  await runSteps(wtPlan(), exec);
  assert.equal(JSON.parse(calls[1][3]).folder, "/w/app-worktrees/fix-y");
});

test("a do reply with an error stops the run before the labels", async () => {
  const { calls, exec } = stub({ "space.new": ok({ error: "no such folder" }) });
  const r = await runSteps(plan({}).steps, exec);
  assert.deepEqual(r, { terminal: null, error: "no such folder" });
  assert.ok(!calls.some((c) => c[0] === "hc"));
});

test("the labels go to the launch step's terminal in one hc label call", async () => {
  const { calls, exec } = stub({ "space.new": ok({ terminal: "t9" }) });
  const r = await runSteps(plan({ harness: "codex", model: "gpt-5.5" }).steps, exec);
  assert.deepEqual(r, { terminal: "t9", error: "" });
  const hc = calls.filter((c) => c[0] === "hc");
  assert.equal(hc.length, 1);
  assert.deepEqual(hc[0].slice(0, 3), ["hc", "label", "t9"]);
  assert.equal(hc[0].length, 5);
  assert.ok(hc[0].includes("nebula.board=1"));
  assert.ok(hc[0].some((a) => a.startsWith("nebula.launch=") && JSON.parse(a.slice(14)).model === "gpt-5.5"));
});

test("a failing label does not fail the launch; a reply with no terminal skips the labels", async () => {
  const bad = stub({ "space.new": ok({ terminal: "t1" }), hc: new Error("hc gone") });
  assert.deepEqual(await runSteps(plan({}).steps, bad.exec), { terminal: "t1", error: "" });
  const none = stub({});
  assert.deepEqual(await runSteps(plan({}).steps, none.exec), { terminal: null, error: "" });
  assert.ok(!none.calls.some((c) => c[0] === "hc"));
});

test("onStep sees each step before it runs", async () => {
  const { exec } = stub({ wt: ok({ path: "/p" }), "space.new": ok({ terminal: "t1" }) });
  const seen = [];
  await runSteps(wtPlan(), exec, (s) => {
    seen.push(s.type);
  });
  assert.deepEqual(seen, ["wt", "do", "labels", "keys"]);
});

test("a project whose folder is gone gets a plain message naming the folder, not the shell", async () => {
  const { goneText } = await import("../mods/nebula/lib/launch.js");
  assert.equal(
    goneText("little-adventures", "~/devl/good-muse-story/little-adventures"),
    "little-adventures is not at ~/devl/good-muse-story/little-adventures anymore. Remove it in Projects (+), then add it from where it is now.",
  );
});
