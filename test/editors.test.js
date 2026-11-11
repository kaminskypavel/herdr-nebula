import test from "node:test";
import assert from "node:assert/strict";
import { installedEditors, openIn, defaultOpen, editorItems, chosenEditor, withIcons, iconArgs } from "../mods/nebula/lib/editors.js";
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

test("each editor opens through open -a; Finder reveals; the Settings pick (or an old command) wins for ⇧↩", () => {
  assert.deepEqual(openIn("vscode", "/w/app"), { cmd: "open", args: ["-a", "Visual Studio Code", "/w/app"] });
  assert.deepEqual(openIn("finder", "/w/app"), { cmd: "open", args: ["-R", "/w/app"] });
  assert.equal(openIn("nope", "/w"), null);
  const eds = installedEditors(ls);
  assert.deepEqual(defaultOpen("open", eds, "/w/app"), { cmd: "open", args: ["-a", "Zed", "/w/app"] }, "open: the first installed");
  assert.deepEqual(defaultOpen("xcode", eds, "/w/app"), { cmd: "open", args: ["-a", "Xcode", "/w/app"] });
  assert.deepEqual(defaultOpen("code", eds, "/w/app"), { cmd: "open", args: ["-a", "Visual Studio Code", "/w/app"] }, "an old command names its editor");
  assert.deepEqual(defaultOpen("code -n", eds, "/w/app"), { cmd: "code", args: ["-n", "/w/app"] }, "an unknown command runs as before");
  assert.deepEqual(defaultOpen("", [], "/w/app"), { cmd: "open", args: ["-R", "/w/app"] });
});

test("the row menu has one Open in item for the picked editor (⇧↩) and Reveal in Finder, with icons", () => {
  const eds = withIcons(installedEditors(ls), "zed\nfinder\n");
  assert.deepEqual(
    editorItems(eds, "open").map((i) => [i.label, i.key, i.icon]),
    [
      ["Open in Zed", "⇧↩", "nebula-cache/app-icons/zed.png"],
      ["Reveal in Finder", "", "nebula-cache/app-icons/finder.png"],
    ],
  );
  assert.equal(editorItems(eds, "vscode")[0].label, "Open in VS Code");
  assert.equal(editorItems(eds, "vscode")[0].icon, "mods/nebula/icons/square-code.svg", "no app icon found: a plain one");
  assert.deepEqual(
    editorItems(eds, "finder").map((i) => [i.label, i.key]),
    [["Reveal in Finder", "⇧↩"]],
  );
  const labels = actionsFor({ address: "t1", tab: "x", editors: eds, editor: "xcode" }, false).map((a) => a.label);
  assert.ok(labels.includes("Open in Xcode") && !labels.includes("Open in Zed") && !labels.includes("Open folder in editor"));
});

test("the icon script gets id=app pairs, Finder by its system path", () => {
  assert.deepEqual(iconArgs(installedEditors("Zed.app\n")), ["zed=Zed", "finder=/System/Library/CoreServices/Finder"]);
  assert.equal(chosenEditor("weird-cmd --x", installedEditors(ls)).id, "custom");
});
