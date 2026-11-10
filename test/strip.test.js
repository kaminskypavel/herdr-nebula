import test from "node:test";
import assert from "node:assert/strict";
import { stripParts, needText } from "../mods/nebula/lib/strip.js";

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
