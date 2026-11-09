import { test } from "node:test";
import assert from "node:assert/strict";
import { statusTarget } from "../mods/nebula/lib/repos.js";

const repos = [{ root: "/r", name: "r", checkouts: [{ path: "/r", branch: "main" }] }];
const term = (address, status) => ({ address, cwd: "/r", status, state: "live" });

test("a rail count shows the next session in that state, then wraps", () => {
  const ts = [term("a", "done"), term("b", "working"), term("c", "done")];
  const first = statusTarget(ts, repos, "/r", "unseen", null);
  const second = statusTarget(ts, repos, "/r", "unseen", first);
  assert.notEqual(first, null);
  assert.notEqual(first, second);
  assert.equal(statusTarget(ts, repos, "/r", "unseen", second), first);
  assert.equal(statusTarget(ts, repos, "/r", "needs", null), null);
  assert.equal(statusTarget(ts, repos, "/other", "unseen", null), null);
});
