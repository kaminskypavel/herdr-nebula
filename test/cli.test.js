import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(root, "bin", "herdr-nebula.mjs");
const FAKE = path.join(root, "test", "fixtures", "cli", "fake-cli.txt");

// A temp world: fake hc and herdr-app first on PATH, a HOME with Herdr's shared.json, and
// the fake's state file. Nothing here touches the live core, Herdr or ~/.claude.
/** @param {{ labels?: object, tabs?: { id: string, name: string }[], settings?: any, term?: string | null }} [o] */
function world({ labels = {}, tabs = [{ id: "tb1", name: "1" }], settings, term = "t1" } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hn-cli-"));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  for (const tool of ["hc", "herdr-app"]) {
    const f = path.join(bin, tool);
    fs.writeFileSync(f, `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" ${tool} "$@"\n`, { mode: 0o755 });
  }
  const home = path.join(dir, "home");
  const appHome = path.join(home, ".config", "herdr-app");
  fs.mkdirSync(appHome, { recursive: true });
  if (settings !== undefined) fs.writeFileSync(path.join(appHome, "shared.json"), JSON.stringify({ "nebula.settings": settings }));
  const stateFile = path.join(dir, "state.json");
  const state = { labels: { "herdr.tab": "tb1", "herdr.space": "sp1", ...labels }, tabs, calls: [] };
  fs.writeFileSync(stateFile, JSON.stringify(state));
  const env = { PATH: `${bin}:${process.env.PATH}`, HOME: home, FAKE_STATE: stateFile };
  if (term) env.HC_TERMINAL_ID = term;
  return {
    dir,
    home,
    env,
    state: () => JSON.parse(fs.readFileSync(stateFile, "utf8")),
    run: (args, input = "", extraEnv = {}) => spawnSync(process.execPath, [CLI, ...args], { input, env: { ...env, ...extraEnv }, encoding: "utf8" }),
  };
}

const payload = (extra = {}) => JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "fix the login redirect", ...extra });
const reply = (r) => (r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null);
const writeJson = (f, v) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(v, null, 2));
};

// A Claude transcript with a custom-title.json beside it, as /rename leaves it.
function claudeSession(w, customTitle) {
  const transcript = path.join(w.dir, "proj", "sess.jsonl");
  fs.mkdirSync(path.join(w.dir, "proj", "sess"), { recursive: true });
  fs.writeFileSync(transcript, "");
  if (customTitle) writeJson(path.join(w.dir, "proj", "sess", "custom-title.json"), { customTitle });
  return { transcript_path: transcript, session_id: "sess" };
}

test("the hook with no HC_TERMINAL_ID prints nothing and exits 0", () => {
  const w = world({ term: null });
  const r = w.run(["hook", "prompt", "claude"], payload());
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
  assert.deepEqual(w.state().calls, []);
});

test("the hook ignores a sub-agent's prompt", () => {
  const w = world();
  const r = w.run(["hook", "prompt", "claude"], payload({ agent_id: "a1" }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
  assert.deepEqual(w.state().calls, []);
});

test("the hook on an unnamed session replies with the title instruction", () => {
  const w = world();
  const r = w.run(["hook", "prompt", "claude"], payload());
  assert.equal(r.status, 0);
  const out = reply(r);
  assert.equal(out.hookEventName, "UserPromptSubmit");
  assert.match(out.additionalContext, /^\[herdr-nebula\] Before addressing/);
  assert.match(out.additionalContext, /herdr-nebula title <title>/);
  assert.equal(out.additionalContext.includes(String.fromCharCode(0x2014)), false);
});

test("the hook on a codex session replies with the instruction and no session title", () => {
  const w = world();
  const out = reply(w.run(["hook", "prompt", "codex"], payload()));
  assert.ok(out.additionalContext);
  assert.equal("sessionTitle" in out, false);
});

test("the hook on a named session replies without the instruction", () => {
  const w = world({ tabs: [{ id: "tb1", name: "Shopify sync" }] });
  const r = w.run(["hook", "prompt", "codex"], payload());
  assert.equal(r.stdout, "");
  const c = world({ tabs: [{ id: "tb1", name: "Shopify sync" }] });
  const out = reply(c.run(["hook", "prompt", "claude"], payload()));
  assert.equal(out.additionalContext, undefined);
});

test("the hook with auto-title off in shared.json replies without the instruction", () => {
  const w = world({ settings: { autoTitle: false } });
  const r = w.run(["hook", "prompt", "claude"], payload());
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

test("the hook with auto-title on or absent in shared.json replies with the instruction", () => {
  assert.ok(reply(world({ settings: { autoTitle: true } }).run(["hook", "prompt", "claude"], payload())).additionalContext);
  assert.ok(reply(world({ settings: { defaultView: "tree" } }).run(["hook", "prompt", "claude"], payload())).additionalContext);
});

test("the codex hook with auto-title off in shared.json prints nothing", () => {
  const w = world({ settings: { autoTitle: false } });
  const r = w.run(["hook", "prompt", "codex"], payload());
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

test("the hook in a second tab: position-named counts as unnamed, a repeated number counts as named", () => {
  const second = { labels: { "herdr.tab": "tb2" } };
  const unnamed = world({
    ...second,
    tabs: [
      { id: "tb1", name: "1" },
      { id: "tb2", name: "2" },
    ],
  });
  assert.ok(reply(unnamed.run(["hook", "prompt", "claude"], payload())).additionalContext);
  unnamed.run(["title", "Fix", "Login", "Redirect"]);
  assert.deepEqual(
    unnamed.state().tabs.map((t) => t.name),
    ["1", "Fix Login Redirect"],
  );
  const named = world({
    ...second,
    tabs: [
      { id: "tb1", name: "1" },
      { id: "tb2", name: "1" },
    ],
  });
  assert.equal(named.run(["hook", "prompt", "codex"], payload()).stdout, "");
  assert.match(named.run(["title", "Some", "Words"]).stdout, /already titled/i);
  assert.equal(named.state().tabs[1].name, "1");
});

test("a long prompt with newlines is stored as one line of 200 characters ending in an ellipsis", () => {
  const w = world();
  const prompt = `${"word ".repeat(30)}\n\nmore   text\there `.repeat(3);
  assert.ok(prompt.length > 300);
  w.run(["hook", "prompt", "claude"], payload({ prompt }));
  const stored = w.state().labels["nebula.prompt"];
  assert.equal(Array.from(stored).length, 200);
  assert.ok(stored.endsWith("…"));
  assert.doesNotMatch(stored, /[\n\t]/);
});

test("a short prompt is stored condensed", () => {
  const w = world();
  w.run(["hook", "prompt", "claude"], payload({ prompt: "  fix the\n\n login   redirect\t" }));
  assert.equal(w.state().labels["nebula.prompt"], "fix the login redirect");
});

test("a prompt starting with <task-notification is not stored", () => {
  const w = world({ labels: { "nebula.prompt": "earlier prompt" } });
  w.run(["hook", "prompt", "claude"], payload({ prompt: "<task-notification>done</task-notification>" }));
  assert.equal(w.state().labels["nebula.prompt"], "earlier prompt");
});

test("title renames an unnamed tab and records the auto title", () => {
  const w = world();
  const r = w.run(["title", "Fix", "Login", "Redirect"]);
  assert.equal(r.status, 0);
  const s = w.state();
  assert.equal(s.tabs[0].name, "Fix Login Redirect");
  assert.equal(s.labels["nebula.autotitle"], "Fix Login Redirect");
  assert.deepEqual(JSON.parse(s.calls.find((c) => c[1] === "do")[3]), { id: "tb1", name: "Fix Login Redirect" });
});

test("title may replace the tab's own earlier auto title", () => {
  const w = world({ tabs: [{ id: "tb1", name: "Old Auto Title" }], labels: { "nebula.autotitle": "Old Auto Title" } });
  w.run(["title", "New", "Auto", "Title"]);
  assert.equal(w.state().tabs[0].name, "New Auto Title");
  assert.equal(w.state().labels["nebula.autotitle"], "New Auto Title");
});

test("title on a session the user renamed changes nothing and says so", () => {
  const w = world({ tabs: [{ id: "tb1", name: "Shopify sync" }], labels: { "nebula.autotitle": "Fix Login Redirect" } });
  const r = w.run(["title", "Fix", "Login", "Redirect"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /already titled/i);
  const s = w.state();
  assert.equal(s.tabs[0].name, "Shopify sync");
  assert.equal(s.labels["nebula.autotitle"], "Fix Login Redirect");
  assert.equal(
    s.calls.some((c) => c[1] === "do"),
    false,
  );
});

test("title on a user-named tab with no auto title yet changes nothing", () => {
  const w = world({ tabs: [{ id: "tb1", name: "Shopify sync" }] });
  const r = w.run(["title", "Some", "Words"]);
  assert.match(r.stdout, /already titled/i);
  assert.equal(w.state().tabs[0].name, "Shopify sync");
});

test("title with no words or outside Herdr changes nothing", () => {
  const w = world();
  assert.notEqual(w.run(["title"]).status, 0);
  const o = world({ term: null });
  const r = o.run(["title", "A", "B", "C"]);
  assert.equal(r.status, 0);
  assert.deepEqual(o.state().calls, []);
});

test("a Claude custom-title.json holding a new name renames the tab and stores it", () => {
  const w = world();
  const s = claudeSession(w, "Billing Webhook Retries");
  const r = w.run(["hook", "prompt", "claude"], payload(s));
  const state = w.state();
  assert.equal(state.tabs[0].name, "Billing Webhook Retries");
  assert.equal(state.labels["nebula.claudetitle"], "Billing Webhook Retries");
  assert.equal(reply(r)?.additionalContext, undefined);
});

test("a named tab never adopted from Claude keeps its name and pushes it to Claude", () => {
  const w = world({ tabs: [{ id: "tb1", name: "Shopify sync" }] });
  const s = claudeSession(w, "Some Older Claude Name");
  const out = reply(w.run(["hook", "prompt", "claude"], payload(s)));
  assert.equal(w.state().tabs[0].name, "Shopify sync");
  assert.equal(out.sessionTitle, "Shopify sync");
  assert.equal(w.state().labels["nebula.claudetitle"], "Shopify sync");
});

test("after an F2 rename, a stale custom-title.json keeps the F2 name and pushes it", () => {
  const w = world({
    tabs: [{ id: "tb1", name: "Shopify sync" }],
    labels: { "nebula.autotitle": "Fix Login Redirect", "nebula.claudetitle": "Fix Login Redirect" },
  });
  const s = claudeSession(w, "Fix Login Redirect");
  const out = reply(w.run(["hook", "prompt", "claude"], payload(s)));
  assert.equal(w.state().tabs[0].name, "Shopify sync");
  assert.equal(out.sessionTitle, "Shopify sync");
  assert.equal(out.additionalContext, undefined);
  assert.equal(w.state().labels["nebula.claudetitle"], "Shopify sync");
});

test("a tab name Claude already holds is not pushed again", () => {
  const w = world({
    tabs: [{ id: "tb1", name: "Fix Login Redirect" }],
    labels: { "nebula.autotitle": "Fix Login Redirect", "nebula.claudetitle": "Fix Login Redirect" },
  });
  const s = claudeSession(w, "Fix Login Redirect");
  assert.equal(w.run(["hook", "prompt", "claude"], payload(s)).stdout, "");
});

test("the hook exits 0 and prints nothing when herdr tools fail", () => {
  const w = world();
  const r = w.run(["hook", "prompt", "claude"], payload(), { FAKE_STATE: path.join(w.dir, "missing.json") });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

// sub-agent hooks

const subKey = "nebula.sub.agent-a1";
const subEvent = (extra = {}) => JSON.stringify({ hook_event_name: "SubagentStart", agent_id: "agent-a1", agent_type: "Explore", ...extra });

// A session folder holding the sub-agent's meta file, as Claude Code writes it.
function subMeta(w, meta) {
  const transcript = path.join(w.dir, "proj", "sess.jsonl");
  writeJson(path.join(w.dir, "proj", "sess", "subagents", "agent-a1.meta.json"), meta);
  return { transcript_path: transcript, session_id: "sess" };
}

test("subagent start labels the terminal with type, description and model from the meta file", () => {
  const w = world();
  const r = w.run(
    ["hook", "subagent", "claude", "start"],
    subEvent(subMeta(w, { agentType: "Explore", description: "Find the login handlers", model: "claude-haiku-4-5" })),
  );
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
  const v = JSON.parse(w.state().labels[subKey]);
  assert.deepEqual({ ...v, at: typeof v.at }, { type: "Explore", desc: "Find the login handlers", model: "haiku", at: "number" });
});

test("subagent start without a meta file still labels the type", () => {
  const w = world();
  assert.equal(w.run(["hook", "subagent", "claude", "start"], subEvent()).status, 0);
  const v = JSON.parse(w.state().labels[subKey]);
  assert.deepEqual([v.type, v.desc, v.model], ["Explore", "", ""]);
});

test("subagent stop removes the label and leaves the others", () => {
  const w = world({ labels: { [subKey]: "{}", "nebula.sub.agent-b2": "{}" } });
  const r = w.run(["hook", "subagent", "claude", "stop"], subEvent({ hook_event_name: "SubagentStop" }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
  assert.equal(subKey in w.state().labels, false);
  assert.equal("nebula.sub.agent-b2" in w.state().labels, true);
});

test("the subagent hook outside Herdr, without an agent id, or with herdr tools failing prints nothing and exits 0", () => {
  const none = world({ term: null });
  assert.deepEqual([none.run(["hook", "subagent", "claude", "start"], subEvent()).status, none.state().calls], [0, []]);
  const noId = world();
  assert.equal(noId.run(["hook", "subagent", "claude", "start"], "{}").status, 0);
  assert.deepEqual(noId.state().calls, []);
  const w = world();
  const r = w.run(["hook", "subagent", "claude", "start"], subEvent(), { FAKE_STATE: path.join(w.dir, "missing.json") });
  assert.deepEqual([r.status, r.stdout], [0, ""]);
});

// install-hooks

const claudeFile = (w) => path.join(w.home, ".claude", "settings.json");
const codexFile = (w) => path.join(w.home, ".codex", "hooks.json");
const mine = (g) => g._herdrNebulaManaged === true;

test("install-hooks twice leaves one managed group per event", () => {
  const w = world();
  writeJson(claudeFile(w), { hooks: {} });
  writeJson(codexFile(w), { hooks: {} });
  assert.equal(w.run(["install-hooks"]).status, 0);
  const second = w.run(["install-hooks"]);
  assert.equal(second.status, 0);
  for (const f of [claudeFile(w), codexFile(w)]) {
    const groups = JSON.parse(fs.readFileSync(f, "utf8")).hooks.UserPromptSubmit;
    assert.equal(groups.filter(mine).length, 1);
    assert.match(groups.find(mine).hooks[0].command, /herdr-nebula hook prompt (claude|codex)/);
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(claudeFile(w), "utf8")).permissions.allow, ["Bash(herdr-nebula title:*)"]);
  const claude = JSON.parse(fs.readFileSync(claudeFile(w), "utf8")).hooks;
  for (const [event, phase] of [
    ["SubagentStart", "start"],
    ["SubagentStop", "stop"],
  ]) {
    assert.equal(claude[event].filter(mine).length, 1);
    assert.match(claude[event].find(mine).hooks[0].command, new RegExp(`herdr-nebula hook subagent claude ${phase}`));
  }
  assert.equal(JSON.parse(fs.readFileSync(codexFile(w), "utf8")).hooks.SubagentStart, undefined);
});

test("install-hooks keeps existing hooks in order, appends after them and backs up first", () => {
  const w = world();
  const original = {
    model: "opus",
    permissions: { allow: ["Bash(ls:*)"], deny: ["Bash(rm:*)"] },
    hooks: {
      UserPromptSubmit: [{ hooks: [{ type: "command", command: "echo first" }] }, { matcher: "", hooks: [{ type: "command", command: "echo second" }] }],
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo pre" }] }],
    },
  };
  writeJson(claudeFile(w), original);
  const before = fs.readFileSync(claudeFile(w), "utf8");
  const r = w.run(["install-hooks"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /settings\.json/);
  const after = JSON.parse(fs.readFileSync(claudeFile(w), "utf8"));
  const groups = after.hooks.UserPromptSubmit;
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.slice(0, 2), original.hooks.UserPromptSubmit);
  assert.ok(mine(groups[2]));
  assert.deepEqual(after.hooks.PreToolUse, original.hooks.PreToolUse);
  assert.equal(after.model, "opus");
  assert.deepEqual(after.permissions.allow, ["Bash(ls:*)", "Bash(herdr-nebula title:*)"]);
  assert.deepEqual(after.permissions.deny, ["Bash(rm:*)"]);
  const backups = fs.readdirSync(path.dirname(claudeFile(w))).filter((n) => n.startsWith("settings.json.") && n !== "settings.json");
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(path.dirname(claudeFile(w)), backups[0]), "utf8"), before);
});

test("install-hooks makes no backup and no change when already installed", () => {
  const w = world();
  writeJson(claudeFile(w), {});
  w.run(["install-hooks"]);
  const names = fs.readdirSync(path.dirname(claudeFile(w)));
  const text = fs.readFileSync(claudeFile(w), "utf8");
  const r = w.run(["install-hooks"]);
  assert.match(r.stdout, /already/i);
  assert.deepEqual(fs.readdirSync(path.dirname(claudeFile(w))), names);
  assert.equal(fs.readFileSync(claudeFile(w), "utf8"), text);
});

test("install-hooks aborts on a corrupt file and leaves it untouched", () => {
  const w = world();
  fs.mkdirSync(path.dirname(claudeFile(w)), { recursive: true });
  fs.writeFileSync(claudeFile(w), "{ not json");
  const r = w.run(["install-hooks"]);
  assert.notEqual(r.status, 0);
  assert.equal(fs.readFileSync(claudeFile(w), "utf8"), "{ not json");
  assert.deepEqual(fs.readdirSync(path.dirname(claudeFile(w))), ["settings.json"]);
});

test("install-hooks skips a CLI whose config folder does not exist", () => {
  const w = world();
  writeJson(claudeFile(w), {});
  const r = w.run(["install-hooks"]);
  assert.equal(r.status, 0);
  assert.equal(fs.existsSync(path.dirname(codexFile(w))), false);
});

test("install-hooks keeps a 0600 settings.json at 0600", () => {
  const w = world();
  writeJson(claudeFile(w), { env: { TOKEN: "x" } });
  fs.chmodSync(claudeFile(w), 0o600);
  assert.equal(w.run(["install-hooks"]).status, 0);
  assert.equal(fs.statSync(claudeFile(w)).mode & 0o777, 0o600);
  assert.ok(JSON.parse(fs.readFileSync(claudeFile(w), "utf8")).hooks);
});

test("install-hooks writes through a symlinked settings.json and keeps the link", () => {
  const w = world();
  const target = path.join(w.dir, "dotfiles", "settings.json");
  writeJson(target, { model: "opus" });
  fs.mkdirSync(path.dirname(claudeFile(w)), { recursive: true });
  fs.symlinkSync(target, claudeFile(w));
  assert.equal(w.run(["install-hooks"]).status, 0);
  assert.equal(fs.lstatSync(claudeFile(w)).isSymbolicLink(), true);
  const after = JSON.parse(fs.readFileSync(target, "utf8"));
  assert.equal(after.model, "opus");
  assert.equal(after.hooks.UserPromptSubmit.filter(mine).length, 1);
  const backups = fs.readdirSync(path.dirname(claudeFile(w))).filter((n) => n.endsWith(".bak"));
  assert.equal(backups.length, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(path.dirname(claudeFile(w)), backups[0]), "utf8")), { model: "opus" });
});

test("install-hooks updates a stale managed group in place and keeps the user group after it", () => {
  const w = world();
  const user = { hooks: [{ type: "command", command: "echo mine" }] };
  writeJson(claudeFile(w), { hooks: { UserPromptSubmit: [{ _herdrNebulaManaged: true, hooks: [{ type: "command", command: "old" }] }, user] } });
  assert.equal(w.run(["install-hooks"]).status, 0);
  const groups = JSON.parse(fs.readFileSync(claudeFile(w), "utf8")).hooks.UserPromptSubmit;
  assert.equal(groups.length, 2);
  assert.ok(mine(groups[0]));
  assert.match(groups[0].hooks[0].command, /herdr-nebula hook prompt claude/);
  assert.deepEqual(groups[1], user);
});

for (const [name, content] of [
  ["hooks.UserPromptSubmit that is not a list", { hooks: { UserPromptSubmit: {} } }],
  ["permissions.allow that is not a list", { permissions: { allow: "x" } }],
  ["a top-level array", []],
]) {
  test(`install-hooks aborts on ${name} and leaves the file untouched`, () => {
    const w = world();
    writeJson(claudeFile(w), content);
    const before = fs.readFileSync(claudeFile(w));
    const r = w.run(["install-hooks"]);
    assert.notEqual(r.status, 0);
    assert.deepEqual(fs.readFileSync(claudeFile(w)), before);
    assert.deepEqual(fs.readdirSync(path.dirname(claudeFile(w))), ["settings.json"]);
  });
}

test("an unknown command prints the usage and exits 2", () => {
  const r = world().run(["bogus"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage: herdr-nebula/);
});

test("title says so when the terminal's tab cannot be found", () => {
  const w = world({ tabs: [] });
  const r = w.run(["title", "Fix", "Login"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Could not find this session's tab/);
  assert.equal(
    w.state().calls.some((c) => c[1] === "do"),
    false,
  );
});

test("a shared.json that is not valid JSON leaves auto-title on", () => {
  const w = world();
  fs.writeFileSync(path.join(w.home, ".config", "herdr-app", "shared.json"), "{ not json");
  assert.ok(reply(w.run(["hook", "prompt", "claude"], payload())).additionalContext);
});

test("a custom-title.json that is not valid JSON counts as no Claude title", () => {
  const w = world();
  const s = claudeSession(w, null);
  fs.writeFileSync(path.join(w.dir, "proj", "sess", "custom-title.json"), "{ not json");
  const r = w.run(["hook", "prompt", "claude"], payload(s));
  assert.equal(r.status, 0);
  assert.equal(w.state().tabs[0].name, "1");
});
