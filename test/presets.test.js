import test from "node:test";
import assert from "node:assert/strict";
import { readPresets, writePresets, composePrompt, harnessOf, kindOf } from "../mods/nebula/lib/presets.js";

const file = JSON.stringify([
  { name: "reviewer", kind: "codex", pinned: true },
  { name: "future", kind: "antigravity", model: "x" },
]);

test("parsing a presets file fills defaults for missing fields", () => {
  assert.deepEqual(readPresets(JSON.stringify([{ name: "old" }])), [
    { name: "old", kind: "claude", custom_harness: null, model: null, effort: null, prefix: "", postfix: "", skip_task: false },
  ]);
});

test("a preset with an unknown field keeps the field when saved", () => {
  const presets = readPresets(file);
  assert.deepEqual(presets.map((p) => p.name), ["reviewer"]);
  presets[0].prefix = "Be strict.";
  presets.push({ ...readPresets('[{"name":"scratch"}]')[0] });
  const saved = JSON.parse(writePresets(presets, file));
  assert.deepEqual(saved.map((e) => e.name), ["reviewer", "scratch", "future"]);
  assert.equal(saved[0].pinned, true);
  assert.equal(saved[0].prefix, "Be strict.");
  assert.equal(saved[2].kind, "antigravity");
});

test("a preset another tool wrote that this reader cannot read survives a save, unless a saved preset takes its name", () => {
  const presets = readPresets(file);
  const saved = JSON.parse(writePresets([{ ...presets[0], name: "Future" }], file));
  assert.deepEqual(saved.map((e) => e.name), ["Future"]);
});

test("open_code maps to opencode and back", () => {
  assert.equal(harnessOf({ kind: "open_code" }), "opencode");
  assert.equal(kindOf("opencode"), "open_code");
  assert.equal(harnessOf({ kind: "claude" }), "claude");
  assert.equal(harnessOf({ kind: "custom", custom_harness: "aider" }), "aider");
});

test("a malformed presets file reads as an empty list", () => {
  assert.deepEqual(readPresets("not json"), []);
  assert.deepEqual(readPresets('{"name":"x"}'), []);
  assert.deepEqual(readPresets(""), []);
});

test("saving over a malformed file writes just the presets", () => {
  const saved = JSON.parse(writePresets(readPresets('[{"name":"a"}]'), "not json"));
  assert.deepEqual(saved.map((e) => e.name), ["a"]);
});

test("prefix, task and postfix join with a blank line and skip empty parts", () => {
  const p = { prefix: " Be strict. ", postfix: "Run the tests." };
  assert.equal(composePrompt(p, "fix login"), "Be strict.\n\nfix login\n\nRun the tests.");
  assert.equal(composePrompt(p, ""), "Be strict.\n\nRun the tests.");
  assert.equal(composePrompt({ prefix: "", postfix: "" }, "  "), "");
});

test("an absent file (null) reads as no presets and a first save writes just the new one", () => {
  assert.deepEqual(readPresets(null), []);
  const out = JSON.parse(writePresets([{ name: "a", kind: "claude" }], null));
  assert.deepEqual(out.map((e) => e.name), ["a"]);
});
