import test from "node:test";
import assert from "node:assert/strict";
import {
  setReduceMotion,
  reduced,
  animate,
  STAR,
  STAR_MS,
  BOB,
  SPRING,
  POP,
  markerTops,
  trackEntering,
  enterPhase,
  hudPhase,
} from "../mods/nebula/lib/motion.js";
import { setTextScale } from "../mods/nebula/lib/scale.js";
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

test("the working spinner is Claude Code's six stars, one frame about every 110 ms", () => {
  assert.deepEqual(STAR, ["·", "✢", "✳", "✶", "✻", "✽"]);
  assert.equal(STAR_MS, 110);
});

test("the agent icon bobs 2px up over 800 ms", () => {
  assert.deepEqual(BOB, { from: 0, to: -2, period: 800 });
});

test("springs settle in about 300 ms without wobble", () => {
  assert.equal(SPRING.response, 300);
  assert.ok(SPRING.damping >= 0.95 && SPRING.damping <= 1);
  assert.ok(POP > 8, "a done dot pops bigger than its 8px");
});

test("the marker sits at each tab's middle, 46 px apart, with the pinned divider between", () => {
  assert.deepEqual(markerTops([]), []);
  assert.deepEqual(markerTops([{ pinned: false }, { pinned: false }, { pinned: false }]), [13, 59, 105]);
  assert.deepEqual(markerTops([{ pinned: true }, { pinned: true }, { pinned: false }, { pinned: false }]), [13, 59, 114, 160]);
  assert.deepEqual(markerTops([{ pinned: true }, { pinned: true }]), [13, 59], "all pinned: no divider");
  assert.deepEqual(markerTops([{ pinned: false }, { pinned: true }]), [13, 59], "a divider only after the last pin");
});

test("a row first seen enters: drawn at its start, then at rest, then forgotten", () => {
  let st = trackEntering(null, [], 0);
  assert.equal(st, null, "no rows yet: nothing is decided");
  st = trackEntering(st, ["a", "b"], 100);
  assert.equal(enterPhase(st, 100).size, 0, "the rows a started board has are not new");
  st = trackEntering(st, ["a", "b", "c"], 200);
  assert.deepEqual([...enterPhase(st, 200)], [["c", "from"]]);
  assert.deepEqual([...enterPhase(st, 260)], [["c", "to"]]);
  st = trackEntering(st, ["a", "b", "c"], 260);
  assert.deepEqual([...enterPhase(st, 260)], [["c", "to"]], "still entering on the next look");
  st = trackEntering(st, ["a", "b", "c"], 700);
  assert.equal(enterPhase(st, 700).size, 0, "settled");
});

test("a row that goes and comes back enters again; one that goes mid-entry is dropped", () => {
  let st = trackEntering(null, ["a"], 0);
  st = trackEntering(st, ["a", "b"], 100);
  st = trackEntering(st, ["a"], 150);
  assert.equal(enterPhase(st, 150).size, 0, "gone while entering");
  st = trackEntering(st, ["a"], 200);
  st = trackEntering(st, ["a", "b"], 300);
  assert.deepEqual([...enterPhase(st, 300)], [["b", "from"]], "back: new again");
});

test("the project flash starts low and invisible, rests, and fades out before the rail closes it at 900 ms", () => {
  assert.deepEqual([0, 59, 60, 400, 699, 700, 899].map(hudPhase), [0, 0, 1, 1, 1, 2, 2]);
});
