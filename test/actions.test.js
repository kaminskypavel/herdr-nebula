import test from "node:test";
import assert from "node:assert/strict";
import {
  actionsFor,
  whereIs,
  rowAction,
  isLinked,
  worktreeOffer,
  bandOffer,
  parseLines,
  removeLabel,
  planRemove,
  summarizeCheck,
  settleRemove,
  forceCount,
  recheckRemove,
  planDelete,
  aloneInTab,
  editorCommand,
  tabCommand,
} from "../mods/nebula/lib/actions.js";
import { buildBoard } from "../mods/nebula/lib/viewmodel.js";

const repos = [
  {
    root: "/w/checkout-flow",
    name: "checkout-flow",
    checkouts: [
      { path: "/w/checkout-flow", branch: "main" },
      { path: "/w/checkout-flow-worktrees/fix-x", branch: "fix-x" },
    ],
  },
];
const claude = { key: "claude", name: "Claude Code", shell: false };
const term = (address, cwd, status = "working") => ({ address, cwd, status, state: "live", app: "claude-code", program: claude, labels: {} });
const tab = (id, settled = false) => ({ id, name: id, named: true, settled, changed_at: 1000, working_since: null });
// terminals t1..: [address, cwd, settled]
function model(rows, showArchived = true) {
  const terminals = rows.map(([a, cwd, , status]) => term(a, cwd, status));
  const tabs = rows.map(([a, , settled]) => tab(`tab-${a}`, settled));
  const agents = rows.map(([a, , , status]) => ({ address: a, pane: `p-${a}`, tab: `tab-${a}`, status: status ?? "working" }));
  return buildBoard({ terminals, agents, panes: [], spaces: [{ id: "s", tabs }], repos, now: 5000, showArchived });
}
const WT = "/w/checkout-flow-worktrees/fix-x";

test("only a checkout under <repo>-worktrees is linked", () => {
  assert.equal(isLinked("/w/checkout-flow", WT), true);
  assert.equal(isLinked("/w/checkout-flow", "/w/checkout-flow"), false);
  assert.equal(isLinked("/w/checkout-flow", "/w/checkout-flow-worktrees"), false);
  assert.equal(isLinked("/w/checkout-flow", "/w/other-worktrees/fix-x"), false);
});

test("deleting one of two sessions in a worktree offers no removal", () => {
  const m = model([
    ["t1", WT],
    ["t2", WT],
  ]);
  assert.equal(worktreeOffer(m, "t1"), null);
});

test("deleting the last session in a linked worktree offers it, with root, path and branch", () => {
  const m = model([
    ["t1", WT],
    ["t2", "/w/checkout-flow"],
  ]);
  assert.deepEqual(worktreeOffer(m, "t1"), { root: "/w/checkout-flow", path: WT, branch: "fix-x" });
});

test("the main checkout never offers removal, even for its last session", () => {
  const m = model([["t1", "/w/checkout-flow"]]);
  assert.equal(worktreeOffer(m, "t1"), null);
});

test("an archived session in the worktree means the deleted one was not the last", () => {
  const m = model([
    ["t1", WT],
    ["t2", WT, true],
  ]);
  assert.equal(worktreeOffer(m, "t1"), null);
  // The board hides archived rows; counting only those would wrongly offer removal.
  assert.deepEqual(
    worktreeOffer(
      model(
        [
          ["t1", WT],
          ["t2", WT, true],
        ],
        false,
      ),
      "t1",
    ),
    { root: "/w/checkout-flow", path: WT, branch: "fix-x" },
  );
});

test("a session outside every repo offers nothing", () => {
  const m = buildBoard({ terminals: [term("t9", "/elsewhere")], agents: [], panes: [], spaces: [], repos, now: 5000 });
  assert.equal(worktreeOffer(m, "t9"), null);
});

test("git status text becomes its lines; 3 uncommitted files list as 3", () => {
  const files = parseLines(" M src/a.js\n?? notes.txt\nA  b.js\n\n");
  assert.deepEqual(files, [" M src/a.js", "?? notes.txt", "A  b.js"]);
  assert.deepEqual(parseLines(""), []);
  assert.deepEqual(parseLines(null), []);
});

test("the remove option reads Remove worktree, or discards N files when dirty", () => {
  assert.equal(removeLabel(0), "Remove worktree");
  assert.equal(removeLabel(1), "Remove and discard 1 file");
  assert.equal(removeLabel(3), "Remove and discard 3 files");
});

test("removing a clean worktree plans wt remove without -f and without -D", () => {
  const p = planRemove({ root: "/w/checkout-flow", branch: "fix-x" }, 0);
  assert.equal(p.cmd, "wt");
  assert.deepEqual(p.args, ["-C", "/w/checkout-flow", "remove", "fix-x", "-y", "--foreground"]);
});

test("removing a dirty worktree plans wt remove with -f and without -D", () => {
  const { args } = planRemove({ root: "/w/checkout-flow", branch: "fix-x" }, 3);
  assert.deepEqual(args, ["-C", "/w/checkout-flow", "remove", "fix-x", "-y", "--foreground", "-f"]);
  assert.ok(!args.includes("-D"));
});

test("delete kills the terminal; a lone agent also closes its tab, confirmed", () => {
  assert.deepEqual(planDelete({ terminal: "t1", tab: "tab1", alone: false }), [{ name: "terminal.kill", args: { terminal: "t1" } }]);
  assert.deepEqual(planDelete({ terminal: "t1", tab: "tab1", alone: true }), [
    { name: "terminal.kill", args: { terminal: "t1" } },
    { name: "tab.close", args: { id: "tab1", confirmed: true } },
  ]);
  assert.equal(planDelete({ terminal: "t1", tab: null, alone: true }).length, 1);
});

test("an agent is alone in a tab when no other pane shares it", () => {
  const panes = [
    { pane: "p1", tab: "tab1", terminal: "t1" },
    { pane: "p2", tab: "tab1", terminal: "t2" },
    { pane: "p3", tab: "tab2", terminal: "t3" },
  ];
  assert.equal(aloneInTab(panes, "tab1", "t1"), false);
  assert.equal(aloneInTab(panes, "tab2", "t3"), true);
  assert.equal(aloneInTab([], "tab1", "t1"), true);
  assert.equal(aloneInTab(panes, null, "t1"), false);
});

test("archive and unarchive are tab.settle and tab.unsettle on the tab", () => {
  assert.deepEqual(tabCommand("archive", "tab1"), { name: "tab.settle", args: { id: "tab1" } });
  assert.deepEqual(tabCommand("unarchive", "tab1"), { name: "tab.unsettle", args: { id: "tab1" } });
});

test("archive hides the row; a blocked status brings the tab back", () => {
  const rows = (settled, status) => model([["t1", "/w/checkout-flow", settled, status]], false).repos[0].rows;
  assert.equal(rows(true, "working").length, 0);
  // Herdr unsettles a tab when an agent in it needs the person.
  const back = rows(false, "blocked");
  assert.equal(back.length, 1);
  assert.equal(back[0].status, "needs");
});

test("the menu lists each action with its key; archive and unarchive swap", () => {
  const ids = (row, launch) => actionsFor(row, launch).map((a) => a.id);
  assert.deepEqual(ids({ archived: false, tab: "x" }, true), ["rename", "relaunch", "folder", "archive", "delete"]);
  assert.deepEqual(ids({ archived: true, tab: "x" }, true), ["rename", "relaunch", "folder", "unarchive", "delete"]);
  const keys = Object.fromEntries(actionsFor({ archived: false, tab: "x" }, true).map((a) => [a.id, a.key]));
  assert.deepEqual(keys, { rename: "r", relaunch: "⇧P", folder: "⇧↩", archive: "a", delete: "d" });
});

test("relaunch needs a launch label; tab actions need a tab", () => {
  assert.ok(!actionsFor({ archived: false, tab: "x" }, false).some((a) => a.id === "relaunch"));
  assert.deepEqual(
    actionsFor({ archived: false, tab: null }, false).map((a) => a.id),
    ["folder", "delete"],
  );
});

test("an exited board launch offers relaunch and delete (and the rest)", () => {
  const ids = actionsFor({ archived: false, tab: "x", exited: true }, true).map((a) => a.id);
  assert.ok(ids.includes("relaunch") && ids.includes("delete"));
});

test("Resume is offered only where the agent left and its conversation is known; Sleep only on a running agent", () => {
  const ids = (row) => actionsFor(row, false).map((a) => a.id);
  const live = { archived: false, tab: "x", address: "t1", exited: false, session: "claude:s1" };
  assert.ok(ids(live).includes("sleep") && !ids(live).includes("resume"));
  const gone = { ...live, exited: true };
  assert.ok(ids(gone).includes("resume") && !ids(gone).includes("sleep"));
  assert.ok(!ids({ ...gone, session: null }).includes("resume"));
  const keys = Object.fromEntries(
    actionsFor(gone, false)
      .concat(actionsFor(live, false))
      .map((a) => [a.id, a.key]),
  );
  assert.equal(keys.resume, "⇧R");
  assert.equal(keys.sleep, "z");
});

test("the editor command defaults to open and takes the path last", () => {
  assert.deepEqual(editorCommand(undefined, "/w/a b"), { cmd: "open", args: ["/w/a b"] });
  assert.deepEqual(editorCommand("", "/p"), { cmd: "open", args: ["/p"] });
  assert.deepEqual(editorCommand("  code -n  ", "/p"), { cmd: "code", args: ["-n", "/p"] });
});

const ok = (stdout) => ({ code: 0, stdout });

test("a check that ran is known; a failed or rejected one is unknown, never clean", () => {
  assert.deepEqual(summarizeCheck(ok(" M a\n?? b\n"), ok("abc fix\n")), { files: [" M a", "?? b"], unpushed: ["abc fix"], known: true, filesOk: true });
  const bad = summarizeCheck({ code: 128, stdout: "" }, ok(""));
  assert.equal(bad.known, false);
  assert.equal(bad.filesOk, false);
  assert.equal(forceCount(bad), 0);
  assert.equal(summarizeCheck(null, ok("")).known, false);
  assert.equal(summarizeCheck(ok(""), null).known, false);
  assert.equal(summarizeCheck(ok(" M a"), null).filesOk, true);
});

test("-f follows only a list the user was shown", () => {
  assert.equal(forceCount(summarizeCheck(ok(" M a\n M b"), ok(""))), 2);
});

test("a remove tick made before the check loaded is reset unless the tree is known clean", () => {
  assert.equal(settleRemove(true, summarizeCheck(ok(" M a"), ok(""))), false);
  assert.equal(settleRemove(true, summarizeCheck(ok(""), ok("abc x"))), false);
  assert.equal(settleRemove(true, summarizeCheck({ code: 1, stdout: "" }, ok(""))), false);
  assert.equal(settleRemove(true, summarizeCheck(ok(""), ok(""))), true);
  assert.equal(settleRemove(false, summarizeCheck(ok(""), ok(""))), false);
});

test("after the agent stops, an unchanged list removes with -f; a changed one asks again", () => {
  const seen = summarizeCheck(ok(" M a\n M b"), ok(""));
  assert.deepEqual(recheckRemove(seen, ok(" M a\n M b\n")), { changed: false, dirty: 2 });
  assert.deepEqual(recheckRemove(seen, ok(" M a\n M b\n?? c")), { changed: true, files: [" M a", " M b", "?? c"] });
  assert.deepEqual(recheckRemove(seen, ok(" M a\n M c")), { changed: true, files: [" M a", " M c"] });
  assert.deepEqual(recheckRemove(summarizeCheck(ok(""), ok("")), ok("")), { changed: false, dirty: 0 });
  assert.equal(recheckRemove(summarizeCheck(ok(""), ok("")), ok("?? x")).changed, true);
});

test("a failed re-check or an unknown first check never allows -f", () => {
  const seen = summarizeCheck(ok(" M a"), ok(""));
  assert.deepEqual(recheckRemove(seen, { code: 128, stdout: "" }), { changed: false, dirty: 0 });
  assert.deepEqual(recheckRemove(seen, null), { changed: false, dirty: 0 });
  const unknown = summarizeCheck({ code: 1, stdout: "" }, ok(""));
  assert.equal(recheckRemove(unknown, ok(" M a")).changed, true);
});

test("a nebula row offers only Hide from board", () => {
  assert.deepEqual(
    actionsFor({ kind: "nebula" }, false).map((a) => a.id),
    ["hide"],
  );
});

test("a nebula row's Hide is on d, and delete or archive on it both mean hide", () => {
  assert.deepEqual(actionsFor({ kind: "nebula" }, true), [{ id: "hide", label: "Hide from board", key: "d", icon: "mods/nebula/icons/eye-off.svg" }]);
  const row = { kind: "nebula" };
  assert.equal(rowAction(row, "delete"), "hide");
  assert.equal(rowAction(row, "archive"), "hide");
  assert.equal(rowAction(row, "hide"), "hide");
  assert.equal(rowAction(row, "rename"), "rename");
});

test("other rows keep the action asked for", () => {
  for (const a of ["delete", "archive", "unarchive", "rename"]) assert.equal(rowAction({ kind: "agent" }, a), a);
  assert.equal(rowAction({}, "delete"), "delete");
});

test("whereIs finds the repo and band holding a row, else null", () => {
  const band = { rows: [{ id: "a" }, { id: "b" }] };
  const repo = { bands: [{ rows: [{ id: "z" }] }, band] };
  const model = { repos: [{ bands: [] }, repo] };
  assert.deepEqual(whereIs(model, "b"), { repo, band });
  assert.equal(whereIs(model, "nope"), null);
  assert.equal(whereIs({ repos: [] }, "a"), null);
});

// Mirrors d_and_the_menu_on_an_empty_band_ask_to_delete_the_worktree: `d` on an empty band asks about the
// worktree itself, with the same offer the last session's delete makes.
test("an empty linked worktree offers its own removal, the same offer as deleting its last session", () => {
  const withSession = model([["t1", WT]]);
  const empty = buildBoard({ terminals: [], repos, now: 5000, showEmpty: true });
  const band = empty.repos[0].bands.find((b) => b.path === WT);
  assert.deepEqual(bandOffer("/w/checkout-flow", band), worktreeOffer(withSession, "t1"));
  assert.deepEqual(bandOffer("/w/checkout-flow", band), { root: "/w/checkout-flow", path: WT, branch: "fix-x" });
});

test("the repo's own checkout, the default branch and a band with sessions offer no removal", () => {
  const empty = buildBoard({
    terminals: [],
    repos,
    now: 5000,
    showEmpty: true,
    wt: { [WT]: { branch: "fix-x", isDefault: true, ahead: 0, added: 0, deleted: 0 } },
  });
  assert.equal(
    bandOffer(
      "/w/checkout-flow",
      empty.repos[0].bands.find((b) => b.path === "/w/checkout-flow"),
    ),
    null,
  );
  assert.equal(
    bandOffer(
      "/w/checkout-flow",
      empty.repos[0].bands.find((b) => b.path === WT),
    ),
    null,
    "default branch",
  );
  const busy = model([["t1", WT]]);
  assert.equal(
    bandOffer(
      "/w/checkout-flow",
      busy.repos[0].bands.find((b) => b.path === WT),
    ),
    null,
    "has a session",
  );
  assert.equal(bandOffer("/w/checkout-flow", undefined), null);
});

test("a worktree header's menu opens the folder and, for a linked worktree, removes it naming the sessions it ends", async () => {
  const { worktreeActions, worktreeSessions } = await import("../mods/nebula/lib/actions.js");
  const { installedEditors } = await import("../mods/nebula/lib/editors.js");
  const eds = installedEditors("Zed.app\n");
  assert.deepEqual(
    worktreeActions({ editors: eds, editor: "open", deletable: true, sessions: 2 }).map((a) => [a.id, a.label]),
    [
      ["folder", "Open in Zed"],
      ["editor:finder", "Reveal in Finder"],
      ["removeWorktree", "Remove worktree (ends 2 sessions)"],
    ],
  );
  assert.equal(worktreeActions({ editors: eds, deletable: true }).at(-1).label, "Remove worktree");
  assert.ok(!worktreeActions({ editors: eds, deletable: false }).some((a) => a.id === "removeWorktree"), "the repo's own checkout stays");
  const band = {
    rows: [
      { address: "t1", tab: "tb1", title: "A" },
      { address: "t2", tab: "tb2", title: "B", exited: true },
      { address: "t3", kind: "nebula" },
    ],
  };
  assert.deepEqual(
    worktreeSessions(band, []).map((s) => s.terminal),
    ["t1"],
    "only live agent sessions end",
  );
});
