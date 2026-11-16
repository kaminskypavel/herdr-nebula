import test from "node:test";
import assert from "node:assert/strict";
import { sessionOf, lastReply, gist, question, replyLine, lastPrompt, recap, recapCommand } from "../mods/nebula/lib/reply.js";

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

test("a sleeping agent's recap is the last typed prompt and the last reply; tool results, wrappers and hook notes are not prompts", () => {
  const j = JSON.stringify;
  const tail = [
    j({ type: "user", message: { content: "fix the login redirect" } }),
    j({ type: "assistant", message: { content: [{ type: "text", text: "Fixed in auth.ts." }] } }),
    j({ type: "user", message: { content: [{ type: "tool_result", content: "ok" }] } }),
    j({ type: "user", message: { content: "<command-name>/model</command-name>" } }),
    j({ type: "user", isMeta: true, message: { content: "note" } }),
  ].join("\n");
  assert.equal(lastPrompt(tail), "fix the login redirect");
  assert.equal(recap(tail), "You: fix the login redirect\n\nFixed in auth.ts.\n\nAsleep. Enter on the board resumes this conversation.");
  assert.equal(recap("cut line"), null);
  assert.match(recapCommand("claude:eb72-a"), /clear && herdr-nebula recap claude:eb72-a$/);
  assert.equal(recapCommand("claude:x; rm -rf ~"), null);
});
