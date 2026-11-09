import test from "node:test";
import assert from "node:assert/strict";
import { readPresets, writePresets } from "../mods/nebula/lib/presets.js";
import { disabledReason, rowsOf, removePreset, savePreset, presetFrom, NEW_PRESET, launchPrefill, isStale, writeFailure } from "../mods/nebula/lib/preset-list.js";

const file = JSON.stringify([
  { name: "reviewer", kind: "codex", model: "gpt-5.5", pinned: true },
  { name: "scratch", kind: "claude", note: { a: 1 } },
  { name: "poet", kind: "muse" },
  { name: "ghost", kind: "cursor" },
]);
const known = [
  { run: ["claude"], installed: true },
  { run: ["/usr/local/bin/codex"], installed: true },
  { run: ["cursor-agent"], installed: false },
];

test("deleting one preset leaves the others with their unknown fields", () => {
  const left = removePreset(readPresets(file), "Scratch");
  assert.deepEqual(left.map((p) => p.name), ["reviewer", "poet", "ghost"]);
  const saved = JSON.parse(writePresets(left, file));
  assert.equal(saved.find((e) => e.name === "reviewer").pinned, true);
  assert.equal(saved.find((e) => e.name === "scratch"), undefined);
});

test("a muse preset is disabled with no Herdr program, an uninstalled one says so", () => {
  const rows = rowsOf(readPresets(file), known, "");
  const reason = (n) => rows.find((r) => r.preset.name === n).reason;
  assert.equal(reason("poet"), "no Herdr program");
  assert.equal(reason("ghost"), "not installed");
  assert.equal(reason("reviewer"), null);
});

test("the filter matches name, agent, model and effort, ignoring case", () => {
  const names = (q) => rowsOf(readPresets(file), known, q).map((r) => r.preset.name);
  assert.deepEqual(names("REVIEW"), ["reviewer"]);
  assert.deepEqual(names("gpt"), ["reviewer"]);
  assert.deepEqual(names("claude"), ["scratch"]);
  assert.deepEqual(names(""), ["reviewer", "scratch", "poet", "ghost"]);
});

test("renaming to an existing name in any case is refused; keeping or changing case of its own name is fine", () => {
  const list = readPresets(file);
  assert.match(savePreset(list, { ...list[1], name: "REVIEWER" }, "scratch").error, /already exists/);
  assert.match(savePreset(list, { ...list[1], name: " reviewer " }, "scratch").error, /already exists/);
  assert.match(savePreset(list, { ...NEW_PRESET, name: "Poet" }, null).error, /already exists/);
  assert.equal(savePreset(list, { ...list[1], name: "SCRATCH" }, "scratch").presets[1].name, "SCRATCH");
  assert.match(savePreset(list, { ...NEW_PRESET, name: "  " }, null).error, /name/);
});

test("saving a new preset appends; a rename keeps the unknown fields through the file", () => {
  const list = readPresets(file);
  assert.equal(savePreset(list, { ...NEW_PRESET, name: "fresh" }, null).presets.length, 5);
  const renamed = savePreset(list, { ...list[0], name: "strict" }, "reviewer").presets;
  const saved = JSON.parse(writePresets(renamed, file));
  assert.equal(saved.find((e) => e.name === "strict").pinned, true);
});

test("presetFrom maps the editor's fields to nebula's kind and keeps other fields", () => {
  const base = readPresets(file)[0];
  const p = presetFrom(base, { name: " r2 ", harness: "opencode", model: " ", effort: "high", prefix: "a", postfix: "" });
  assert.deepEqual([p.name, p.kind, p.custom_harness, p.model, p.effort, p.pinned], ["r2", "open_code", null, null, "high", true]);
  const c = presetFrom(NEW_PRESET, { name: "x", harness: "my-agent", model: "", effort: "", prefix: "", postfix: "" });
  assert.deepEqual([c.kind, c.custom_harness], ["custom", "my-agent"]);
});

test("a preset launches the box through its prefill", () => {
  const p = readPresets(file)[0];
  assert.deepEqual(launchPrefill(p, { newWorktree: true, branch: "calm-otter" }), {
    harness: "codex", model: "gpt-5.5", effort: null, preset: "reviewer", newWorktree: true, branch: "calm-otter",
  });
});

test("choosing a preset hands the typed task, checkout and repo back to the box", () => {
  const p = readPresets(file)[0];
  assert.deepEqual(launchPrefill(p, { newWorktree: false, branch: "b", task: "fix it", checkout: "/w/app-worktrees/x", root: "/w/app" }), {
    harness: "codex", model: "gpt-5.5", effort: null, preset: "reviewer", newWorktree: false, branch: "b",
    task: "fix it", checkout: "/w/app-worktrees/x", root: "/w/app",
  });
});

test("only the host's stale-snapshot rejection reads as a changed file; other failures show their text", () => {
  assert.equal(isStale(new Error("The file changed outside Herdr. Reload before saving; your draft is still here.")), true);
  assert.equal(isStale(new Error("The file changed while saving. Reload before saving.")), true);
  assert.equal(isStale(new Error("Permission denied")), false);
  assert.equal(writeFailure(new Error("Permission denied"), "stale"), "Permission denied");
  assert.equal(writeFailure(new Error("The file changed while saving."), "stale"), "stale");
});
