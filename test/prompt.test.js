import test from "node:test";
import assert from "node:assert/strict";
import { rowText, clampLines, subSummary } from "../mods/nebula/lib/prompt.js";
import { NEW_SESSION } from "../mods/nebula/lib/viewmodel.js";

test("a titled row keeps its title and shows the prompt on a second line", () => {
  assert.deepEqual(rowText({ title: "Fix login", prompt: "make the redirect work" }), { title: "Fix login", sub: "make the redirect work" });
});

test("a row still called New session shows its prompt as the title, with no second line", () => {
  for (const on of [true, false]) assert.deepEqual(rowText({ title: NEW_SESSION, prompt: "add a retry" }, on), { title: "add a retry", sub: "" });
});

test("with the setting off the second line goes, the title stays", () => {
  assert.deepEqual(rowText({ title: "Fix login", prompt: "make the redirect work" }, false), { title: "Fix login", sub: "" });
});

test("a row with no prompt is just its title", () => {
  for (const prompt of ["", "   ", undefined, null]) assert.deepEqual(rowText({ title: NEW_SESSION, prompt }), { title: NEW_SESSION, sub: "" });
  assert.deepEqual(rowText({ title: "Fix login", prompt: "" }), { title: "Fix login", sub: "" });
});

test("a nebula row shows its summary as the second line", () => {
  assert.deepEqual(rowText({ kind: "nebula", title: "refactor", prompt: "split the store" }), { title: "refactor", sub: "split the store" });
});

test("the agent's line replaces the prompt on the second line, and shows under a prompt-as-title too", () => {
  assert.deepEqual(rowText({ title: "Fix login", prompt: "make it work", said: "Which db?" }), { title: "Fix login", sub: "Which db?" });
  assert.deepEqual(rowText({ title: NEW_SESSION, prompt: "add a retry", said: "Done." }), { title: "add a retry", sub: "Done." });
  assert.deepEqual(rowText({ title: "Fix login", prompt: "x", said: "Done." }, false), { title: "Fix login", sub: "" });
});

test("a title that is the task does not repeat it under itself", () => {
  assert.deepEqual(rowText({ title: "wire the retry", prompt: "wire the retry please", taskTitle: true }), { title: "wire the retry", sub: "" });
  assert.equal(rowText({ title: "wire the retry", prompt: "p", taskTitle: true, said: "Done." }).sub, "Done.");
});

test("clampLines wraps words into at most N lines and ends the last with an ellipsis when cut", () => {
  assert.equal(clampLines("one two three", 20, 2), "one two three");
  assert.equal(clampLines("one two three four", 8, 3), "one two\nthree\nfour");
  assert.equal(clampLines("alpha beta gamma delta epsilon", 12, 2), "alpha beta\ngamma delta…");
  assert.equal(clampLines("supercalifragilistic word", 8, 2), "superca…\nword");
  assert.equal(clampLines("   ", 10, 2), "");
});

test("subSummary is one line: the count and the names", () => {
  assert.equal(subSummary([]), "");
  assert.equal(subSummary([{ text: "sonnet-high-worker" }, { text: "sonnet-high-worker" }]), "2 subagents · sonnet-high-worker");
  assert.equal(subSummary([{ text: "a" }]), "1 subagent · a");
});
