import test from "node:test";
import assert from "node:assert/strict";
import { parseSession, nextSession, resumeCommand, canResume, resumeHint, sessionValue } from "../mods/nebula/lib/resume.js";

const ID = "11111111-2222-3333-4444-555555555555";

test("a session label is <app>:<plain id>, anything else is no session", () => {
  assert.deepEqual(parseSession(`claude:${ID}`), { app: "claude", id: ID });
  assert.deepEqual(parseSession("codex:019a-abc_1.2"), { app: "codex", id: "019a-abc_1.2" });
  for (const bad of [
    undefined,
    null,
    "",
    "claude:",
    ":abc",
    "pi:abc",
    `claude:${ID} --x`,
    "claude:a b",
    "claude:a;rm -rf ~",
    "claude:$(id)",
    "claude:-x",
    `claude:${"a".repeat(129)}`,
  ])
    assert.equal(parseSession(bad), null, String(bad));
});

// Mirrors nebula-daemon status.rs: a_session_id_is_saved_once_a_turn_gives_it_a_transcript
// (the hook runs on a prompt, so an id is only ever stored after a turn started; the same id
// is not written again) and a_replaced_session_id_is_a_new_conversation (/clear, /new).
test("the first prompt stores the id, the same id again writes nothing", () => {
  const first = nextSession("claude", undefined, "s1");
  assert.equal(first, "claude:s1");
  assert.equal(nextSession("claude", first, "s1"), null);
});

test("a replaced id is a new conversation and replaces the label", () => {
  assert.equal(nextSession("claude", "claude:s1", "s2"), "claude:s2");
  assert.equal(nextSession("codex", "claude:s1", "s1"), "codex:s1");
});

test("a payload without a usable id stores nothing, and an unknown app stores nothing", () => {
  for (const id of [undefined, null, "", "  ", 7, {}, "a b", "x;y"]) assert.equal(nextSession("claude", "claude:s1", id), null, String(id));
  assert.equal(nextSession("pi", undefined, "s1"), null);
  assert.equal(sessionValue("claude", "s1"), "claude:s1");
});

test("Claude resumes with --resume <id> and the launch model and effort", () => {
  assert.equal(resumeCommand(`claude:${ID}`, { harness: "claude", model: "opus", effort: "high" }), `claude --resume ${ID} --model opus --effort high`);
  assert.equal(resumeCommand(`claude:${ID}`, { harness: "claude", model: "default", effort: null }), `claude --resume ${ID}`);
});

test("Codex resumes with the resume subcommand, then its flags", () => {
  assert.equal(
    resumeCommand("codex:019a-abc", { harness: "codex", model: "gpt-5.6-sol", effort: "high" }),
    "codex resume 019a-abc --no-daemon --model gpt-5.6-sol -c model_reasoning_effort=high",
  );
  assert.equal(resumeCommand("codex:019a-abc", null), "codex resume 019a-abc --no-daemon");
});

test("the launch flags are used only when the same app launched it", () => {
  assert.equal(resumeCommand("claude:s1", { harness: "codex", model: "gpt-5.5", effort: "low" }), "claude --resume s1");
  assert.equal(resumeCommand("claude:s1", undefined), "claude --resume s1");
});

test("a value that is not a plain token is quoted, an unreadable label gives no command", () => {
  assert.equal(resumeCommand("claude:s1", { harness: "claude", model: "my model; x", effort: null }), "claude --resume s1 --model 'my model; x'");
  assert.equal(resumeCommand("claude:s1;rm -rf ~", null), null);
  assert.equal(resumeCommand(null, null), null);
});

test("only an exited Herdr terminal with a known conversation can be resumed in place", () => {
  const row = { exited: true, session: `claude:${ID}`, address: "t7" };
  assert.equal(canResume(row), true);
  assert.equal(canResume({ ...row, exited: false }), false);
  assert.equal(canResume({ ...row, session: null }), false);
  assert.equal(canResume({ ...row, kind: "nebula" }), false);
  assert.equal(canResume({ ...row, address: null }), false);
  assert.equal(canResume(null), false);
});

test("the row says why Enter resumes", () => {
  const row = { exited: true, session: "claude:s1", address: "t7" };
  assert.equal(resumeHint(row), "exited · Enter resumes");
  assert.equal(resumeHint({ ...row, asleep: true }), "asleep · Enter resumes");
  assert.equal(resumeHint({ ...row, session: null }), "");
  assert.equal(resumeHint({ ...row, exited: false }), "");
});
