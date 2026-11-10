import test from "node:test";
import assert from "node:assert/strict";
import { group, nextVersion, section, insertSection, notesFor } from "../scripts/release-lib.mjs";

const subjects = [
  "docs: CHANGELOG for v0.1.0",
  "feat(rail): drag a project icon to reorder it",
  "fix(box): the task field scrolls",
  "test: the icon bar's focus rule",
  "feat: one New session key",
  "perf(board): fewer renders",
];

test("features and fixes become the notes, oldest first, by area; docs and tests stay out", () => {
  assert.deepEqual(group(subjects), {
    Performance: ["Board: Fewer renders"],
    Features: ["One New session key", "Icon bar: Drag a project icon to reorder it"],
    Fixes: ["New session: The task field scrolls"],
  });
});

test("a release with features steps the minor version, one with only fixes the patch", () => {
  assert.equal(nextVersion("0.1.0", { Features: ["x"] }), "0.2.0");
  assert.equal(nextVersion("0.1.3", { Fixes: ["x"] }), "0.1.4");
  assert.equal(nextVersion("", {}), "0.0.1");
});

test("a section goes on top of the CHANGELOG and can be read back for the release", () => {
  const sec = section("0.2.0", "2026-11-20", group(subjects));
  assert.match(sec, /^## v0\.2\.0 \(2026-11-20\)\n\n### Features\n- One New session key\n/);
  const log = insertSection("# Changelog\n\n## v0.1.0 (2026-11-10)\n\n- first\n", sec);
  assert.ok(log.indexOf("## v0.2.0") < log.indexOf("## v0.1.0"));
  assert.equal(notesFor(log, "v0.1.0"), "- first");
  assert.match(notesFor(log, "0.2.0"), /^### Features/);
  assert.equal(notesFor(log, "v9.9.9"), null);
});
