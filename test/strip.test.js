import test from "node:test";
import assert from "node:assert/strict";
import { attentionStrip, stripParts, needText, STRIP_ROWS } from "../mods/nebula/lib/strip.js";

const row = (id, status, extra = {}) => ({ id, title: id, status, changedAt: 0, unseenSince: 0, ...extra });
const repo = (name, rows) => ({ root: `/${name}`, name, rows });

test("needs you come before finished-unseen, each newest first, with the project's name", () => {
  const s = attentionStrip({
    repos: [
      repo("app", [row("a", "unseen", { unseenSince: 50 }), row("b", "needs", { changedAt: 10 })]),
      repo("lib", [row("c", "needs", { changedAt: 30 }), row("d", "working"), row("e", "unseen", { unseenSince: 90 })]),
    ],
  });
  assert.deepEqual(
    s.items.map((i) => [i.row.id, i.project]),
    [
      ["c", "lib"],
      ["b", "app"],
      ["e", "lib"],
    ],
  );
  assert.deepEqual([s.needs, s.unseen, s.more], [2, 2, 1]);
});

test("only the first rows are listed, the rest are counted", () => {
  const rows = ["1", "2", "3", "4", "5"].map((id) => row(id, "needs", { changedAt: Number(id) }));
  const s = attentionStrip({ repos: [repo("app", rows)] });
  assert.equal(s.items.length, STRIP_ROWS);
  assert.equal(s.more, 2);
  assert.equal(s.items[0].row.id, "5");
});

test("archived, exited and nebula rows are not attention, and nothing to show is a zero strip", () => {
  const s = attentionStrip({
    repos: [
      repo("app", [row("a", "needs", { archived: true }), row("b", "exited", { exited: true }), row("c", "unseen", { kind: "nebula" }), row("d", "seen")]),
    ],
  });
  assert.deepEqual(s, { needs: 0, unseen: 0, items: [], more: 0 });
});

test("a tie keeps the model's order", () => {
  const s = attentionStrip({ repos: [repo("app", [row("a", "needs"), row("b", "needs")])] });
  assert.deepEqual(
    s.items.map((i) => i.row.id),
    ["a", "b"],
  );
});

test("the count line names what is there and agrees in number", () => {
  assert.equal(needText(1), "1 needs you");
  assert.equal(needText(2), "2 need you");
  assert.deepEqual(stripParts({ needs: 2, unseen: 1 }, ["⌘] next"]), [
    { text: "2 need you", tone: "needs" },
    { text: "1 done", tone: "unseen" },
    { text: "⌘] next", tone: "plain" },
  ]);
  assert.deepEqual(stripParts({ needs: 0, unseen: 3 }), [{ text: "3 done", tone: "unseen" }]);
  assert.deepEqual(stripParts({ needs: 0, unseen: 0 }), []);
});
