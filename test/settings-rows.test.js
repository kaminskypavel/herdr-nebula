import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Each tab's rows are drawn by hand in the dialog's render; a key listed in TABS but never drawn is a setting the
// user cannot see (General was, the day it was added).
test("every setting the Settings tabs list is drawn in its tab", () => {
  const src = readFileSync(new URL("../mods/nebula-box/settings.js", import.meta.url), "utf8");
  const tabs = src.slice(src.indexOf("const TABS = ["), src.indexOf("];", src.indexOf("const TABS = [")));
  const keys = [...tabs.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]).filter((k) => !/^[A-Z]/.test(k));
  const special = new Set(["import", "update"]); // drawn as buttons by name
  for (const k of keys.filter((k) => !special.has(k)))
    assert.ok(src.includes(`toggle("${k}")`) || src.includes(`at("${k}")`), `${k} is in TABS but no row draws it`);
});
