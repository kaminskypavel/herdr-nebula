import test from "node:test";
import assert from "node:assert/strict";
import {
  OTHER, buildBoard, treeItems, listItems, columnsModel, stopsOf, stepCursor, placeCursor, attentionTarget,
  agentOrder, projectColumns, projectItems, rollup, summaryParts, bandParts, parseWt, objectsOnly,
  bandSummary, bandPaths, foldBands,
} from "../mods/nebula/lib/viewmodel.js";
import { arrange, rowGroup } from "../mods/nebula/lib/arrange.js";

const NOW = 10_000_000;
// What a project tab shows: the model cut to that one project (lib/tabs.js scopeModel).
const alphaOnly = (m) => ({ ...m, repos: m.repos.filter((r) => r.root === "/r/alpha") });
const repos = ["alpha", "beta", "gamma", "delta"].map((n) => ({
  root: `/r/${n}`, name: n,
  checkouts: [{ path: `/r/${n}`, branch: "main" }, { path: `/r/${n}-worktrees/feat`, branch: "feat" }],
}));

// 15 sessions: statuses by index, repos round-robin over 4, alternating checkouts.
const STATUSES = [
  "blocked", "blocked",
  "working", "working", "working", "working",
  "done", "done",
  "idle", "idle", "idle", "idle", "idle", "idle", "idle",
];
function fleet(extra = {}) {
  const terminals = [], agents = [], tabs = [];
  STATUSES.forEach((status, i) => {
    const repo = repos[i % 4], wtree = i % 8 < 4 ? repo.root : `${repo.root}-worktrees/feat`;
    const address = `t${i + 1}`;
    terminals.push({ address, cwd: wtree, status, state: "live", app: "claude-code", program: { key: "claude", name: "Claude Code", shell: false }, labels: {} });
    agents.push({ address, pane: `p${i + 1}`, tab: `tab${i + 1}`, status });
    tabs.push({ id: `tab${i + 1}`, name: i % 2 ? `Session ${i + 1}` : "1", named: i % 2 === 1, settled: false, changed_at: NOW - 60_000 * (i + 1), working_since: status === "working" ? NOW - 120_000 : null });
  });
  return { terminals, agents, panes: [], spaces: [{ id: "sp", tabs }], repos, now: NOW, ...extra };
}

test("15 sessions across 4 repos: Tree and List on All have every repo, List on a project tab has that repo's bands alone", () => {
  const m = buildBoard(fleet());
  const tree = treeItems(m, new Set());
  assert.equal(tree.filter((i) => i.type === "repo").length, 4);
  assert.equal(tree.filter((i) => i.type === "session").length, 15);
  const all = listItems(m, { all: true });
  assert.deepEqual(all.filter((i) => i.type === "repo").map((i) => i.repo.name), ["alpha", "beta", "gamma", "delta"]);
  assert.equal(all.filter((i) => i.type === "session").length, 15);
  assert.deepEqual(listItems(m, { all: true, folded: new Set(["/r/beta"]) }).filter((i) => i.type === "repo").map((i) => i.folded), [false, true, false, false]);
  const list = listItems({ repos: [m.repos[0]] });
  assert.ok(!list.some((i) => ["summary", "divider", "repo"].includes(i.type)));
  const mine = list.filter((i) => i.type === "session");
  assert.ok(mine.length > 0 && mine.every((i) => i.row.address && m.repos[0].bands.some((b) => b.rows.includes(i.row))));
  assert.ok(list.filter((i) => i.type === "band").length >= 1);
  assert.deepEqual(listItems({ repos: [] }, { empty: "No matches" }), [{ key: "empty", type: "empty", text: "No matches" }]);
  assert.equal(listItems({ repos: [{ ...m.repos[0], rows: [], bands: [] }] })[0].text, "No sessions");
});

test("a folded repo in Tree keeps its header and hides its bands and sessions", () => {
  const m = buildBoard(fleet());
  const tree = treeItems(m, new Set(["/r/beta"]));
  assert.equal(tree.filter((i) => i.type === "repo").length, 4);
  const beta = m.repos.find((r) => r.name === "beta");
  for (const row of beta.bands.flatMap((b) => b.rows)) assert.ok(!tree.some((i) => i.key === row.id));
});

test("a repo with no sessions still shows in Tree", () => {
  const m = buildBoard({ ...fleet(), repos: [...repos, { root: "/r/empty", name: "empty", checkouts: [{ path: "/r/empty", branch: "main" }] }] });
  assert.ok(treeItems(m, new Set()).some((i) => i.type === "repo" && i.repo.name === "empty"));
});

test("Columns groups the same 15 sessions as 2 needs you, 4 working, 2 unseen, 7 seen", () => {
  const cols = columnsModel(buildBoard(fleet()));
  assert.deepEqual(cols.map((c) => [c.status, c.rows.length]), [["needs", 2], ["working", 4], ["unseen", 2], ["seen", 7]]);
});

test("a row's title is its tab's name when named, else New session; the terminal title is never used", () => {
  const f = fleet();
  f.terminals[0].title = "Claude Code";
  const rows = buildBoard(f).repos.flatMap((r) => r.bands.flatMap((b) => b.rows));
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId.t1.title, "New session");
  assert.equal(byId.t2.title, "Session 2");
});

test("a row carries program, age, model and the last prompt", () => {
  const f = fleet();
  f.terminals[2].labels = { "nebula.board": "1", "nebula.launch": JSON.stringify({ harness: "claude", model: "opus" }), "nebula.prompt": "fix the login redirect" };
  const row = buildBoard(f).repos.flatMap((r) => r.bands.flatMap((b) => b.rows)).find((r) => r.id === "t3");
  assert.equal(row.program, "claude");
  assert.equal(row.model, "opus");
  assert.equal(row.prompt, "fix the login redirect");
  assert.equal(row.status, "working");
  assert.equal(row.age, "2m");
  assert.equal(row.pane, "p3");
});

test("an archived session is hidden until show archived is on", () => {
  const f = fleet();
  f.spaces[0].tabs[4].settled = true;
  const ids = (m) => m.repos.flatMap((r) => r.bands.flatMap((b) => b.rows)).map((r) => r.id);
  assert.ok(!ids(buildBoard(f)).includes("t5"));
  assert.equal(ids(buildBoard(f)).length, 14);
  const shown = buildBoard({ ...f, showArchived: true });
  assert.ok(ids(shown).includes("t5"));
  assert.equal(shown.repos.flatMap((r) => r.bands.flatMap((b) => b.rows)).find((r) => r.id === "t5").archived, true);
});

test("an exited board-launched session yields a grey row offering relaunch and delete", () => {
  const f = fleet();
  f.terminals.push({ address: "t99", cwd: "/r/alpha", status: undefined, state: "live", program: { key: "shell", name: "zsh", shell: true }, labels: { "nebula.board": "1" } });
  const row = buildBoard(f).repos[0].bands.flatMap((b) => b.rows).find((r) => r.id === "t99");
  assert.equal(row.status, "exited");
  assert.equal(row.age, "exited");
  assert.deepEqual(row.offers, ["relaunch", "delete"]);
  assert.deepEqual(buildBoard(f).repos[0].bands.flatMap((b) => b.rows).find((r) => r.id === "t1").offers, []);
  const cols = columnsModel(buildBoard(f));
  assert.ok(cols[3].rows.some((r) => r.id === "t99"));
});

test("sessions outside every repo land in an Other group, shown by Tree and by List on All", () => {
  const f = fleet();
  f.terminals.push({ address: "t98", cwd: "/Users/x/Desktop", status: "working", state: "live", program: { key: "claude", name: "Claude Code" }, labels: {} });
  const m = buildBoard(f);
  const other = m.repos.find((r) => r.root === OTHER);
  assert.equal(other.rows.length, 1);
  const all = listItems(m, { all: true });
  assert.equal(all.filter((i) => i.type === "repo").at(-1).repo.root, OTHER);
  assert.ok(all.some((i) => i.key === "t98"));
});

test("the cursor stays on a session when its status change moves the row", () => {
  const f = fleet();
  const before = stopsOf(treeItems(buildBoard(f), new Set()));
  const i = before.indexOf("t9");
  // t9 (idle) starts needing you: it moves above t1 (working) in alpha's main band, the cursor follows the address
  f.terminals[8].status = "blocked";
  f.agents[8].status = "blocked";
  f.terminals[0].status = "working";
  f.agents[0].status = "working";
  const after = stopsOf(treeItems(buildBoard(f), new Set()));
  assert.ok(after.indexOf("t9") < after.indexOf("t1"));
  assert.equal(placeCursor(after, "t9", i).id, "t9");
  const cols = stopsOf(columnsModel(buildBoard(f)).flatMap((c) => c.rows).map((r) => ({ type: "session", key: r.id })));
  assert.equal(placeCursor(cols, "t9", i).id, "t9");
});

test("the cursor follows the address, not the index, when rows above it appear", () => {
  const f = fleet();
  const stops = stopsOf(treeItems(buildBoard(f), new Set()));
  const idx = stops.indexOf("t7");
  const added = ["x", ...stops];
  assert.equal(placeCursor(added, "t7", idx).id, "t7");
  assert.equal(placeCursor(added, "t7", idx).index, idx + 1);
});

test("when the cursor's session goes away it lands on the row now at that place, or the last one", () => {
  assert.equal(placeCursor(["a", "b", "c"], "gone", 1).id, "b");
  assert.equal(placeCursor(["a", "b", "c"], "gone", 9).id, "c");
  assert.equal(placeCursor([], "gone", 0).id, null);
  assert.equal(placeCursor(["a", "b"], null, 0).id, "a");
});

test("j and k step the highlight and stop at the ends", () => {
  const stops = ["a", "b", "c"];
  assert.equal(stepCursor(stops, "a", 1), "b");
  assert.equal(stepCursor(stops, "c", 1), "c");
  assert.equal(stepCursor(stops, "a", -1), "a");
  assert.equal(stepCursor(stops, null, 1), "a");
  assert.equal(stepCursor([], null, 1), null);
});

test("period from the top lands on the first blocked session, then the next, then the first unseen one", () => {
  const f = fleet();
  const rowsOf = (m) => m.repos.flatMap((r) => r.rows);
  const status = (m, id) => rowsOf(m).find((r) => r.id === id).status;
  let m = buildBoard(f);
  const first = attentionTarget(m, null, 1);
  assert.equal(status(m, first), "needs");
  // two sessions need you: the walk goes to the other one
  const second = attentionTarget(m, first, 1);
  assert.equal(status(m, second), "needs");
  assert.notEqual(first, second);
  assert.equal(attentionTarget(m, second, -1), first);
  // once the blocked ones are answered, the walk reaches the first unseen one
  for (const t of f.terminals) if (t.status === "blocked") t.status = "working";
  m = buildBoard(f);
  const unseen = attentionTarget(m, second, 1);
  assert.equal(status(m, unseen), "unseen");
  assert.equal(unseen, rowsOf(m).find((r) => r.status === "unseen").id);
});

test("period does nothing when no session needs you or is unseen", () => {
  const f = fleet();
  f.terminals.forEach((t) => { t.status = "working"; });
  assert.equal(attentionTarget(buildBoard(f), "t1", 1), null);
});

test("a session with two running sub-agents shows both nested under it with their descriptions", () => {
  const f = fleet();
  const sub = (id, d, m) => ({ [`nebula.sub.${id}`]: JSON.stringify({ type: "Explore", at: NOW - 90_000, desc: d, model: m }) });
  f.terminals[2].labels = { ...sub("a1", "Find the login handlers", "haiku"), ...sub("a2", "Read the auth tests", "") };
  const row = buildBoard(f).repos.flatMap((r) => r.bands.flatMap((b) => b.rows)).find((r) => r.id === "t3");
  assert.deepEqual(row.subs.map((s) => [s.text, s.badge]), [["Find the login handlers", "haiku"], ["Read the auth tests", ""]]);
  const items = treeItems(buildBoard(f), new Set());
  const at = items.findIndex((i) => i.key === "t3");
  assert.deepEqual(items.slice(at + 1, at + 3).map((i) => i.type), ["sub", "sub"]);
  assert.ok(!stopsOf(items).some((k) => k.startsWith("sub:")));
});

test("a terminal sub-agent nests under its parent with its own name", () => {
  const f = fleet();
  f.terminals.push({ address: "t50", parent: "t3", cwd: "/r/alpha", status: "working", state: "live", name: "lint pass", labels: {} });
  const row = buildBoard(f).repos.flatMap((r) => r.bands.flatMap((b) => b.rows)).find((r) => r.id === "t3");
  assert.deepEqual(row.subs.map((s) => [s.text, s.status]), [["lint pass", "working"]]);
});

test("Tree, List and Cards agent order follows the model; Columns go by status", () => {
  const m = buildBoard(fleet());
  const ids = (r) => r.rows.map((x) => x.id);
  assert.equal(agentOrder(m, "tree", "/r/beta").length, 15);
  assert.deepEqual(agentOrder(m, "list", "/r/beta"), agentOrder(m, "tree", "/r/beta"));
  assert.equal(new Set(agentOrder(m, "cards", "/r/beta")).size, 15);
  assert.deepEqual(agentOrder({ repos: [m.repos[1]] }, "list", "/r/beta"), ids(m.repos[1]));
  const cols = agentOrder(m, "columns", "/r/beta");
  assert.deepEqual(cols.slice(0, 2).map((id) => m.repos.flatMap((r) => r.rows).find((r) => r.id === id).status), ["needs", "needs"]);
});

test("a repo's summary lists non-zero counts in status order", () => {
  const m = buildBoard(fleet());
  const parts = summaryParts(m.repos[0]);
  assert.ok(parts.every((p) => p.n > 0));
  assert.deepEqual(parts.map((p) => p.status), ["needs", "working", "unseen", "seen"].filter((s) => parts.some((p) => p.status === s)));
  assert.equal(parts.reduce((n, p) => n + p.n, 0), m.repos[0].rows.length);
});

test("wt list json gives each checkout's ahead count and line changes", () => {
  const text = JSON.stringify({ items: [
    { branch: "main", worktree: { path: "/r/alpha", changes: { diff: { added: 5, deleted: 1 } } } },
    { branch: "feat", worktree: { path: "/r/alpha-worktrees/feat", changes: { diff: { added: 48, deleted: 6 } } }, upstream: { ahead: 2 } },
    { branch: "no-worktree" },
  ] });
  const wt = parseWt(text);
  assert.deepEqual(wt["/r/alpha-worktrees/feat"], { branch: "feat", ahead: 2, added: 48, deleted: 6 });
  assert.deepEqual(wt["/r/alpha"], { branch: "main", ahead: 0, added: 5, deleted: 1 });
  assert.deepEqual(parseWt("not json"), {});
  assert.deepEqual(parseWt(""), {});
});

test("a band carries its wt counts and shows them as parts", () => {
  const wt = { "/r/alpha-worktrees/feat": { branch: "feat", ahead: 2, added: 48, deleted: 6 } };
  const m = buildBoard({ ...fleet(), wt });
  const band = m.repos[0].bands.find((b) => b.path === "/r/alpha-worktrees/feat");
  assert.equal(band.label, "feat");
  assert.deepEqual(bandParts(band), ["↑2", "+48", "−6"]);
  assert.deepEqual(bandParts({ ahead: 0, added: 0, deleted: 0 }), []);
  assert.deepEqual(bandParts({ ahead: 0, added: 3, deleted: 0 }), ["+3"]);
});

test("bands without sessions are left out", () => {
  const f = fleet();
  const m = buildBoard({ ...f, terminals: f.terminals.filter((t) => t.address === "t1") });
  assert.equal(m.repos[0].bands.length, 1);
});

test("a change batch entirely under the git objects folder is skipped", () => {
  const dir = "/r/alpha/.git";
  assert.equal(objectsOnly([`${dir}/objects/pack/pack-1.pack`, `${dir}/objects/ab/cdef`], dir), true);
  assert.equal(objectsOnly([`${dir}/objects/pack/pack-1.pack`, `${dir}/index`], dir), false);
  assert.equal(objectsOnly([`${dir}/HEAD`], dir), false);
  assert.equal(objectsOnly([`${dir}/objects`], dir), true);
  assert.equal(objectsOnly([`${dir}/objects-old/x`], dir), false);
  assert.equal(objectsOnly([], dir), false);
});

test("projectColumns rolls each project and worktree up to its most urgent status", () => {
  const f = fleet();
  const pc = projectColumns(buildBoard(f), {}, "/r/alpha");
  // alpha holds t1 (blocked), t5, t9, t13 (working, idle, idle) in main; the rest in feat
  assert.deepEqual(pc.projects.map((p) => p.name), ["alpha", "beta", "gamma", "delta"]);
  assert.equal(pc.projects[0].status, "needs");
  assert.equal(pc.projects[1].status, "needs");
  assert.equal(pc.projects[3].status, "working");
  assert.equal(pc.projects.reduce((n, p) => n + p.count, 0), 15);
  assert.ok(pc.worktrees.every((w) => w.status === rollup(pc.sessions.length ? buildBoard(f).repos[0].bands.find((b) => b.path === w.key).rows : [])));
  assert.equal(rollup([{ status: "exited" }, { status: "seen" }]), "seen");
  assert.equal(rollup([{ status: "exited" }]), "exited");
  assert.equal(rollup([]), "exited");
});

test("projectColumns defaults to the rail repo, else the first project with sessions, and the first worktree", () => {
  const m = buildBoard({ ...fleet(), repos: [{ root: "/r/empty", name: "empty", checkouts: [{ path: "/r/empty", branch: "main" }] }, ...repos] });
  const pc = projectColumns(m, {}, null);
  assert.equal(pc.sel.project, "/r/alpha");
  assert.equal(projectColumns(m, {}, "/r/gamma").sel.project, "/r/gamma");
  assert.equal(projectColumns(m, {}, "/r/empty").sel.project, "/r/alpha");
  assert.equal(pc.sel.worktree, m.repos.find((r) => r.root === "/r/alpha").bands[0].path);
  assert.deepEqual(pc.sessions, m.repos.find((r) => r.root === "/r/alpha").bands[0].rows);
  assert.equal(projectColumns(m, { project: "/r/beta" }, "/r/gamma").sel.project, "/r/beta");
  assert.equal(projectColumns({ repos: [] }).sel.project, null);
});

test("projectColumns falls back to the first worktree when the selected one disappears", () => {
  const f = fleet();
  const m = buildBoard(f);
  const alpha = m.repos[0];
  const second = alpha.bands[1].path;
  assert.equal(projectColumns(m, { project: alpha.root, worktree: second }).sel.worktree, second);
  assert.deepEqual(projectColumns(m, { project: alpha.root, worktree: second }).sessions, alpha.bands[1].rows);
  const gone = buildBoard({ ...f, terminals: f.terminals.filter((t) => t.cwd !== second) });
  const pc = projectColumns(gone, { project: alpha.root, worktree: second }, alpha.root);
  assert.equal(pc.sel.worktree, gone.repos[0].bands[0].path);
  assert.equal(pc.worktrees.length, 1);
  // a project that disappears falls back too
  assert.equal(projectColumns(gone, { project: "/r/nope", worktree: "x" }, "/r/beta").sel.project, "/r/beta");
});

test("Other is the last project and holds its sessions as one worktree", () => {
  const f = fleet();
  f.terminals.push({ address: "t98", cwd: "/Users/x/Desktop", status: "working", state: "live", program: { key: "claude", name: "Claude Code" }, labels: {} });
  const m = buildBoard(f);
  const pc = projectColumns(m, { project: OTHER });
  assert.equal(pc.projects.at(-1).key, OTHER);
  assert.equal(pc.projects.at(-1).name, "Other");
  assert.equal(pc.projects.at(-1).status, "working");
  assert.deepEqual(pc.sessions.map((r) => r.id), ["t98"]);
  assert.equal(pc.worktrees.length, 1);
  assert.equal(pc.worktrees[0].label, "Other");
  assert.equal(projectColumns(buildBoard(fleet())).projects.some((p) => p.key === OTHER), false);
});

test("projectItems keys the three columns and stopsOf reaches every one", () => {
  const m = buildBoard(fleet());
  const pc = projectColumns(m, {}, "/r/alpha");
  const items = projectItems(pc);
  assert.deepEqual(items.map((i) => i.type).filter((t, i, a) => a.indexOf(t) === i), ["project", "worktree", "session"]);
  assert.ok(items.some((i) => i.key === "proj:/r/alpha") && items.some((i) => i.key === `wt:${pc.sel.worktree}`));
  assert.equal(stopsOf(items).length, items.length);
});

test("Projects mode puts the selected project's sessions first, in worktree order", () => {
  const m = buildBoard(fleet());
  const beta = m.repos[1];
  const order = agentOrder(m, "columns", "/r/alpha", { mode: "projects", sel: { project: beta.root } });
  assert.deepEqual(order.slice(0, beta.rows.length), beta.rows.map((r) => r.id));
  assert.equal(new Set(order).size, 15);
  assert.equal(agentOrder(m, "columns", "/r/alpha", { mode: "projects" }).slice(0, m.repos[0].rows.length).join(), m.repos[0].rows.map((r) => r.id).join());
});

// Sorting by status: needs you, working, unseen, seen, then grey (exited and nebula rows) last.
function mixed() {
  const mk = (address, status, shell) => ({ address, cwd: "/r/alpha", status, state: "live", app: "claude-code", program: { key: shell ? "shell" : "claude", name: shell ? "zsh" : "Claude Code", shell: Boolean(shell) }, labels: shell ? { "nebula.board": "1" } : {} });
  const terminals = [mk("e1", undefined, true), mk("s1", "idle"), mk("w1", "working"), mk("s2", "idle"), mk("u1", "done"), mk("n1", "blocked"), mk("w2", "working"), mk("e2", undefined, true)];
  return { terminals, agents: [], panes: [], spaces: [], repos, now: NOW };
}
const ids = (rows) => rows.map((r) => r.id);

test("every band lists needs you, working, unseen, seen, then grey rows, in today's order within a status", () => {
  const m = buildBoard(mixed());
  assert.deepEqual(ids(m.repos[0].bands[0].rows), ["n1", "w1", "w2", "u1", "s1", "s2", "e1", "e2"]);
  assert.deepEqual(ids(m.repos[0].rows), ids(m.repos[0].bands[0].rows));
  assert.deepEqual(ids(treeItems(m, new Set()).filter((i) => i.type === "session").map((i) => i.row)), ids(m.repos[0].rows));
  assert.deepEqual(ids(listItems(alphaOnly(m)).filter((i) => i.type === "session").map((i) => i.row)), ids(m.repos[0].rows));
});

test("nebula rows and the Other group sort grey last too", () => {
  const f = { ...mixed(), nebula: [{ id: "x", name: "old", summary: "old", worktree: "/r/alpha", status: "idle", alive: false }] };
  f.terminals.push({ address: "o1", cwd: "/Users/x", status: "idle", state: "live", program: { key: "claude", name: "Claude Code" }, labels: {} },
    { address: "o2", cwd: "/Users/x", status: "blocked", state: "live", program: { key: "claude", name: "Claude Code" }, labels: {} });
  const m = buildBoard(f);
  assert.deepEqual(ids(m.repos[0].rows).slice(-3), ["e1", "e2", "nebula:x"]);
  assert.deepEqual(ids(m.repos.find((r) => r.root === OTHER).rows), ["o2", "o1"]);
});

test("Columns Status keeps grey rows last inside the Seen column", () => {
  const cols = columnsModel(buildBoard(mixed()));
  assert.deepEqual(ids(cols[3].rows), ["s1", "s2", "e1", "e2"]);
});

test("Columns Projects orders projects and worktrees by urgency, all-grey last, and the sessions by status", () => {
  const f = mixed();
  // beta: one idle session; gamma: only an exited one; delta: a working one, in feat
  const add = (address, root, status, shell) => f.terminals.push({ address, cwd: root, status, state: "live", program: { key: shell ? "shell" : "claude", name: "x", shell: Boolean(shell) }, labels: shell ? { "nebula.board": "1" } : {} });
  add("b1", "/r/beta", "idle");
  add("g1", "/r/gamma", undefined, true);
  add("d1", "/r/delta-worktrees/feat", "working");
  add("a-feat", "/r/alpha-worktrees/feat", undefined, true);
  const m = buildBoard(f);
  const pc = projectColumns(m, { project: "/r/alpha" });
  assert.deepEqual(pc.projects.map((p) => p.key), ["/r/alpha", "/r/delta", "/r/beta", "/r/gamma"]);
  assert.deepEqual(pc.worktrees.map((w) => w.key), ["/r/alpha", "/r/alpha-worktrees/feat"]);
  assert.deepEqual(ids(pc.sessions), ["n1", "w1", "w2", "u1", "s1", "s2", "e1", "e2"]);
  // no project in the column is reordered when nothing changes: equal rank keeps the tree order
  assert.deepEqual(projectColumns(buildBoard({ ...f, terminals: f.terminals.filter((t) => ["b1", "g1"].includes(t.address) === false) }), {}).projects.map((p) => p.key).slice(0, 2), ["/r/alpha", "/r/delta"]);
});

test("the attention walk still goes needs you first, then unseen, after the sort", () => {
  const m = buildBoard(mixed());
  assert.equal(attentionTarget(m, null, 1), "n1");
  assert.equal(attentionTarget(m, "n1", 1), "u1");
  assert.equal(attentionTarget(m, "u1", 1), "n1");
  assert.equal(attentionTarget(m, "n1", -1), "u1");
});

test("a folded band keeps its header and hides its sessions, in Tree and List", () => {
  const m = buildBoard(fleet());
  const alpha = m.repos.find((r) => r.name === "alpha");
  const band = alpha.bands[0];
  const folded = new Set([band.path]);
  for (const items of [treeItems(m, new Set(), undefined, folded), listItems(alphaOnly(m), { bands: folded })]) {
    const head = items.find((i) => i.key === `band:${band.path}`);
    assert.equal(head.folded, true);
    for (const row of band.rows) assert.ok(!items.some((i) => i.key === row.id));
    for (const row of alpha.bands[1].rows) assert.ok(items.some((i) => i.key === row.id));
    assert.equal(items.find((i) => i.key === `band:${alpha.bands[1].path}`).folded, false);
  }
  assert.ok(!stopsOf(listItems(alphaOnly(m), { bands: folded })).includes(band.rows[0].id));
});

test("a folded band header still counts its sessions by status", () => {
  const m = buildBoard(fleet());
  const band = m.repos[0].bands[0];
  const parts = bandSummary(band);
  assert.equal(parts.reduce((n, p) => n + p.n, 0), band.rows.length);
  assert.ok(parts.every((p) => p.n > 0 && p.label));
});

test("with no folded bands every session shows, folded bands only fold (Other has no header to fold)", () => {
  const m = buildBoard(fleet());
  assert.equal(treeItems(m, new Set(), undefined, new Set()).filter((i) => i.type === "session").length, 15);
  const none = buildBoard({ ...fleet(), terminals: [{ address: "x", cwd: "/elsewhere", status: "idle", state: "live", labels: {} }], agents: [], spaces: [], repos });
  const other = none.repos.find((r) => r.root === OTHER);
  assert.deepEqual(bandPaths(other), []);
  assert.ok(treeItems(none, new Set(), undefined, new Set([""])).some((i) => i.key === "x"));
});

test("Collapse all / Expand all helpers fold every band of the given repos and leave other paths alone", () => {
  const m = buildBoard(fleet());
  const alpha = m.repos.find((r) => r.name === "alpha");
  const paths = bandPaths(alpha);
  assert.equal(paths.length, alpha.bands.length);
  const all = foldBands(new Set(["/keep"]), [alpha], true);
  assert.deepEqual([...all].sort(), [...paths, "/keep"].sort());
  assert.deepEqual([...foldBands(all, [alpha], false)], ["/keep"]);
  const every = foldBands(new Set(), m.repos, true);
  assert.equal(every.size, m.repos.flatMap(bandPaths).length);
  assert.equal(foldBands(every, m.repos, false).size, 0);
});

test("a filter ignores folded bands when the view passes no folds (views do this, so matches stay visible)", () => {
  const m = buildBoard(fleet());
  const band = m.repos.find((r) => r.name === "alpha").bands[0];
  const items = listItems(alphaOnly(m), { bands: new Set() });
  assert.ok(band.rows.every((row) => items.some((i) => i.key === row.id)));
});

// Archived rows: after the live rows, before nebula's, each group in status order; a shelf line above the first.
function archivedFleet(extra = {}) {
  const f = fleet();
  const tabs = f.spaces[0].tabs;
  // alpha main band holds t1 (blocked, archived) and t9 (idle)
  for (const id of ["tab1"]) tabs.find((t) => t.id === id).settled = true;
  return { ...f, showArchived: true, ...extra };
}

test("archived rows sort after live rows in their band, keep status order, and read 'archived'", () => {
  const m = buildBoard(archivedFleet());
  const band = m.repos.find((r) => r.name === "alpha").bands.find((b) => b.rows.some((r) => r.archived));
  const flags = band.rows.map((r) => r.archived);
  assert.deepEqual(flags, [...flags].sort((a, b) => Number(a) - Number(b)));
  assert.ok(flags.includes(true) && flags.includes(false));
  assert.ok(band.rows.filter((r) => r.archived).every((r) => r.age === "archived"));
  const arch = band.rows.filter((r) => r.archived).map((r) => r.status);
  assert.deepEqual(arch, [...arch].sort((a, b) => ["needs", "working", "unseen", "seen"].indexOf(a) - ["needs", "working", "unseen", "seen"].indexOf(b)));
});

test("a shelf line sits above the first archived row of a band, and only there", () => {
  const m = buildBoard(archivedFleet());
  const items = listItems(alphaOnly(m));
  const shelves = items.filter((i) => i.type === "shelf");
  assert.ok(shelves.length >= 1);
  for (const sh of shelves) {
    const at = items.indexOf(sh);
    assert.equal(items[at + 1].type, "session");
    assert.equal(items[at + 1].row.archived, true);
    assert.ok(!items[at - 1]?.row?.archived);
  }
  assert.equal(shelves.length, new Set(shelves.map((s) => s.key)).size);
  const none = listItems(alphaOnly(buildBoard(fleet())));
  assert.ok(!none.some((i) => i.type === "shelf"));
  assert.ok(!stopsOf(items).includes(shelves[0].key));
});

test("nebula rows stay after the archived rows, and a folded band hides its shelf", () => {
  const f = archivedFleet();
  const m0 = buildBoard(f);
  const band0 = m0.repos.find((r) => r.name === "alpha").bands.find((b) => b.rows.some((r) => r.archived));
  const nebula = [{ id: "n1", name: "Neb", worktree: band0.path, status: "idle", alive: false, summary: "Neb", model: "", effort: "" }];
  const m = buildBoard({ ...f, nebula });
  const band = m.repos.find((r) => r.name === "alpha").bands.find((b) => b.path === band0.path);
  assert.equal(band.rows.at(-1).kind, "nebula");
  assert.ok(band.rows.at(-2).archived);
  const items = listItems(alphaOnly(m), { bands: new Set([band.path]) });
  assert.ok(!items.some((i) => i.key === `archived:${band.path}`));
});

test("Name sort keeps alphabetical order inside each group: live, archived, nebula", () => {
  const f = archivedFleet();
  const m = arrange(buildBoard(f), { sort: "name" });
  for (const b of m.repos.flatMap((r) => r.bands)) {
    const g = b.rows.map(rowGroup);
    assert.deepEqual(g, [...g].sort((x, y) => x - y));
    for (const n of [0, 1, 2]) {
      const titles = b.rows.filter((r) => rowGroup(r) === n).map((r) => r.title.toLowerCase());
      assert.deepEqual(titles, [...titles].sort());
    }
  }
});
