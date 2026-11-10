import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePorts, portsLabel, portUrl } from "../mods/nebula/lib/ports.js";
import { actionsFor } from "../mods/nebula/lib/actions.js";

test("ports group by terminal, sorted, IPv4 and IPv6 counted once", () => {
  assert.deepEqual(parsePorts("t20 5173\nt20 3000\nt20 3000\nt7 8080\n\nnoise\nt9 70000\n"), { t20: [3000, 5173], t7: [8080] });
  assert.deepEqual(parsePorts(""), {});
});

test("a row shows the first three ports, then +N", () => {
  assert.equal(portsLabel([3000]), ":3000");
  assert.equal(portsLabel([1, 2, 3, 4, 5]), ":1 :2 :3 +2");
  assert.equal(portsLabel([]), "");
  assert.equal(portUrl(3000), "http://localhost:3000");
});

test("the row menu offers Open localhost:<port> first, the rest after a line", () => {
  const list = actionsFor({ address: "t1", tab: "x", ports: [3000] }, false);
  assert.equal(list[0].id, "port:3000");
  assert.equal(list[0].label, "Open localhost:3000");
  assert.equal(list[1].sep, true);
  assert.equal(actionsFor({ address: "t1", tab: "x" }, false)[0].id, "sleep");
});

test("a click on a row finds the port cell it hit, counting from the right edge", async () => {
  const { portAt } = await import("../mods/nebula/lib/ports.js");
  const hit = { inset: 18, width: 42, gap: 4, shown: 3 };
  assert.equal(portAt([3000], 10, hit), null); // in the row's right padding
  assert.equal(portAt([3000], 30, hit), 3000);
  assert.equal(portAt([3000], 70, hit), null); // left of the only cell: the row itself
  assert.equal(portAt([3000, 5173], 30, hit), 5173); // the rightmost cell holds the last port
  assert.equal(portAt([3000, 5173], 80, hit), 3000);
  assert.equal(portAt([3000, 5173], 62, hit), null); // in the gap
  assert.equal(portAt([], 30, hit), null);
});
