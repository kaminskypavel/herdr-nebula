import test from "node:test";
import assert from "node:assert/strict";
import {
  nebulaBin, parseSessions, parseAgents, joinSessions, visibleSessions, nebulaRow, resumeArgv, recordResumed,
} from "../mods/nebula/lib/nebula-sessions.js";
import { buildBoard, treeItems, listItems, columnsModel, projectColumns, agentOrder, attentionTarget, OTHER } from "../mods/nebula/lib/viewmodel.js";
import { actionsFor } from "../mods/nebula/lib/actions.js";
import { planLaunch, placedSpaces } from "../mods/nebula/lib/launch.js";
import { mergeSettings, DEFAULTS } from "../mods/nebula/lib/settings.js";

const cli = (sessions) => JSON.stringify({ sessions });
const S = (id, o = {}) => ({
  id, name: `name ${id}`, project: "app", project_id: "p", branch: "main", worktree: "/w/app/", harness: "claude",
  status: "idle", alive: false, summary: `sum ${id}`, ...o,
});
const db = (rows) => JSON.stringify(rows);
const A = (id, o = {}) => ({ id, claude_session_id: `conv-${id}`, model: "opus", effort: null, archived: 0, ...o });

test("nebulaBin builds the absolute CLI path from home", () => {
  assert.equal(nebulaBin("/Users/me"), "/Users/me/.local/bin/nebula");
});

test("parseSessions takes { sessions } or a bare list and survives junk", () => {
  assert.equal(parseSessions(cli([S("a")])).length, 1);
  assert.equal(parseSessions(JSON.stringify([S("a"), S("b")])).length, 2);
  for (const bad of ["", "nope", "null", "{}", '{"sessions":3}', undefined]) assert.deepEqual(parseSessions(bad), []);
  assert.equal(parseSessions(JSON.stringify([S("a"), 4, null])).length, 1);
});

test("parseAgents keys by id, skips archived and rows without a conversation id; empty output is empty", () => {
  const m = parseAgents(db([A("a"), A("b", { archived: 1 }), A("c", { claude_session_id: null }), A("d", { claude_session_id: "" }), A("e", { model: "", effort: "high" })]));
  assert.deepEqual([...m.keys()], ["a", "e"]);
  assert.deepEqual(m.get("a"), { claude: "conv-a", model: "opus", effort: null });
  assert.deepEqual(m.get("e"), { claude: "conv-e", model: null, effort: "high" });
  assert.equal(parseAgents("").size, 0);
  assert.equal(parseAgents("garbage").size, 0);
});

test("joinSessions keeps claude sessions with a conversation id, alive first, worktree without trailing slash", () => {
  const sessions = parseSessions(cli([
    S("idle1"), S("term", { harness: "terminal" }), S("noconv"), S("live1", { alive: true, status: "running" }),
    S("nofolder", { worktree: "" }), S("arch"),
  ]));
  const agents = parseAgents(db([A("idle1"), A("term"), A("live1"), A("nofolder"), A("arch", { archived: 1 })]));
  const out = joinSessions(sessions, agents);
  assert.deepEqual(out.map((s) => s.id), ["live1", "idle1"]);
  assert.equal(out[1].worktree, "/w/app");
  assert.equal(out[1].claude, "conv-idle1");
  assert.equal(out[0].status, "running");
});

test("visibleSessions hides an idle session while its resumed terminal exists, keeps a running one as forked", () => {
  const list = [{ id: "i", alive: false }, { id: "l", alive: true }, { id: "n", alive: false }];
  const resumed = { i: "t1", l: "t2", n: "t9" };
  const out = visibleSessions(list, resumed, new Set(["t1", "t2"]));
  assert.deepEqual(out.map((s) => [s.id, s.forked]), [["l", true], ["n", false]]);
  assert.deepEqual(visibleSessions(list, {}, new Set()).map((s) => s.id), ["i", "l", "n"]);
  assert.deepEqual(visibleSessions(list, undefined, new Set()).map((s) => s.forked), [false, false, false]);
});

test("resumeArgv: --resume, --fork-session only when alive, model and effort in buildArgv order", () => {
  assert.deepEqual(resumeArgv({ claude: "c1", alive: false, model: null, effort: null }), ["claude", "--resume", "c1"]);
  assert.deepEqual(resumeArgv({ claude: "c1", alive: true, model: "opus", effort: "high" }),
    ["claude", "--resume", "c1", "--fork-session", "--model", "opus", "--effort", "high"]);
  assert.deepEqual(resumeArgv({ claude: "c1", alive: false, model: "default", effort: "max" }), ["claude", "--resume", "c1", "--effort", "max"]);
});

test("recordResumed adds the new terminal and drops entries whose terminal is gone", () => {
  assert.deepEqual(recordResumed({ a: "t1", b: "t2" }, "c", "t3", new Set(["t1"])), { a: "t1", c: "t3" });
  assert.deepEqual(recordResumed(undefined, "c", "t3", new Set()), { c: "t3" });
});

test("nebulaRow: grey dim row with a nebula badge, words in age, no actions", () => {
  const idle = nebulaRow({ id: "x", name: "Fix login", worktree: "/w/app", summary: "Fix login", status: "idle", alive: false, forked: false });
  assert.equal(idle.kind, "nebula");
  assert.equal(idle.id, "nebula:x");
  assert.equal(idle.badge, "nebula");
  assert.equal(idle.status, "exited");
  assert.equal(idle.title, "Fix login");
  assert.equal(idle.age, "idle");
  assert.equal(idle.prompt, "");
  assert.equal(nebulaRow({ id: "y", name: "n", summary: "s", alive: true, forked: false }).age, "running in nebula");
  assert.equal(nebulaRow({ id: "y", name: "n", summary: "s", alive: true, forked: true }).age, "running in nebula (forked)");
  assert.deepEqual(actionsFor(idle, true), []);
});

const repos = [
  { root: "/w/app", name: "app", checkouts: [{ path: "/w/app", branch: "main" }, { path: "/w/app-worktrees/fix", branch: "fix" }] },
  { root: "/w/lib", name: "lib", checkouts: [{ path: "/w/lib", branch: "main" }] },
];
const joined = joinSessions(
  parseSessions(cli([
    S("m1", { worktree: "/w/app/" }), S("w1", { worktree: "/w/app-worktrees/fix", alive: true, status: "running" }),
    S("o1", { worktree: "/elsewhere/x" }), S("l1", { worktree: "/w/lib/src" }),
  ])),
  parseAgents(db(["m1", "w1", "o1", "l1"].map((i) => A(i)))),
);
const term = { address: "t1", cwd: "/w/app", status: "idle", state: "live", app: "claude-code", program: { key: "claude", name: "Claude Code", shell: false }, labels: {} };
const base = { terminals: [term], agents: [{ address: "t1", pane: "p1", tab: "tab1", status: "idle" }], spaces: [{ id: "sp", tabs: [{ id: "tab1", name: "Live", named: true, settled: false }] }], repos, now: 1000 };

test("buildBoard places nebula rows in their worktree band, project band, or Other", () => {
  const m = buildBoard({ ...base, nebula: joined });
  const app = m.repos.find((r) => r.root === "/w/app");
  assert.deepEqual(app.bands.map((b) => [b.path, b.rows.map((r) => r.id)]), [
    ["/w/app", ["t1", "nebula:m1"]],
    ["/w/app-worktrees/fix", ["nebula:w1"]],
  ]);
  assert.deepEqual(m.repos.find((r) => r.root === "/w/lib").rows.map((r) => r.id), ["nebula:l1"]);
  const other = m.repos.find((r) => r.root === OTHER);
  assert.deepEqual(other.rows.map((r) => r.id), ["nebula:o1"]);
});

test("buildBoard without nebula rows is unchanged: no Other, no extra rows", () => {
  const m = buildBoard(base);
  assert.deepEqual(m.repos.map((r) => [r.root, r.rows.length]), [["/w/app", 1], ["/w/lib", 0]]);
});

test("a resumed idle session hides while its terminal exists; a resumed running one stays, forked", () => {
  const resumed = { m1: "t1", w1: "t1" };
  const m = buildBoard({ ...base, nebula: joined, resumed });
  const ids = m.repos.flatMap((r) => r.rows).map((r) => r.id);
  assert.ok(!ids.includes("nebula:m1"));
  const w1 = m.repos.flatMap((r) => r.rows).find((r) => r.id === "nebula:w1");
  assert.equal(w1.age, "running in nebula (forked)");
  const gone = buildBoard({ ...base, terminals: [], agents: [], nebula: joined, resumed });
  assert.ok(gone.repos.flatMap((r) => r.rows).some((r) => r.id === "nebula:m1"));
});

test("every view carries the rows: Tree, List, Columns status and Projects", () => {
  const m = buildBoard({ ...base, nebula: joined });
  const sessions = (items) => items.filter((i) => i.type === "session").map((i) => i.key);
  assert.ok(sessions(treeItems(m, new Set())).includes("nebula:o1"));
  assert.deepEqual(sessions(listItems({ repos: m.repos.filter((r) => r.root === "/w/app") })), ["t1", "nebula:m1", "nebula:w1"]);
  assert.ok(columnsModel(m).flatMap((c) => c.rows).some((r) => r.id === "nebula:l1"));
  const pc = projectColumns(m, { project: "/w/app", worktree: "/w/app-worktrees/fix" });
  assert.deepEqual(pc.sessions.map((r) => r.id), ["nebula:w1"]);
  assert.equal(pc.worktrees.length, 2);
});

test("nebula rows are not agents: not in the agent order, not an attention target", () => {
  const m = buildBoard({ ...base, nebula: joined });
  for (const view of ["tree", "list", "cards", "columns"]) assert.deepEqual(agentOrder(m, view, "/w/app").filter((id) => id.startsWith("nebula:")), []);
  assert.deepEqual(agentOrder(m, "columns", "/w/app", { mode: "projects", sel: { project: "/w/app" } }), ["t1"]);
  assert.equal(attentionTarget(m, null, 1), null);
});

test("resume plan: tab.new in the space showing that worktree, named after the session, argv from resumeArgv", () => {
  const s = joined.find((x) => x.id === "w1");
  const plan = planLaunch({
    checkouts: [...repos.flatMap((r) => r.checkouts), { path: s.worktree }], checkout: s.worktree,
    spaces: placedSpaces([{ id: "sp1", tabs: [{ id: "tab1" }] }, { id: "far", machine: "m", tabs: [] }], [{ tab: "tab1", cwd: "/w/app-worktrees/fix/src" }]),
    harness: "claude", model: s.model, effort: s.effort, argv: resumeArgv(s), name: s.name, from: "board",
  });
  const launch = plan.steps.find((x) => x.launch);
  assert.equal(launch.name, "tab.new");
  assert.deepEqual(launch.args, { space: "sp1", folder: "/w/app-worktrees/fix", argv: ["claude", "--resume", "conv-w1", "--fork-session", "--model", "opus"], name: "name w1" });
});

test("resume plan with no matching space starts a space whose first tab carries the name", () => {
  const s = joined.find((x) => x.id === "o1");
  const plan = planLaunch({
    checkouts: [{ path: s.worktree }], checkout: s.worktree, spaces: [], harness: "claude", argv: resumeArgv(s), name: s.name, from: "board",
  });
  const launch = plan.steps.find((x) => x.launch);
  assert.equal(launch.name, "space.new");
  assert.deepEqual(launch.args, { folder: "/elsewhere/x", argv: ["claude", "--resume", "conv-o1", "--model", "opus"], tab: "name o1" });
});

test("planLaunch without argv or name is unchanged", () => {
  const plan = planLaunch({ checkouts: [{ path: "/w/app" }], checkout: "/w/app", spaces: [], harness: "claude", task: "Fix", from: "board" });
  assert.deepEqual(plan.steps.find((x) => x.launch).args, { folder: "/w/app", argv: ["claude", "Fix"] });
});

test("setting nebulaSessions defaults on and only a boolean changes it", () => {
  assert.equal(DEFAULTS.nebulaSessions, true);
  assert.equal(mergeSettings({}).nebulaSessions, true);
  assert.equal(mergeSettings({ nebulaSessions: false }).nebulaSessions, false);
  assert.equal(mergeSettings({ nebulaSessions: "no" }).nebulaSessions, true);
});
