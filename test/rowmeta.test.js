import test from "node:test";
import assert from "node:assert/strict";
import { rowMeta } from "../mods/nebula/lib/rowmeta.js";

test("icon replaces the program name; model and effort follow", () => {
  assert.deepEqual(rowMeta({ program: "claude", model: "opus", effort: "high" }), { icon: "icons/claude.svg", text: "opus · high" });
  assert.deepEqual(rowMeta({ program: "claude", model: "opus" }), { icon: "icons/claude.svg", text: "opus" });
  assert.deepEqual(rowMeta({ program: "codex" }), { icon: "icons/codex.svg", text: "" });
});

test("the launch label's harness wins over the program name", () => {
  assert.equal(rowMeta({ program: "node", launch: { harness: "pi" }, model: "sonnet" }).icon, "icons/pi.svg");
});

test("no icon: the text name stays, unknown parts and 'default' are omitted", () => {
  assert.deepEqual(rowMeta({ program: "vim" }), { icon: null, text: "vim" });
  assert.deepEqual(rowMeta({ program: "vim", model: "default", effort: " " }), { icon: null, text: "vim" });
  assert.deepEqual(rowMeta({ program: "", model: "" }), { icon: null, text: "" });
});
