import test from "node:test";
import assert from "node:assert/strict";
import { resolveFolder, resolveAdd, addProject, projectList } from "../mods/nebula/lib/repos.js";
import { planLaunch } from "../mods/nebula/lib/launch.js";

const fake = (r) => async () => {
  if (r instanceof Error) throw r;
  return r;
};

test("a folder inside a git repo or worktree resolves to the main repo", async () => {
  const r = await resolveFolder(fake({ code: 0, stdout: "/w/app/.git\n", stderr: "" }), "/w/app-worktrees/x");
  assert.deepEqual(r, { root: "/w/app", git: true });
});

test("a folder that is not a git repo is its own project, named by its base name", async () => {
  const r = await resolveFolder(fake({ code: 128, stdout: "", stderr: "fatal: not a git repository" }), "/w/notes/");
  assert.deepEqual(r, { root: "/w/notes", git: false });
  const { root, existing } = resolveAdd({}, r.root);
  assert.equal(existing, null);
  assert.deepEqual(
    projectList(addProject({}, root)).map((p) => [p.root, p.name]),
    [["/w/notes", "notes"]],
  );
});

test("adding the same plain folder again finds it on the rail", async () => {
  const store = addProject({}, "/w/notes");
  assert.equal(resolveAdd(store, "/w/notes/").existing.root, "/w/notes");
});

test("a path that does not exist is an error", async () => {
  const r = await resolveFolder(fake(new Error("no such folder")), "/nope");
  assert.match(r.error, /No folder at \/nope/);
});

test("a plain folder never plans a wt step, even when a new worktree was asked for", () => {
  const p = planLaunch({
    repo: { root: "/w/notes" },
    checkouts: [{ path: "/w/notes", branch: null }],
    checkout: "/w/notes",
    git: false,
    newWorktree: true,
    branch: "x",
    branchExists: false,
    spaces: [],
    harness: "claude",
    model: null,
    effort: null,
    preset: null,
    task: "t",
    from: "board",
  });
  assert.ok(!p.steps.some((s) => s.type === "wt"));
  assert.deepEqual(p.steps.find((s) => s.launch).args.folder, "/w/notes");
});
