import test from "node:test";
import assert from "node:assert/strict";
import { upNext, readsDue, mergeReplies, MORE_TITLES } from "../mods/nebula/lib/upnext.js";
import { clearKey, waitingRows } from "../mods/nebula/lib/waiting.js";
import { saidBy, stampTask, TASK_MAX } from "../mods/nebula/lib/rowmeta.js";

/** @returns {any} */
const row = (id, status, changedAt, extra = {}) => ({
  id,
  kind: "agent",
  title: id,
  status,
  changedAt,
  stateSince: changedAt,
  archived: false,
  exited: false,
  age: "2m",
  prompt: "",
  said: "",
  ...extra,
});
const model = (...rows) => ({ repos: [{ name: "api", root: "/r/api", rows }] });

test("nothing waiting: no card", () => {
  assert.equal(upNext(waitingRows(model(row("a", "seen", 1), row("b", "working", 2)), {})), null);
});

test("the card is the first of the queue: what it says, what follows, and the counts", () => {
  const rows = [row("a", "unseen", 100, { title: "Fix login" }), row("b", "needs", 50, { title: "Add retry", prompt: "add a retry" })];
  const u = upNext(waitingRows(model(...rows), {}));
  assert.equal(u.title, "Add retry");
  assert.deepEqual(u.subtitle, [
    { text: "api", tone: "plain" },
    { text: "asks you", tone: "needs" },
    { text: "2m", tone: "plain" },
  ]);
  assert.equal(u.line, "› add a retry", "until read, the last prompt");
  assert.deepEqual([u.more, u.moreTitles, u.needs, u.unseen], [1, ["Fix login"], 1, 1]);
});

test("a finished row's card says finished and quotes the agent once read; the more-line stops at three titles", () => {
  const rows = ["a", "b", "c", "d", "e"].map((id, i) => row(id, "unseen", 100 - i, { title: `T${id}`, said: id === "a" ? "Done: all green." : "" }));
  const u = upNext(waitingRows(model(...rows), {}));
  assert.equal(u.subtitle[1].text, "finished");
  assert.equal(u.line, "Done: all green.");
  assert.equal(u.more, 4);
  assert.equal(u.moreTitles.length, MORE_TITLES);
});

test("a cleared row is out of the queue and the card moves on", () => {
  const a = row("a", "needs", 100),
    b = row("b", "needs", 50);
  assert.equal(upNext(waitingRows(model(a, b), { a: clearKey(a) })).item.row.id, "b");
});

test("saidBy quotes a reply only for the state it was read in", () => {
  const r = row("a", "needs", 100);
  const replies = { a: { key: clearKey(r), line: "Which db?" } };
  assert.equal(saidBy(replies, r), "Which db?");
  assert.equal(saidBy(replies, { ...r, changedAt: 200 }), "", "the state moved on");
  assert.equal(saidBy(replies, { ...r, status: "seen" }), "");
  assert.equal(saidBy({}, r), "");
});

test("readsDue: waiting rows with a conversation whose reply is missing or for an older state", () => {
  const a = row("a", "needs", 100, { session: "claude:abc-1" }),
    b = row("b", "unseen", 90, { session: "codex:def2" }),
    c = row("c", "unseen", 80),
    d = row("d", "unseen", 70, { session: "claude:ghi3" });
  const queue = waitingRows(model(a, b, c, d), {});
  const replies = { d: { key: clearKey(d), line: "ok" }, a: { key: "needs:1", line: "old" } };
  assert.deepEqual(
    readsDue(queue, replies).map((x) => [x.id, x.key, x.s.app]),
    [
      ["a", "needs:100", "claude"],
      ["b", "unseen:90", "codex"],
    ],
  );
});

test("mergeReplies adds the new lines and drops the rows that are gone", () => {
  assert.deepEqual(mergeReplies({ a: { key: "k", line: "x" }, z: { key: "k", line: "y" } }, { b: { key: "k2", line: "" } }, ["a", "b"]), {
    a: { key: "k", line: "x" },
    b: { key: "k2", line: "" },
  });
});

test("a session named like its project shows its task instead, cut to 48", () => {
  const long = "x".repeat(60);
  const rows = [
    row("a", "seen", 1, { title: " API ", prompt: "wire the retry" }),
    row("b", "seen", 1, { title: "api", prompt: long }),
    row("c", "seen", 1, { title: "api", prompt: "" }),
    row("d", "seen", 1, { title: "Fix login", prompt: "wire it" }),
  ];
  stampTask(rows, "api");
  assert.equal(rows[0].title, "wire the retry");
  assert.equal(rows[0].taskTitle, true);
  assert.equal(rows[0].tabName, " API ");
  assert.equal(rows[1].title.length, TASK_MAX);
  assert.ok(rows[1].title.endsWith("…"));
  assert.deepEqual([rows[2].title, rows[3].title], ["api", "Fix login"], "no task, or a real name: unchanged");
});
