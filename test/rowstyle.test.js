import test from "node:test";
import assert from "node:assert/strict";
import { rowLook } from "../mods/nebula/lib/rowstyle.js";

const row = (extra) => ({ status: "working", age: "4m", ...extra });

test("a row that needs you is red, says so on the right and has a bar", () => {
  assert.deepEqual(rowLook(row({ status: "needs" })), { title: "needs", ageText: "needs you", ageTone: "needs", bar: "needs" });
});

test("an unseen finish is bold with a cyan age; a seen one is muted; a working one is plain", () => {
  assert.deepEqual(rowLook(row({ status: "unseen" })), { title: "unseen", ageText: "4m", ageTone: "unseen", bar: null });
  assert.deepEqual(rowLook(row({ status: "seen" })), { title: "seen", ageText: "4m", ageTone: "plain", bar: null });
  assert.deepEqual(rowLook(row({ status: "working" })), { title: "plain", ageText: "4m", ageTone: "plain", bar: null });
});

test("exited, archived and nebula rows keep the dim look whatever their status says", () => {
  for (const extra of [
    { exited: true, status: "exited" },
    { archived: true, status: "needs" },
    { kind: "nebula", status: "exited", exited: true },
  ]) {
    const look = rowLook(row(extra));
    assert.equal(look.title, "dim");
    assert.equal(look.ageText, "4m");
    assert.equal(look.bar, null);
  }
});

test("a row with no age still has text", () => {
  assert.equal(rowLook({ status: "seen" }).ageText, "");
});
