import test from "node:test";
import assert from "node:assert/strict";
import { setReduceMotion, reduced, animate } from "../mods/nebula/lib/motion.js";
import { mergeSettings, DEFAULTS } from "../mods/nebula/lib/settings.js";

// A stand-in element: records the calls made on it.
const el = () => {
  const calls = [];
  const self = {
    calls,
    loop: (...a) => {
      calls.push(["loop", ...a]);
      return self;
    },
  };
  return self;
};

test("Reduce motion is off by default and only a real true turns it on", () => {
  assert.equal(DEFAULTS.reduceMotion, false);
  for (const v of [undefined, null, "yes", 1, {}]) assert.equal(mergeSettings({ reduceMotion: v }).reduceMotion, false);
  assert.equal(mergeSettings({ reduceMotion: true }).reduceMotion, true);
  assert.equal(mergeSettings({}).reduceMotion, false);
});

test("animate applies an animation unless motion is reduced", () => {
  setReduceMotion(false);
  assert.equal(reduced(), false);
  const on = animate(el(), (e) => e.loop("opacity", {}));
  assert.equal(on.calls.length, 1);
  assert.equal(setReduceMotion(true), true);
  assert.equal(reduced(), true);
  const still = el();
  assert.equal(
    animate(still, (e) => e.loop("opacity", {})),
    still,
  );
  assert.equal(still.calls.length, 0, "a still look: nothing is added");
  setReduceMotion("true");
  assert.equal(reduced(), false, "anything but true is motion on");
});
