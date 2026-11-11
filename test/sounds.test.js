import test from "node:test";
import assert from "node:assert/strict";
import { applySound, soundFile, soundPreview } from "../mods/nebula/lib/sounds.js";

const H = "/h";

test("a file sound sets done and blocked and keeps every other key", () => {
  const out = JSON.parse(applySound(JSON.stringify({ zoom: 1.2, sounds: { enabled: false, volume: 3 } }), H, "chirp"));
  assert.deepEqual(out, {
    zoom: 1.2,
    sounds: { enabled: true, volume: 3, done: "/h/mods/nebula/sounds/chirp.mp3", blocked: "/h/mods/nebula/sounds/chirp.mp3" },
  });
});

test("herdr clears the files and stays enabled, off disables", () => {
  const had = JSON.stringify({ sounds: { enabled: true, done: "/x.mp3", blocked: "/y.mp3" } });
  assert.deepEqual(JSON.parse(applySound(had, H, "herdr")), { sounds: { enabled: true } });
  assert.deepEqual(JSON.parse(applySound(had, H, "off")), { sounds: { enabled: false } });
});

test("missing or invalid text counts as empty", () => {
  for (const bad of ["", "{nope", "null", "[1]", "7"]) assert.deepEqual(JSON.parse(applySound(bad, H, "drop")).sounds.enabled, true);
  assert.deepEqual(JSON.parse(applySound("", H, "off")), { sounds: { enabled: false } });
  assert.deepEqual(JSON.parse(applySound('{"sounds":5}', H, "herdr")), { sounds: { enabled: true } });
});

test("the preview is done for herdr, the file for a file sound, nothing for off", () => {
  assert.equal(soundPreview(H, "herdr"), "done");
  assert.equal(soundPreview(H, "ping"), "/h/mods/nebula/sounds/ping.mp3");
  assert.equal(soundPreview(H, "off"), null);
  assert.equal(soundFile(H, "herdr"), null);
});
