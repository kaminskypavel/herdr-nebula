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
