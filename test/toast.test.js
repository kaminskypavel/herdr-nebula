import test from "node:test";
import assert from "node:assert/strict";
import { eventOf, terminalOf, sessionName, projectOf, sessionOf, lastReply, gist, agentLines } from "../mods/toast/lib.js";

const term = {
  address: "t20",
  cwd: "/Users/pk/devl/libby-agent/libby-agent-monorepo",
  labels: { where: "libby-agent-monorepo / build-wizard", "nebula.session": "claude:eb72a2eb-80f8", "nebula.prompt": "make sure the wizard is running" },
};

test("Herdr's agent alerts are told apart from other toasts by their title", () => {
  assert.equal(eventOf("Claude Code finished"), "finished");
  assert.equal(eventOf("Codex needs you"), "needs you");
  assert.equal(eventOf("Update ready"), null);
});

test("the toast's terminal is the click action's, else the one whose space / tab is the body", () => {
  assert.equal(terminalOf({ action: { name: "agent.focus", args: { terminal: "t20" } } }, [term]), term);
  assert.equal(terminalOf({ body: "libby-agent-monorepo / build-wizard" }, [term]), term);
  assert.equal(terminalOf({ body: "x / y" }, [term]), null);
});

test("the session is the tab part of space / tab; a numbered tab has no name", () => {
  assert.equal(sessionName("Desktop / herdr-nebula"), "herdr-nebula");
  assert.equal(sessionName("Desktop / 2"), null);
  assert.equal(sessionName("Desktop"), null);
});

test("the project is the folder's name, or the repo's for a worktree", () => {
  assert.equal(projectOf("/Users/pk/devl/libby-agent/libby-agent-monorepo"), "libby-agent-monorepo");
  assert.equal(projectOf("/Users/pk/devl/freemixer-worktrees/hit-pilot/"), "freemixer");
  assert.equal(sessionOf("claude:eb72a2eb-80f8").id, "eb72a2eb-80f8");
  assert.equal(sessionOf("claude:../../etc"), null);
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
  const codex = [
    JSON.stringify({ type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Tests pass." }] } }),
    JSON.stringify({ type: "event_msg", payload: { type: "token_count" } }),
  ].join("\n");
  assert.equal(lastReply(codex), "Tests pass.");
  assert.equal(lastReply(JSON.stringify({ type: "event_msg", payload: { type: "task_complete", last_agent_message: "Done." } })), "Done.");
  assert.equal(lastReply("not json"), null);
});

test("the gist is the reply's first prose line without markdown, cut to length", () => {
  assert.equal(gist("```js\nx\n```\n**Fixed** the `login` [redirect](http://x)."), "Fixed the login redirect.");
  assert.equal(gist("## Done\nmore"), "Done");
  assert.equal(gist("| a | b |\n\nPlain words here."), "Plain words here.");
  assert.equal(gist("┈┈┄┄──────╼━━━━ ◕_◕ ━━━━╾\n\n**Ship it?**"), "Ship it?");
  assert.equal(gist("a".repeat(200), 20).length, 20);
  assert.equal(gist(""), null);
});

test("an agent alert becomes '<session> [done|needs you]' over '<project> · <reply or prompt>'; other toasts stay", () => {
  const p = { title: "Claude Code finished", body: "libby-agent-monorepo / build-wizard", action: { args: { terminal: "t20" } } };
  assert.deepEqual(agentLines(p, term, "The wizard runs at localhost:5173."), {
    name: "build-wizard",
    tag: "done",
    tone: "ansi6",
    body: "libby-agent-monorepo · The wizard runs at localhost:5173.",
  });
  assert.equal(agentLines(p, term, null).body, "libby-agent-monorepo · › make sure the wizard is running");
  const needs = agentLines({ ...p, title: "Claude Code needs you" }, term, null);
  assert.equal(needs.tag, "needs you");
  assert.equal(needs.tone, "ansi1");
  assert.equal(agentLines({ title: "Update ready" }, term, null), null);
  assert.equal(agentLines(p, null, null), null);
});

test("an untitled session is named by its last prompt, else by the app", () => {
  const untitled = { ...term, labels: { ...term.labels, where: "libby-agent-monorepo / 1" } };
  assert.equal(agentLines({ title: "Claude Code finished", body: "x" }, untitled, null).name, "› make sure the wizard is running");
  const bare = { ...term, labels: { where: "libby-agent-monorepo / 1" } };
  assert.equal(agentLines({ title: "Claude Code finished", body: "x" }, bare, null).name, "Claude Code");
});

test("needs you quotes the question the agent asked; done quotes its first line", async () => {
  const { question, replyLine } = await import("../mods/toast/lib.js");
  const reply = "I updated slide 5.\n\nThe headline now reads differently. **Commit it after the meeting?**\n\n```sh\ngit status?\n```";
  assert.equal(question(reply), "Commit it after the meeting?");
  assert.equal(replyLine(reply, "needs you"), "Commit it after the meeting?");
  assert.equal(replyLine(reply, "finished"), "I updated slide 5.");
  assert.equal(replyLine("No question here.", "needs you"), "No question here.");
  assert.equal(question("Is it A? Or is it B? It is C."), "Or is it B?");
});

test("the popup's icon is the icon bar's for the project holding the agent's folder, longest root first", async () => {
  const { iconOf, DOT_OF } = await import("../mods/toast/lib.js");
  const a = { path: "mods/nebula/.icons/a.svg" },
    b = { path: null, initials: "LM", color: "#7a5fc8" };
  const icons = { "/r/libby": a, "/r/libby/libby-agent-monorepo": b };
  assert.equal(iconOf(icons, "/r/libby/libby-agent-monorepo"), b);
  assert.equal(iconOf(icons, "/r/libby/libby-agent-monorepo/apps/web"), b);
  assert.equal(iconOf(icons, "/r/libby-worktrees/fix"), a);
  assert.equal(iconOf(icons, "/r/libbyx"), null);
  assert.equal(iconOf(undefined, "/r"), null);
  assert.equal(DOT_OF["needs you"], "ansi1");
});
