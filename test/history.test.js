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

test("a closed Herdr session becomes a history entry, newest first, one per conversation", async () => {
  const { closedEntry, addToHistory } = await import("../mods/nebula/lib/history.js");
  const row = { title: "Libby SEO Keyword Research", cwd: "/r/libby", launch: '{"model":"opus","effort":"high"}', said: "Two things.", prompt: "" };
  const e = closedEntry({ row, repo: { name: "libby", root: "/r/libby" }, band: { path: "/r/libby", branch: "master" }, claude: "c1" });
  assert.deepEqual(
    { id: e.id, source: e.source, name: e.name, worktree: e.worktree, claude: e.claude, model: e.model, effort: e.effort, summary: e.summary },
    {
      id: "herdr:c1",
      source: "herdr",
      name: "Libby SEO Keyword Research",
      worktree: "/r/libby",
      claude: "c1",
      model: "opus",
      effort: "high",
      summary: "Two things.",
    },
  );
  assert.equal(closedEntry({ row: { ...row, launch: { model: "sonnet" } }, repo: null, band: null, claude: "c2" }).model, "sonnet", "launch already parsed");
  const list = addToHistory([{ id: "herdr:c1", name: "old" }, { id: "nebula:x" }], e);
  assert.deepEqual(
    list.map((x) => x.id),
    ["herdr:c1", "nebula:x"],
  );
  assert.equal(list[0].name, "Libby SEO Keyword Research");
  assert.equal(
    addToHistory(
      Array.from({ length: 5 }, (_, i) => ({ id: String(i) })),
      e,
      3,
    ).length,
    3,
  );
});
