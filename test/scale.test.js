import test from "node:test";
import assert from "node:assert/strict";
import { setTextScale, fs, rh } from "../mods/nebula/lib/scale.js";

test("text follows the terminal text size: the 13px base becomes that size", () => {
  assert.equal(setTextScale({ font_size: 13 }), 1);
  assert.equal(fs(13), 13);
  setTextScale({ font_size: 15 });
  assert.equal(fs(13), 15);
  assert.equal(fs(11), 12.5);
  assert.equal(rh(26), 30);
});

test("a missing or bad size leaves the design sizes", () => {
  for (const look of [undefined, {}, { font_size: 0 }, { font_size: "x" }]) {
    setTextScale(look);
    assert.equal(fs(12), 12);
    assert.equal(rh(22), 22);
  }
});

// One type scale for the board and its dialogs: 11, 12, 13 and 15 px. Nothing is smaller than 11.
test("every fs() literal in the board and the box is on the type scale", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const files = ["mods/nebula", "mods/nebula/views", "mods/nebula/lib", "mods/nebula-box"].flatMap((dir) =>
    readdirSync(new URL(`../${dir}/`, import.meta.url))
      .filter((f) => f.endsWith(".js"))
      .map((f) => [`${dir}/${f}`, readFileSync(new URL(`../${dir}/${f}`, import.meta.url), "utf8")]),
  );
  for (const [name, src] of files) {
    for (const m of src.matchAll(/\bfs\((\d+(?:\.\d+)?)\)/g)) assert.ok([11, 12, 13, 15].includes(Number(m[1])), `${name}: fs(${m[1]}) is off the scale`);
  }
});

test("the Text size setting multiplies the terminal's size; an unknown value means 100%", async () => {
  const { setTextScale, fs } = await import("../mods/nebula/lib/scale.js");
  setTextScale({ font_size: 13 }, 125);
  assert.equal(fs(12), 15);
  setTextScale({ font_size: 13 }, 7);
  assert.equal(fs(12), 12);
  setTextScale({ font_size: 13 });
});
