import test from "node:test";
import assert from "node:assert/strict";
import { buildArgv, HARNESSES } from "../mods/nebula/lib/harness.js";

test("Claude with model opus and effort high builds claude --model opus --effort high <task>", () => {
  assert.deepEqual(buildArgv({ harness: "claude", model: "opus", effort: "high", task: "fix it" }), ["claude", "--model", "opus", "--effort", "high", "fix it"]);
});

test("Codex with effort medium builds codex --no-daemon -c model_reasoning_effort=medium <task>", () => {
  assert.deepEqual(buildArgv({ harness: "codex", effort: "medium", task: "fix it" }), ["codex", "--no-daemon", "-c", "model_reasoning_effort=medium", "fix it"]);
});

test("OpenCode puts the task after --prompt", () => {
  assert.deepEqual(buildArgv({ harness: "opencode", model: "openai/gpt-5.5", task: "fix it" }), ["opencode", "--model", "openai/gpt-5.5", "--prompt", "fix it"]);
});

test("an empty task leaves the trailing argument off", () => {
  assert.deepEqual(buildArgv({ harness: "claude", task: "" }), ["claude"]);
  assert.deepEqual(buildArgv({ harness: "opencode", task: "  \n " }), ["opencode"]);
});

test("model and effort of default pass no flag", () => {
  assert.deepEqual(buildArgv({ harness: "claude", model: "default", effort: "default", task: "go" }), ["claude", "go"]);
  assert.deepEqual(buildArgv({ harness: "claude", model: null, effort: undefined, task: "go" }), ["claude", "go"]);
});

test("a multi-line task stays one argv item", () => {
  assert.deepEqual(buildArgv({ harness: "claude", task: "line one\nline two\n" }), ["claude", "line one\nline two"]);
});

test("Cursor joins model and effort into one id and drops an effort with no model", () => {
  assert.deepEqual(buildArgv({ harness: "cursor", model: "claude-opus-5", effort: "high" }), ["cursor-agent", "--model", "claude-opus-5-high"]);
  assert.deepEqual(buildArgv({ harness: "cursor", effort: "high" }), ["cursor-agent"]);
});

test("Pi passes effort as --thinking", () => {
  assert.deepEqual(buildArgv({ harness: "pi", effort: "low" }), ["pi", "--thinking", "low"]);
});

test("the table lists the model and effort choices pickers offer", () => {
  assert.deepEqual(HARNESSES.claude.efforts, ["low", "medium", "high", "xhigh", "max"]);
  assert.deepEqual(HARNESSES.claude.models, ["fable", "opus", "sonnet", "haiku"]);
});

test("Codex ends its options with -- before a task that starts with a dash", () => {
  assert.deepEqual(buildArgv({ harness: "codex", task: "- fix the bug" }), ["codex", "--no-daemon", "--", "- fix the bug"]);
  assert.deepEqual(buildArgv({ harness: "claude", task: "- fix the bug" }), ["claude", "- fix the bug"]);
  assert.deepEqual(buildArgv({ harness: "opencode", task: "- fix" }), ["opencode", "--prompt", "- fix"]);
});
