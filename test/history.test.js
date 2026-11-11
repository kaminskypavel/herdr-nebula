import test from "node:test";
import assert from "node:assert/strict";
import { parseHistory, readNebulaSessions } from "../mods/nebula/lib/history.js";

test("the history file is a list; anything else is none", () => {
  assert.deepEqual(parseHistory('[{"id":"a"}]'), [{ id: "a" }]);
  assert.equal(parseHistory("{}"), null);
  assert.equal(parseHistory(""), null);
});

test("nebula that can't be read gives no list (the copy-once then stores an empty one)", async () => {
  const fail = async () => ({ code: 1, stdout: "", stderr: "" });
  assert.equal(await readNebulaSessions(fail, "/h"), null);
  const missing = async () => {
    throw new Error("no such file");
  };
  assert.equal(await readNebulaSessions(missing, "/h"), null);
});
