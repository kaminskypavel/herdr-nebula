// The new-session box's choices as ordered steps. The box runs them in order; this file
// only decides. Steps (every one is plain JSON):
//   { type: "wt", args, timeout }                    wt switch, its stdout JSON names the path
//   { type: "do", name, args, launch? }              herdr-app do <name> <args>; `launch`
//                                                    marks the one whose output has the terminal
//   { type: "labels", launch }                       hc label on that terminal (labels.js)
//   { type: "keys", to: "board" | "agent" }          where the keyboard ends up
// A folder that only wt knows is WT until bind() fills it. No herdr imports.

import { buildArgv, HARNESSES, runProgram } from "./harness.js";
import { composePrompt, harnessOf } from "./presets.js";
import { inside, norm } from "./projects.js";
import { slug } from "./branch.js";
import { launchLabels } from "./labels.js";
import { taskWithImages } from "./paste.js";

export const WT = "@wt";
export const WT_TIMEOUT = 600000;

export const branchOf = (typed, task, random) => typed?.trim() || slug(task) || random;

// The box's task on open: a preset or relaunch seed wins, else the draft Esc kept last time
// (shared "nebula.draft"; anything but text is no draft).
export const seedTask = (seed, draft) => (typeof seed === "string" && seed ? seed : typeof draft === "string" ? draft : "");

// What Esc keeps: the task as typed (and the pasted images' line), or nothing when both are blank.
export const draftOf = (task, images = []) => (String(task ?? "").trim() || images.length ? taskWithImages(task, images) : "");

export function withoutEnter(before, now) {
  for (let i = 0; i < now.length; i++) if (now[i] === "\n" && now.slice(0, i) + now.slice(i + 1) === before) return before;
  return now;
}

export function checkoutIndex(folder, checkouts) {
  let best = -1;
  checkouts.forEach((c, i) => {
    if (folder && inside(folder, c.path) && (best < 0 || norm(c.path).length > norm(checkouts[best].path).length)) best = i;
  });
  return best;
}

export const worktreeOf = (checkouts, branch) => checkouts.find((c) => c.branch === branch) ?? null;

export function worktreePath(root, branch) {
  const r = norm(root),
    dir = String(branch)
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return `${r.replace(/\/[^/]+$/, "")}/${r.split("/").pop()}-worktrees/${dir}`;
}

export function installedHarnesses(known) {
  const ids = [];
  for (const a of known ?? []) {
    const prog = runProgram(a);
    const id = a.installed && Object.keys(HARNESSES).find((k) => HARNESSES[k].program === prog);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export const usablePresets = (presets, ids) => presets.filter((p) => ids.includes(harnessOf(p)));

export const applyPreset = (p) => ({ harness: harnessOf(p), model: p.model ?? null, effort: p.effort ?? null });

export function cyclePreset(presets, name, dir) {
  const list = [null, ...presets],
    at = Math.max(
      0,
      list.findIndex((p) => p && p.name === name),
    );
  return list[(at + dir + list.length) % list.length];
}

export function prefillOf(launch, ids) {
  if (!launch || typeof launch !== "object") return null;
  return {
    harness: ids.includes(launch.harness) ? launch.harness : null,
    model: launch.model ?? null,
    effort: launch.effort ?? null,
    preset: launch.preset ?? null,
    checkout: launch.checkout ?? null,
    root: launch.root ?? null,
    task: typeof launch.task === "string" ? launch.task : "",
  };
}

// The folder each herdr space works in, for planLaunch's `spaces`: where its first
// terminal is now, else the folder it was made in. Spaces on another machine are left out.
export function placedSpaces(spaces, all) {
  return spaces
    .filter((s) => !s.machine)
    .map((s) => {
      const tabs = new Set((s.tabs ?? []).map((c) => c.id));
      return { id: s.id, path: all.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder || null };
    })
    .filter((s) => s.path);
}

function spaceFor(folder, checkouts, spaces) {
  const i = checkoutIndex(folder, checkouts);
  return i < 0 ? null : (spaces.find((s) => checkoutIndex(s.path, checkouts) === i)?.id ?? null);
}

// o: { repo: { root }, checkouts: [{ path, branch }], checkout (the chosen path),
//   git (false for a plain folder: no worktree, newWorktree is ignored), newWorktree, branch, branchExists (a local branch of that name), spaces, harness,
//   model, effort, preset (the chosen preset or null), task, from: "board" | "terminal",
//   images (absolute paths of pasted images, named on the task's last line),
//   argv (the whole command, instead of one built from harness, model, effort and task),
//   name (names the new tab, so auto-title leaves it alone; without one the task's first words name it
//   as a placeholder, launchName) }.
// Returns { steps, existing } where existing means the branch already had a worktree.
// A placeholder tab name from the task, so a new session is not "1" while its agent starts (it may first
// stop at a trust question): the task's first words. The agent's own title replaces it later (the prompt
// hook and `herdr-nebula title` read the nebula.launchname label). -> the name, or null without a task.
export function launchName(task, words = 5, max = 40) {
  const line = String(task ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return null;
  const short = line.split(/\s+/).slice(0, words).join(" ");
  return short.length > max ? `${short.slice(0, max - 1).trimEnd()}…` : short;
}

export function planLaunch(o) {
  const body = o.preset ? composePrompt(o.preset, o.preset.skip_task ? "" : o.task) : String(o.task ?? "").trim();
  const draft = o.name ? null : launchName(body),
    name = o.name || draft;
  const task = taskWithImages(body, o.images); // the pasted images' absolute paths, as the task's last line
  const argv = o.argv ?? buildArgv({ harness: o.harness, model: o.model, effort: o.effort, task });
  const steps = [];
  let folder = o.checkout,
    existing = false;
  if (o.newWorktree && o.git !== false) {
    const have = worktreeOf(o.checkouts, o.branch);
    if (have) {
      folder = have.path;
      existing = true;
    } else {
      folder = WT;
      steps.push({
        type: "wt",
        args: ["-C", o.repo.root, "switch", ...(o.branchExists ? [] : ["--create"]), o.branch, "--no-cd", "-y", "--format", "json"],
        timeout: WT_TIMEOUT,
      });
    }
  }
  const space = folder === WT ? null : spaceFor(folder, o.checkouts, o.spaces);
  if (space) {
    steps.push({ type: "do", name: "space.select", args: { id: space } });
    steps.push({ type: "do", name: "tab.new", args: { space, folder, argv, ...(name ? { name } : {}) }, launch: true });
  } else steps.push({ type: "do", name: "space.new", args: { folder, argv, ...(name ? { tab: name } : {}) }, launch: true });
  steps.push({
    type: "labels",
    launch: { harness: o.harness, model: o.model || null, effort: o.effort || null, preset: o.preset?.name ?? null, checkout: folder },
    name: draft,
  });
  steps.push({ type: "keys", to: o.from === "board" ? "board" : "agent" });
  return { steps, existing };
}

// What the box says when a project's folder is gone (moved or deleted), instead of the terminal's
// "cannot start /bin/zsh: No such file or directory", which names the shell, not the folder.
export const goneText = (name, path) => `${name} is not at ${path} anymore. Remove it in Projects (+), then add it from where it is now.`;

export const bind = (steps, path) => JSON.parse(JSON.stringify(steps, (_k, v) => (v === WT ? path : v)));

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping the ESC of ANSI color codes is the point
const ANSI = /\x1b\[[0-9;]*m/g;
export const words = (s) =>
  String(s ?? "")
    .replace(ANSI, "")
    .trim()
    .split("\n")
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");

// Runs the plan's steps in order with an injected exec (the box passes herdr's). onStep(step)
// is called before each step. Returns { terminal, error }: the terminal the `launch` step
// started (null if its reply named none, which skips the labels) and the first failure.
/** @param {(step: any) => void} [onStep] */
export async function runSteps(steps, exec, onStep = () => {}) {
  let todo = [...steps],
    terminal = null;
  while (todo.length) {
    const s = todo.shift();
    onStep(s);
    if (s.type === "wt") {
      const r = await exec("wt", s.args, { timeout: s.timeout });
      if (r.code !== 0) return { terminal, error: words(r.stderr || r.stdout) || "wt failed." };
      let path = null;
      try {
        path = JSON.parse(r.stdout).path;
      } catch {}
      if (!path) return { terminal, error: "wt did not say where the worktree is." };
      todo = bind(todo, path);
    } else if (s.type === "do") {
      const r = await exec("herdr-app", ["do", s.name, JSON.stringify(s.args)]);
      let out = null;
      try {
        out = JSON.parse(r.stdout);
      } catch {}
      if (r.code !== 0 || out?.error) return { terminal, error: words(out?.error || r.stderr || r.stdout) || `${s.name} failed.` };
      if (s.launch) terminal = out?.terminal ?? null;
    } else if (s.type === "labels" && terminal) {
      // The agent is already running; a label that fails to land only costs the board its metadata.
      const pairs = Object.entries(launchLabels(s.launch, s.name)).map(([k, v]) => `${k}=${v}`);
      await exec("hc", ["label", terminal, ...pairs]).catch(() => null);
    }
  }
  return { terminal, error: "" };
}
