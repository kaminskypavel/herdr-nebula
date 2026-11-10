// The jump palette's list. Mirrors nebula's palette tests (crates/nebula-tui/src/palette.rs): the same
// tree of sessions, the same orders.
import test from "node:test";
import assert from "node:assert/strict";
import { jumpRows, rankJump, attentionRank, windowTop, jumpSize, JUMP_ROWS } from "../mods/nebula/lib/jump.js";
import { buildBoard, OTHER } from "../mods/nebula/lib/viewmodel.js";

const NOW = 1_000_000;
const row = (id, status, changedAt, extra = {}) => ({ id, address: id, title: id, status, changedAt, age: "", archived: false, ...extra });
// demo/main: ask (needs), run (working), fresh (never run); demo/feat: read (seen, newer), unread (unseen); quiet has none.
const tree = () => ({
  repos: [
    {
      root: "/p/demo",
      name: "demo",
      bands: [
        { path: "/p/demo", label: "main", rows: [row("fresh", "seen", 0), row("ask", "needs", 10), row("run", "working", 20)] },
        { path: "/p/demo-worktrees/feat", label: "feat", rows: [row("read", "seen", 1000), row("unread", "unseen", 500)] },
      ],
    },
    { root: "/p/quiet", name: "quiet", bands: [{ path: "/p/quiet", label: "main", rows: [] }] },
  ],
});
const titles = (model, query = "") => rankJump(jumpRows(model, NOW), query).map((x) => x.label);

test("with no text it lists the sessions flat in attention order: needs you, working, unseen, then recency", () => {
  assert.deepEqual(titles(tree()), ["demo / ask", "demo / run", "demo / unread", "demo / read", "demo / fresh"]);
});

test("with nothing waiting the most recent session leads", () => {
  const m = tree();
  m.repos[0].bands = [{ path: "/p/demo", label: "main", rows: [row("read", "seen", 1000), row("fresh", "seen", 0), row("older", "seen", 20)] }];
  assert.deepEqual(titles(m), ["demo / read", "demo / older", "demo / fresh"]);
});

test("a working session counts as just touched, whatever its change time", () => {
  const m = tree();
  m.repos[0].bands = [{ path: "/p/demo", label: "main", rows: [row("old-run", "working", 1), row("new-run", "working", 999_999)] }];
  const items = jumpRows(m, NOW);
  assert.ok(items.every((x) => x.touched === NOW));
  assert.deepEqual(titles(m), ["demo / old-run", "demo / new-run"], "equal stamps keep build order");
});

test("a query ranks score first and attention on ties", () => {
  // every demo row scores the same boundary run, so attention decides
  assert.deepEqual(titles(tree(), "demo").slice(0, 3), ["demo / ask", "demo / run", "demo / unread"]);
  // a better match still beats a better tier: `read` starts a segment in feat/read, sits mid-word in feat/unread
  assert.deepEqual(titles(tree(), "read"), ["demo / read", "demo / unread"]);
});

test("a query reaches a session by its branch, which is searched but not drawn", () => {
  assert.deepEqual(titles(tree(), "feat"), ["demo / unread", "demo / read"]);
  assert.deepEqual(titles(tree(), "demo feat read"), ["demo / read", "demo / unread"]);
});

test("every visible row of a query is a hit with positions", () => {
  const hits = rankJump(jumpRows(tree(), NOW), "read");
  assert.equal(hits.length, 2);
  assert.ok(hits.every((h) => h.positions.length > 0));
});

test("archived sessions and nebula's own rows are never rows", () => {
  const m = tree();
  m.repos[0].bands[0].rows.push(row("gone", "needs", 9000, { archived: true }), row("nb", "seen", 9000, { kind: "nebula" }));
  assert.ok(!titles(m).some((t) => t.includes("gone") || t.includes("nb")));
  assert.deepEqual(titles(m, "gone"), []);
});

test("a closed project is as findable as an open one: the list is the whole model", () => {
  const m = tree();
  m.repos.push({ root: "/p/closed", name: "closed", bands: [{ path: "/p/closed", label: "main", rows: [row("deploy", "needs", 5)] }] });
  assert.deepEqual(titles(m).slice(0, 2), ["demo / ask", "closed / deploy"], "both need you, the more recent first");
  assert.equal(titles(m, "closed dep")[0], "closed / deploy");
});

test("strays are listed under Other", () => {
  const m = tree();
  m.repos.push({ root: OTHER, name: "Other", bands: [{ path: "", label: "", rows: [row("lone", "seen", 3)] }] });
  const hit = jumpRows(m, NOW).find((x) => x.id === "lone");
  assert.equal(hit.label, "Other / lone");
  assert.equal(hit.text, "Other/lone");
  assert.equal(hit.other, true);
});

test("rows of a real board model carry the status, age and title the palette draws", () => {
  const model = buildBoard({
    terminals: [
      {
        address: "t1",
        status: "blocked",
        cwd: "/p/demo",
        state: "live",
        app: "claude-code",
        program: { key: "claude", name: "Claude Code", shell: false },
        labels: {},
      },
    ],
    agents: [{ address: "t1", status: "blocked", tab: "tab1", pane: "p1" }],
    panes: [{ pane: "p1", tab: "tab1", terminal: "t1", cwd: "/p/demo" }],
    spaces: [{ id: "s1", tabs: [{ id: "tab1", named: true, name: "fix login", changed_at: 5, settled: false }] }],
    repos: [{ root: "/p/demo", name: "demo", checkouts: [{ path: "/p/demo", branch: "main" }] }],
    now: 100,
  });
  const [hit] = jumpRows(model, 100);
  assert.equal(hit.id, "t1");
  assert.equal(hit.label, "demo / fix login");
  assert.equal(hit.status, "needs");
});

test("attentionRank sorts by tier, recency, build order", () => {
  const items = [
    { tier: 3, touched: 5 },
    { tier: 0, touched: 1 },
    { tier: 3, touched: 9 },
    { tier: 0, touched: 1 },
  ];
  assert.deepEqual(attentionRank(items), [3, 0, 2, 1]);
});

test("the window of rows follows the selection", () => {
  assert.equal(windowTop(0, 3), 0);
  assert.equal(windowTop(0, JUMP_ROWS), 1);
  assert.equal(windowTop(5, 2), 2);
  assert.equal(windowTop(5, 7), 5);
});

test("the palette's size is a number of whole pixels", () => {
  const { width, height } = jumpSize();
  assert.ok(width > 0 && Number.isInteger(height));
});
