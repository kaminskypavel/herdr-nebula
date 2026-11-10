import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { shq, focusShell, notifierArgs, osascriptArgs, parseTools, fallbackLine, BUNDLE } from "../mods/nebula/lib/notify.js";

test("shq makes one shell word, even around quotes", () => {
  for (const s of ["plain", "it's", `say "hi" $HOME \`x\``, "a'b'c", "", "two  words"]) {
    assert.equal(execFileSync("/bin/sh", ["-c", `printf %s ${shq(s)}`], { encoding: "utf8" }), s);
  }
});

test("a click runs herdr-app against the window's home for that terminal, quoted", () => {
  const cmd = focusShell({ home: "/Users/o'neil/.config/herdr-app", bin: "/opt/my tools/herdr-app", terminal: "t1" });
  assert.equal(cmd, `HERDR_APP_HOME='/Users/o'\\''neil/.config/herdr-app' '/opt/my tools/herdr-app' do agent.focus '{"terminal":"t1"}'`);
});

test("terminal-notifier gets the title, message, group, activation and the click command; a quote in the title survives", () => {
  const args = notifierArgs({
    title: `it's "api" \u00b7 fix`,
    message: "Which branch?\nmain or dev",
    group: "t1",
    home: "/h",
    bin: "/b/herdr-app",
    terminal: "t1",
  });
  assert.deepEqual(args, [
    "-title",
    `it's "api" \u00b7 fix`,
    "-message",
    "Which branch? main or dev",
    "-group",
    "t1",
    "-activate",
    BUNDLE,
    "-execute",
    `HERDR_APP_HOME='/h' '/b/herdr-app' do agent.focus '{"terminal":"t1"}'`,
  ]);
});

test("osascript's string literals escape quotes and backslashes", () => {
  assert.deepEqual(osascriptArgs(`a "b" c`, `d\\e "f"`), ["-e", `display notification "d\\\\e \\"f\\"" with title "a \\"b\\" c"`]);
});

test("the tool paths are read from the login shell's output, missing ones are null", () => {
  assert.deepEqual(parseTools("noise\nherdr-app=/Users/me/.local/bin/herdr-app\nterminal-notifier=/opt/homebrew/bin/terminal-notifier\n"), {
    herdr: "/Users/me/.local/bin/herdr-app",
    notifier: "/opt/homebrew/bin/terminal-notifier",
  });
  assert.deepEqual(parseTools("herdr-app=\nterminal-notifier=\n"), { herdr: null, notifier: null });
  assert.equal(fallbackLine("needs"), "needs you");
  assert.equal(fallbackLine("unseen"), "finished");
});

test("any Herdr window in front counts as front; other apps and the lock screen do not", async () => {
  const { herdrInFront, notifiedLock } = await import("../mods/nebula/lib/notify.js");
  assert.equal(herdrInFront('"CFBundleIdentifier"="dev.herdr.app"'), true);
  assert.equal(herdrInFront('bundleID="com.apple.loginwindow"'), false);
  assert.equal(herdrInFront(""), false);
  assert.equal(notifiedLock("t7", "unseen:123"), "/tmp/herdr-nebula-notified/t7-unseen_123");
  assert.equal(notifiedLock("../x", "a b").includes(".."), false);
});
