import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "herdr-nebula.mjs");

// A temp HOME with a main Herdr home, a fake app binary (status exits `status`), and a second home path.
function world(status = 1) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hn-win-"));
  const home = path.join(dir, "home");
  const main = path.join(home, ".config", "herdr-app");
  const put = (f, text) => {
    fs.mkdirSync(path.dirname(path.join(main, f)), { recursive: true });
    fs.writeFileSync(path.join(main, f), text);
  };
  for (const f of [
    "layouts/a.json",
    "mods/m/index.js",
    "themes/t.json",
    "icons/i.svg",
    "keys.json",
    "settings.json",
    "shared.json",
    "herdr-app.sock",
    "data/x",
    "view.json",
    "window.json",
    "windows.json",
    "telemetry/t",
  ])
    put(f, f);
  const app = path.join(dir, "Herdr");
  fs.writeFileSync(app, `#!/bin/sh\n[ "$1" = status ] && exit ${status}\nexit 0\n`, { mode: 0o755 });
  const home2 = path.join(dir, "home2");
  const run = (env = {}) =>
    spawnSync(process.execPath, [CLI, "window"], {
      encoding: "utf8",
      env: { PATH: process.env.PATH, HOME: home, HERDR_NEBULA_WINDOW_HOME: home2, HERDR_NEBULA_WINDOW_APP: app, HERDR_NEBULA_WINDOW_DRY: "1", ...env },
    });
  return { main, home2, run };
}

test("window copies the shared config and skips per-window state", () => {
  const w = world();
  assert.equal(w.run().status, 0);
  for (const f of ["layouts/a.json", "mods/m/index.js", "themes/t.json", "icons/i.svg", "keys.json", "settings.json", "shared.json"]) {
    assert.equal(fs.readFileSync(path.join(w.home2, f), "utf8"), f);
  }
  for (const f of ["herdr-app.sock", "data", "view.json", "window.json", "windows.json", "telemetry"]) {
    assert.equal(fs.existsSync(path.join(w.home2, f)), false, f);
  }
});

test("window copies shared.json only the first time, but refreshes the rest", () => {
  const w = world();
  w.run();
  fs.writeFileSync(path.join(w.home2, "shared.json"), "mine");
  fs.writeFileSync(path.join(w.main, "shared.json"), "new main");
  fs.writeFileSync(path.join(w.main, "settings.json"), "new settings");
  w.run();
  assert.equal(fs.readFileSync(path.join(w.home2, "shared.json"), "utf8"), "mine");
  assert.equal(fs.readFileSync(path.join(w.home2, "settings.json"), "utf8"), "new settings");
});

test("window prints a clean-env launch command", () => {
  const r = world().run();
  assert.match(r.stdout, /^env -i /);
  assert.match(r.stdout, / HERDR_APP_HOME=\S+home2 /);
  assert.match(r.stdout, / HERDR_APP_ID=dev\.herdr\.app2 /);
  assert.doesNotMatch(r.stdout, /CLAUDE/);
});

test("window does not launch a second copy when the first answers", () => {
  const r = world(0).run();
  assert.equal(r.stdout.trim(), "Second window is already open.");
});

test("window fails with a message when the app is missing", () => {
  const r = world().run({ HERDR_NEBULA_WINDOW_APP: "/nonexistent/Herdr" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Herdr app not found/);
});

test("window finds herdr-app on PATH when no app is named", () => {
  const w = world();
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "hn-win-bin-"));
  fs.symlinkSync(path.join(path.dirname(w.main), "..", "..", "Herdr"), path.join(bin, "herdr-app"));
  const r = w.run({ HERDR_NEBULA_WINDOW_APP: "", PATH: `${bin}:${process.env.PATH}` });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^env -i /);
});
