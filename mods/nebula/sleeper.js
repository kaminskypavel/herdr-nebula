// Puts one agent to sleep: its CLI exits, its terminal stays as a shell and is marked
// nebula.asleep. The rail's sweep and the board's `z` both call it. The order of steps and
// the grace are in lib/sleep.js (sleepAgent); this file only wires them to hc.
import { terminals, hc } from "herdr";
import { ASLEEP } from "./lib/labels.js";
import { statusOf } from "./lib/status.js";
import { sleepAgent } from "./lib/sleep.js";

const busy = new Set();

/** The terminal is gone, or its program is a shell again. */
export const hasExited = (address) => {
  const t = terminals().find((x) => x.address === address);
  return !t || statusOf(t) === "exited";
};

/** -> "asleep" | "gone" | "stuck" | "busy". `cx` is the task's context (its timer is the wait). */
export async function putToSleep(address, cx) {
  if (busy.has(address)) return "busy";
  busy.add(address);
  try {
    return await sleepAgent({
      exited: () => hasExited(address),
      send: (text) => hc(["send", address, text]),
      keys: (...keys) => hc(["keys", address, ...keys]),
      mark: () => hc(["label", address, `${ASLEEP}=1`]),
      wait: (ms) => new Promise((done) => cx.timer.after(ms, () => done(undefined))),
    });
  } finally {
    busy.delete(address);
  }
}
