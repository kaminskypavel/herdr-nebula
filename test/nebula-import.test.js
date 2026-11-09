import test from "node:test";
import assert from "node:assert/strict";
import { nebulaFiles, parseNebulaProjects, settingsFromNebula, applySettings, describeSettings, planImport } from "../mods/nebula/lib/nebula-import.js";
import { mergeSettings } from "../mods/nebula/lib/settings.js";
import { projectList } from "../mods/nebula/lib/repos.js";

const DB = JSON.stringify([
  { name: "alpha", repo_path: "/Users/x/devl/alpha", sort_order: 0 },
  { name: " beta ", repo_path: " /Users/x/devl/beta/ ", sort_order: 1 },
  { name: "ghost", repo_path: "", sort_order: 2 },
  { name: "nopath", sort_order: 3 },
  { name: "", repo_path: "/Users/x/devl/gamma", sort_order: 4 },
]);

test("nebula's files sit in its Application Support folder", () => {
  const f = nebulaFiles("/Users/x");
  assert.equal(f.db, "/Users/x/Library/Application Support/dev.nebula.nebula/nebula.db");
  assert.equal(f.config, "/Users/x/Library/Application Support/dev.nebula.nebula/config.json");
});

test("projects keep nebula's order, are trimmed, and rows without a path are skipped", () => {
  assert.deepEqual(parseNebulaProjects(DB), [
    { root: "/Users/x/devl/alpha", name: "alpha" },
    { root: "/Users/x/devl/beta", name: "beta" },
    { root: "/Users/x/devl/gamma", name: "gamma" },
  ]);
});

test("an empty table (sqlite prints nothing) is no projects, junk throws", () => {
  assert.deepEqual(parseNebulaProjects(""), []);
  assert.deepEqual(parseNebulaProjects(null), []);
  assert.deepEqual(parseNebulaProjects("[]"), []);
  assert.throws(() => parseNebulaProjects("not json"));
  assert.throws(() => parseNebulaProjects("{}"));
});

test("defaults: 'default' is no override, open_code maps to opencode, odd models stay", () => {
  const patch = settingsFromNebula({
    claude_model: "opus",
    claude_effort: "high",
    codex_model: "default",
    codex_effort: "Default",
    cursor_model: "composer-2",
    pi_model: "default",
    pi_effort: "low",
    opencode_model: "x/y",
    muse_model: "  ",
    nope_model: "z",
    editor: " nano ",
    claude_enabled: true,
    ask_before_archive: true,
  });
  assert.deepEqual(patch, {
    harnesses: {
      claude: { model: "opus", effort: "high" },
      cursor: { model: "composer-2", effort: null },
      pi: { model: null, effort: "low" },
      opencode: { model: "x/y", effort: null },
    },
    editor: "nano",
    confirmArchive: true,
  });
});

test("confirm archive reads either key, a non-boolean is ignored, nothing set gives an empty patch", () => {
  assert.equal(settingsFromNebula({ confirm_on_archive: false }).confirmArchive, false);
  assert.equal(settingsFromNebula({ ask_before_archive: "yes" }).confirmArchive, undefined);
  for (const empty of [null, undefined, [], "x", {}, { editor: "" }]) assert.deepEqual(settingsFromNebula(empty), {});
});

test("applying a patch changes only what it carries", () => {
  const cur = { editor: "code", view: "cards", harnesses: { claude: { model: "sonnet", effort: "low" } } };
  const s = applySettings(cur, { harnesses: { claude: { model: "opus", effort: null }, pi: { model: null, effort: "low" } }, confirmArchive: true });
  assert.equal(s.editor, "code");
  assert.equal(s.view, "cards");
  assert.equal(s.confirmArchive, true);
  assert.deepEqual(s.harnesses.claude, { model: "opus", effort: "low" });
  assert.deepEqual(s.harnesses.pi, { model: null, effort: "low" });
  assert.deepEqual(applySettings(undefined, {}), mergeSettings({}));
});

test("the defaults line reads like the dialog shows it", () => {
  assert.equal(
    describeSettings(settingsFromNebula({ claude_model: "opus", claude_effort: "high", editor: "nano" })),
    "claude: opus, high effort; editor: nano",
  );
  assert.equal(describeSettings({ harnesses: { pi: { model: null, effort: "low" } }, confirmArchive: false }), "pi: low effort; confirm archive: off");
  assert.equal(describeSettings({}), "");
});

test("an import adds only unlisted, not-removed roots, in nebula's order", () => {
  const store = {
    list: [{ root: "/Users/x/devl/alpha", name: "Alpha!" }],
    removed: ["/Users/x/devl/beta"],
  };
  const projects = parseNebulaProjects(DB).concat({ root: "/Users/x/devl/gamma/", name: "dup" }, { root: "/Users/x/devl/delta", name: "delta" });
  const plan = planImport(store, projects);
  assert.equal(plan.added, 2);
  assert.equal(plan.skipped, 3);
  assert.deepEqual(projectList(plan.store), [
    { root: "/Users/x/devl/alpha", name: "Alpha!" },
    { root: "/Users/x/devl/gamma", name: "gamma" },
    { root: "/Users/x/devl/delta", name: "delta" },
  ]);
  assert.deepEqual(plan.store.removed, ["/Users/x/devl/beta"]);
  assert.equal(store.list.length, 1);
});

test("an import into no store, or of no projects, changes nothing", () => {
  assert.deepEqual(planImport(undefined, parseNebulaProjects(DB)).added, 3);
  const same = { list: [], removed: [] };
  assert.deepEqual(planImport(same, []), { store: same, added: 0, skipped: 0 });
});
