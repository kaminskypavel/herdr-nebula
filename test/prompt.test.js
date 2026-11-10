import test from "node:test";
import assert from "node:assert/strict";
import { rowText } from "../mods/nebula/lib/prompt.js";
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
