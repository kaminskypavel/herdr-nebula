// The project list (shared "nebula.projects"), the git helpers that find a project's
// checkouts, the digit key of the tabs and the jump target the rail's keys use. No herdr
// imports, so node can test it.
//
// The project list is one shared value: { list: [{ root, name }], removed: [root] }.
// `removed` remembers the folders the user took off the list, so code that adds projects
// in bulk can tell them from folders it has not seen yet.
import { statusOf } from "./status.js";
import { nextAttention, flatten } from "./order.js";
import { groupSessions, repoRoot, norm, baseName } from "./projects.js";
import { PROJECTS } from "./shared.js";
import { isCleared } from "./waiting.js";

export const STORE = PROJECTS;

const read = (store) => ({ list: store?.list ?? [], removed: store?.removed ?? [] });

export const projectList = (store) => read(store).list;

export const reposWith = (store, checkouts) =>
  projectList(store).map((p) => ({
    root: p.root,
    name: p.name,
    checkouts: checkouts[p.root] ?? [{ path: p.root, branch: null }],
  }));

export const rootsKey = (store) =>
  projectList(store)
    .map((p) => p.root)
    .join("\n");

export const taken = (store, root) => projectList(store).some((p) => norm(p.root) === norm(root));

const sameRoot = (a) => (b) => norm(a) === norm(b);

// Puts a folder on the list (named by its base name unless given one). Returns the same
// store when it is already there.
/**
 * @param {any} store
 * @param {string} root
 * @param {{ name?: string }} [opts]
 */
export function addProject(store, root, { name } = {}) {
  if (taken(store, root)) return store;
  const { list, removed } = read(store);
  return { list: [...list, { root: norm(root), name: name || baseName(root) }], removed: removed.filter((r) => !sameRoot(root)(r)) };
}

// Takes a folder off the list and remembers it in `removed`. The same store when absent.
export function removeProject(store, root) {
  if (!taken(store, root)) return store;
  const { list, removed } = read(store);
  return { list: list.filter((p) => !sameRoot(root)(p.root)), removed: [...removed.filter((r) => !sameRoot(root)(r)), norm(root)] };
}

// The project a git common dir belongs to: its folder, and the list entry when there is one.
export function resolveAdd(store, commonDir) {
  const root = repoRoot(commonDir);
  return { root, existing: projectList(store).find((p) => sameRoot(root)(p.root)) ?? null };
}

// `git worktree list --porcelain` -> [{ path, branch }], the main checkout first
// (git's own order); a detached checkout has branch null.
export function parseWorktrees(text) {
  return String(text ?? "")
    .split(/\n\s*\n/)
    .map((block) => {
      const path = /^worktree (.+)$/m.exec(block)?.[1];
      return path ? { path, branch: /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? null } : null;
    })
    .filter(Boolean);
}

export async function listCheckouts(exec, root) {
  const r = await exec("git", ["worktree", "list", "--porcelain"], { cwd: root }).catch(() => null);
  return r?.code === 0 ? parseWorktrees(r.stdout) : null;
}

export const commonDirOf = (exec, root) => exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: root }).catch(() => null);

// The folder a typed path adds as a project. Inside a git repo or worktree it is the main
// repo; any other existing folder is its own project (no worktrees). A path git cannot
// run in (commonDirOf null) does not exist. -> { root, git } | { error }
export async function resolveFolder(exec, path) {
  const r = await commonDirOf(exec, path);
  if (!r) return { error: `No folder at ${path}.` };
  return r.code === 0 && r.stdout.trim() ? { root: repoRoot(r.stdout.trim()), git: true } : { root: norm(path), git: false };
}

export function tilde(path, home) {
  const p = norm(path),
    h = norm(home);
  if (!h) return p;
  return p === h ? "~" : p.startsWith(`${h}/`) ? `~${p.slice(h.length)}` : p;
}

export const digitTile = (tiles, key) => (/^[1-9]$/.test(key) ? (tiles[Number(key) - 1] ?? null) : null);

// The next agent that waits on you, needs you before finished (the Up next order). `cleared` is the shared
// "nebula.cleared" map and `changed` { [terminal]: the tab's change time }: a row the user cleared with `e` on the
// board is skipped until it changes state (lib/waiting.js), so ⌘] never lands on what was dealt with.
export function jumpTarget(terminals, repos, from, dir, { cleared = null, changed = {} } = {}) {
  const rows = flatten(groupSessions(terminals, repos))
    .map((t) => ({ id: t.address, status: statusOf(t), turn: Number.isInteger(t.turn) ? t.turn : null, changedAt: changed[t.address] ?? 0 }))
    .map((r) => (isCleared(cleared, r) ? { ...r, status: "seen" } : r)); // kept in the list so the walk still starts at `from`
  return nextAttention(rows, from, dir);
}
