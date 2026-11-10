import test from "node:test";
import assert from "node:assert/strict";
import { sessionOf, lastReply, gist, question, replyLine } from "../mods/nebula/lib/reply.js";

test("the conversation is the prompt hook's claude:<id> or codex:<id>; anything else is none", () => {
  assert.deepEqual(sessionOf("claude:eb72a2eb-80f8"), { app: "claude", id: "eb72a2eb-80f8" });
  assert.equal(sessionOf("claude:../../etc"), null);
  assert.equal(sessionOf(undefined), null);
});

test("the last reply is the newest assistant text, from Claude or Codex transcripts; a cut first line is skipped", () => {
  const claude = [
    'ant","content":[{"type":"text","text":"cut"}]}}',
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "First answer" }] } }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash" }] } }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "The wizard runs at localhost:5173." }] } }),
    JSON.stringify({ type: "user", message: { content: "ok" } }),
  ].join("\n");
  assert.equal(lastReply(claude), "The wizard runs at localhost:5173.");
  const codex = JSON.stringify({
    type: "response_item",
    payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Tests pass." }] },
  });
  assert.equal(lastReply(codex), "Tests pass.");
  assert.equal(lastReply(JSON.stringify({ type: "event_msg", payload: { type: "task_complete", last_agent_message: "Done." } })), "Done.");
  assert.equal(lastReply("not json"), null);
});

test("the gist is the reply's first prose line without markdown, cut to length", () => {
  assert.equal(gist("```js\nx\n```\n**Fixed** the `login` [redirect](http://x)."), "Fixed the login redirect.");
  assert.equal(gist("| a | b |\n\nPlain words here."), "Plain words here.");
  assert.equal(gist("a".repeat(200), 20).length, 20);
  assert.equal(gist(""), null);
});

test("an agent that needs you is quoted by its question; a finished one by its first line", () => {
  const reply = "I updated slide 5.\n\nCommit it after the meeting? Or now.";
  assert.equal(question(reply), "Commit it after the meeting?");
  assert.equal(replyLine(reply, "needs"), "Commit it after the meeting?");
  assert.equal(replyLine(reply, "unseen"), "I updated slide 5.");
  assert.equal(replyLine("No question here.", "needs"), "No question here.");
});
