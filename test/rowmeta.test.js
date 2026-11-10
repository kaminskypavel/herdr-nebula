import test from "node:test";
import assert from "node:assert/strict";
import { rowMeta, stampOdd } from "../mods/nebula/lib/rowmeta.js";

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

test("stampOdd marks the rows that run something other than the project's usual agent and model", () => {
  const rows = [
    { id: 1, program: "claude", model: "opus" },
    { id: 2, program: "claude", model: "opus", effort: "high" },
    { id: 3, program: "claude", model: "sonnet" },
    { id: 4, program: "node", launch: { harness: "codex" }, model: "" },
  ];
  stampOdd(rows);
  assert.deepEqual(
    rows.map((r) => r.metaOdd),
    [false, false, true, true],
    "effort alone is not odd",
  );
});

test("stampOdd: a tie goes to the first met, 'default' and a missing model are the same, one row is its own usual", () => {
  const rows = [{ program: "claude" }, { program: "codex" }, { program: "Claude", model: "default" }];
  stampOdd(rows);
  assert.deepEqual(
    rows.map((r) => r.metaOdd),
    [false, true, false],
  );
  const tie = [{ program: "codex" }, { program: "claude" }];
  stampOdd(tie);
  assert.deepEqual(
    tie.map((r) => r.metaOdd),
    [false, true],
  );
  const one = [{ program: "pi" }];
  stampOdd(one);
  assert.equal(one[0].metaOdd, false);
  assert.doesNotThrow(() => stampOdd([]));
});
