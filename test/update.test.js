import test from "node:test";
import assert from "node:assert/strict";
import { updateState, updateNotice, shouldNotify, parseCheck } from "../mods/nebula/lib/update.js";

test("an installed copy behind main has an update; one with its own changes is left to git", () => {
  assert.equal(updateState({ behind: 3 }), "available");
  assert.equal(updateState({ behind: 0 }), "current");
  assert.equal(updateState({ behind: 3, dirty: true }), "local");
  assert.equal(updateState({ behind: 3, ahead: 1 }), "local");
  assert.equal(updateState({ behind: 3, branch: "feat/x" }), "local");
  assert.equal(updateState({ behind: 0, dirty: true }), "current");
});

test("the popup names the changes and runs nebula.update on click; a local copy gets a plain notice", () => {
  const n = updateNotice({ behind: 2, subjects: ["feat: motion", "fix: x"], latest: "abc", latestVersion: "v0.2.0" });
  assert.equal(n.title, "herdr-nebula v0.2.0 is ready");
  assert.equal(n.body, "2 changes · feat: motion");
  assert.deepEqual(
    n.actions.map((a) => [a.label, a.name, Boolean(a.primary)]),
    [
      ["Update", "nebula.update", true],
      ["What changed", "nebula.changes", false],
    ],
  );
  assert.equal(updateNotice({ behind: 1, latest: "abc" }).title, "herdr-nebula update is ready");
  // commits pushed after a release, with no newer tag: not "v0.1.0 is ready" to someone on v0.1.0
  assert.equal(updateNotice({ behind: 1, latest: "abc", version: "v0.1.0-2-g1234abc", latestVersion: "v0.1.0" }).title, "herdr-nebula update is ready");
  assert.equal(updateNotice({ behind: 1, latest: "abc", version: "v0.1.0", latestVersion: "v0.1.0" }).title, "herdr-nebula update is ready");
  assert.equal(updateNotice({ behind: 1, dirty: true }).action, undefined);
  assert.equal(updateNotice({ behind: 0 }), null);
});

test("each new latest commit notifies once", () => {
  const r = { behind: 1, latest: "abc" };
  assert.equal(shouldNotify(r, null), true);
  assert.equal(shouldNotify(r, "abc"), false);
  assert.equal(shouldNotify({ behind: 0, latest: "abc" }, null), false);
});

test("git's outputs become the report", () => {
  assert.deepEqual(
    parseCheck({ counts: "3\t1\n", status: " M x\n", branch: "main\n", head: "aaa\n", latest: "bbb\n", log: "one\ntwo\n", version: "v0.1.0-2-gaaa\n" }),
    {
      behind: 3,
      ahead: 1,
      dirty: true,
      branch: "main",
      head: "aaa",
      latest: "bbb",
      version: "v0.1.0-2-gaaa",
      subjects: ["one", "two"],
    },
  );
});

test("Settings says where the copy stands; the shell's JSON line is found among rc noise", async () => {
  const { updateLine, reportIn } = await import("../mods/nebula/lib/update.js");
  assert.equal(updateLine(null), "Not checked yet");
  assert.equal(updateLine({ behind: 0, head: "aaa" }), "Up to date (aaa)");
  assert.equal(updateLine({ behind: 0, head: "aaa", version: "v0.1.0" }), "Up to date (v0.1.0)");
  assert.equal(updateLine({ behind: 2, head: "aaa", latest: "bbb" }), "2 new changes (aaa to bbb)");
  assert.equal(updateLine({ behind: 1, dirty: true }), "1 new on GitHub; your copy has its own changes, pull with git");
  assert.deepEqual(reportIn('welcome\n{"behind":1}\n'), { behind: 1 });
  assert.deepEqual(reportIn('\u001b]1337;CurrentDir=/tmp\u0007{"behind":2}'), { behind: 2 });
  assert.equal(reportIn("nothing"), null);
});

test("the notes since the installed version come from the CHANGELOG, newest first", async () => {
  const { notesSince, notesOf, updatedNotice } = await import("../mods/nebula/lib/update.js");
  const log = "# Changelog\n\n## v0.3.0 (2026-12-01)\n\n- three\n\n## v0.2.0 (2026-11-20)\n\n- two\n\n## v0.1.0 (2026-11-10)\n\n- one\n";
  assert.deepEqual(notesSince(log, "v0.1.0"), [
    { version: "v0.3.0", text: "- three" },
    { version: "v0.2.0", text: "- two" },
  ]);
  assert.deepEqual(
    notesSince(log, "v0.2.0-4-gabc").map((x) => x.version),
    ["v0.3.0"],
  );
  assert.deepEqual(
    notesSince(log, "abc1234").map((x) => x.version),
    ["v0.3.0"],
  );
  assert.equal(notesOf(log, "v0.2.0-1-gdef"), "- two");
  assert.equal(notesOf(log, "abc"), null);
  assert.equal(updatedNotice({ version: "v0.2.0" }).title, "herdr-nebula updated to v0.2.0");
  assert.equal(updatedNotice({ version: "v0.2.0-3-gabc1234" }).title, "herdr-nebula updated to v0.2.0");
  const { releasedSince } = await import("../mods/nebula/lib/update.js");
  assert.equal(releasedSince("v0.1.0", { version: "v0.1.0-12-g50486a5" }), false, "commits after a release are no update to announce");
  assert.equal(releasedSince("v0.1.0", { version: "v0.2.0" }), true);
  assert.equal(releasedSince(null, { version: "v0.2.0" }), false, "first run: nothing to compare");
});

test("a CHANGELOG section becomes headings, bullets and text for the What changed pane", async () => {
  const { noteLines } = await import("../mods/nebula/lib/update.js");
  assert.deepEqual(noteLines("### Board\n![shot](https://x/a.png)\n<!-- slot -->\n- a `code` thing\nplain"), [
    { kind: "head", text: "Board" },
    { kind: "item", text: "a code thing" },
    { kind: "text", text: "plain" },
  ]);
});
