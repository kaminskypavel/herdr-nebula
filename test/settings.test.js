import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, mergeSettings, defaultHarness, harnessChoice, cycleOf, groupShortcuts, strokeLabel } from "../mods/nebula/lib/settings.js";

test("an empty store yields Tree, claude and auto-title on", () => {
  for (const empty of [undefined, null, {}, "junk", []]) {
    const s = mergeSettings(empty);
    assert.equal(s.view, "tree");
    assert.equal(s.harness, "claude");
    assert.equal(s.autoTitle, true);
    assert.equal(s.newWorktree, false);
    assert.equal(s.confirmArchive, false);
    assert.equal(s.presetSide, "prefix");
    assert.equal(s.editor, "open");
  }
  assert.deepEqual(mergeSettings({}), DEFAULTS);
});

test("a stored partial setting keeps the other defaults", () => {
  const s = mergeSettings({ view: "columns", autoTitle: false });
  assert.equal(s.view, "columns");
  assert.equal(s.autoTitle, false);
  assert.equal(s.harness, "claude");
  assert.equal(s.editor, "open");
});

test("a value of the wrong kind falls back to its default, unknown keys stay", () => {
  const s = mergeSettings({
    view: "grid",
    harness: "nope",
    autoTitle: "yes",
    presetSide: 3,
    editor: "  ",
    extra: 7,
    harnesses: { claude: { model: 4, effort: "high" }, nope: { model: "x" } },
  });
  assert.equal(s.view, "tree");
  assert.equal(s.harness, "claude");
  assert.equal(s.autoTitle, true);
  assert.equal(s.presetSide, "prefix");
  assert.equal(s.editor, "open");
  assert.equal(s.extra, 7);
  assert.deepEqual(s.harnesses, { claude: { model: null, effort: "high" } });
});

test("the default harness is the stored one when installed, else the first installed", () => {
  assert.equal(defaultHarness(mergeSettings({ harness: "codex" }), ["claude", "codex"]), "codex");
  assert.equal(defaultHarness(mergeSettings({ harness: "codex" }), ["claude"]), "claude");
  assert.equal(defaultHarness(mergeSettings({}), []), null);
});

test("a harness's model and effort come from its stored choice, else null", () => {
  const s = mergeSettings({ harnesses: { claude: { model: "opus", effort: "high" } } });
  assert.deepEqual(harnessChoice(s, "claude"), { model: "opus", effort: "high" });
  assert.deepEqual(harnessChoice(s, "codex"), { model: null, effort: null });
});

test("cycleOf steps through a list and wraps", () => {
  assert.equal(cycleOf(["a", "b", "c"], "c", 1), "a");
  assert.equal(cycleOf(["a", "b", "c"], "a", -1), "c");
  assert.equal(cycleOf(["a", "b"], "zzz", 1), "b");
});

test("strokeLabel turns keys.json spellings into symbols", () => {
  assert.equal(strokeLabel("cmd-k", true), "⌘K");
  assert.equal(strokeLabel("ctrl-`", true), "⌃`");
  assert.equal(strokeLabel("cmd-]", false), "Super+]");
  assert.equal(strokeLabel("n", true), "n");
  assert.equal(strokeLabel("N", true), "⇧N");
  assert.equal(strokeLabel("cmd--", true), "⌘-");
  assert.equal(strokeLabel("ctrl-shift-tab", false), "Ctrl+Shift+Tab");
});

const rowOf = (groups, group, text) => groups.find((g) => g.group === group).rows.find((r) => r.text === text);

test("with no rebinds the groups show the built-in keys", () => {
  const groups = groupShortcuts([], true);
  assert.deepEqual(
    groups.map((g) => g.group),
    ["Anywhere", "New-session box", "Board"],
  );
  assert.equal(rowOf(groups, "Board", "new, presets, view").keys, "p e v");
  assert.equal(rowOf(groups, "Anywhere", "new session").keys, "⌘K");
});

test("a rebind of the focus key in keys() shows the new key", () => {
  const groups = groupShortcuts([{ section: "layout:nebula", keys: "ctrl-j", action: "nebula.focus" }], true);
  assert.equal(rowOf(groups, "Anywhere", "board: take keys, fold").keys, "⌃J");
});

test("a rebound chord shows in Anywhere", () => {
  const groups = groupShortcuts([{ section: "layout:nebula", keys: "cmd-j", action: "mod.open:nebula-box" }], true);
  assert.equal(rowOf(groups, "Anywhere", "new session").keys, "⌘J");
});

test("an unbound action (empty keys) falls back to the built-in key", () => {
  const groups = groupShortcuts([{ section: "global", keys: "  ", action: "nebula.next" }], true);
  assert.equal(rowOf(groups, "Anywhere", "next, previous needs-you").keys, "⌘] ⌘[");
});

test("the prompt line and empty worktrees are on by default, and only a boolean turns them off", () => {
  const s = mergeSettings({});
  assert.equal(s.promptLine, true);
  assert.equal(s.showEmptyWorktrees, true);
  assert.equal(mergeSettings({ promptLine: false }).promptLine, false);
  assert.equal(mergeSettings({ showEmptyWorktrees: false }).showEmptyWorktrees, false);
  assert.equal(mergeSettings({ promptLine: "no", showEmptyWorktrees: 0 }).promptLine, true);
  assert.equal(mergeSettings({ promptLine: "no", showEmptyWorktrees: 0 }).showEmptyWorktrees, true);
});

test("Preview while moving is on by default, and only a boolean turns it off", () => {
  assert.equal(mergeSettings({}).preview, false);
  assert.equal(mergeSettings({ preview: false }).preview, false);
  assert.equal(mergeSettings({ preview: "no" }).preview, false);
});

test("Help lists the jump palette, Esc, / f ? and moving shows the agent", () => {
  const groups = groupShortcuts([], true);
  assert.equal(rowOf(groups, "Anywhere", "jump to any agent, any project").keys, "⌘J");
  const board = groups.find((g) => g.group === "Board").rows;
  assert.ok(board.some((r) => r.keys === "Esc" && /terminal/.test(r.text)));
  assert.ok(board.some((r) => r.keys === "/ f ?" && /jump/.test(r.text)));
  assert.ok(board.some((r) => /^move/.test(r.text) && /showing/.test(r.text)));
});

test("a rebound jump key shows in Help", () => {
  const groups = groupShortcuts([{ section: "layout:nebula", keys: "cmd-p", action: "nebula.jump" }], true);
  assert.equal(rowOf(groups, "Anywhere", "jump to any agent, any project").keys, "⌘P");
});

test("Help lists Resume and Sleep on the board", () => {
  const rows = groupShortcuts([], true).find((g) => g.group === "Board").rows;
  assert.ok(rows.some((r) => r.keys === "⇧R" && /resume/i.test(r.text)));
  assert.ok(rows.some((r) => r.keys === "z" && /sleep/i.test(r.text)));
});
