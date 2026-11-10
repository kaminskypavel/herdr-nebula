import test from "node:test";
import assert from "node:assert/strict";
import { installedEditors, openIn, defaultOpen, editorItems } from "../mods/nebula/lib/editors.js";
import { actionsFor } from "../mods/nebula/lib/actions.js";

const ls = "Safari.app\nVisual Studio Code.app\nZed.app\nXcode.app\n";

test("installed editors come in preference order, Finder last", () => {
  assert.deepEqual(
    installedEditors(ls).map((e) => e.id),
    ["zed", "vscode", "xcode", "finder"],
  );
  assert.deepEqual(
    installedEditors("").map((e) => e.id),
    ["finder"],
  );
});

test("each editor opens through open -a; Finder reveals; a custom Settings command wins for ⇧↩", () => {
  assert.deepEqual(openIn("vscode", "/w/app"), { cmd: "open", args: ["-a", "Visual Studio Code", "/w/app"] });
  assert.deepEqual(openIn("finder", "/w/app"), { cmd: "open", args: ["-R", "/w/app"] });
  assert.equal(openIn("nope", "/w"), null);
  const eds = installedEditors(ls);
  assert.deepEqual(defaultOpen("open", eds, "/w/app"), { cmd: "open", args: ["-a", "Zed", "/w/app"] });
  assert.deepEqual(defaultOpen("code -n", eds, "/w/app"), { cmd: "code", args: ["-n", "/w/app"] });
  assert.deepEqual(defaultOpen("", [], "/w/app"), { cmd: "open", args: ["-R", "/w/app"] });
});

test("the row menu lists one Open in item per installed editor, the first with ⇧↩", () => {
  const items = editorItems(installedEditors(ls));
  assert.deepEqual(
    items.map((i) => [i.label, i.key]),
    [
      ["Open in Zed", "⇧↩"],
      ["Open in VS Code", ""],
      ["Open in Xcode", ""],
      ["Reveal in Finder", ""],
    ],
  );
  const labels = actionsFor({ address: "t1", tab: "x", editors: installedEditors(ls) }, false).map((a) => a.label);
  assert.ok(labels.includes("Open in Zed") && !labels.includes("Open folder in editor"));
});
