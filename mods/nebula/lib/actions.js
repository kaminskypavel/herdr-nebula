import { inside, norm } from "./projects.js";

const ALL = [
  { id: "rename", label: "Rename", key: "r", tab: true },
  { id: "relaunch", label: "Relaunch with same setup", key: "⇧P", launch: true },
  { id: "folder", label: "Open folder in editor", key: "⇧↩" },
  { id: "archive", label: "Archive", key: "a", tab: true, sep: true },
  { id: "unarchive", label: "Unarchive", key: "u", tab: true, sep: true },
  { id: "delete", label: "Delete", key: "d", danger: true },
];

// A nebula row (kind "nebula") belongs to nebula: no row action applies, only a click or
// Enter resumes it.
export const actionsFor = (row, hasLaunch) => row.kind === "nebula" ? [] : ALL.filter((a) =>
  (!a.tab || row.tab)
  && (!a.launch || hasLaunch)
  && (a.id !== "archive" || !row.archived)
  && (a.id !== "unarchive" || row.archived));

export const isLinked = (root, path) => norm(path) !== `${norm(root)}-worktrees` && inside(path, `${norm(root)}-worktrees`);

export function whereIs(model, id) {
  for (const repo of model.repos) for (const band of repo.bands) if (band.rows.some((r) => r.id === id)) return { repo, band };
  return null;
}

// The worktree that deleting this session leaves empty, or null. `model` must include
// archived sessions: an archived session still in the worktree means this was not the
// last one. A band with no branch cannot be named to `wt remove`, so it offers nothing.
export function worktreeOffer(model, id) {
  const at = whereIs(model, id);
  if (!at || at.band.rows.length > 1 || !at.band.branch || !isLinked(at.repo.root, at.band.path)) return null;
  return { root: at.repo.root, path: at.band.path, branch: at.band.branch };
}

export const parseLines = (text) => String(text ?? "").split("\n").map((l) => l.trimEnd()).filter(Boolean);

export const removeLabel = (dirty) => (dirty > 0 ? `Remove and discard ${dirty} file${dirty === 1 ? "" : "s"}` : "Remove worktree");

// What the worktree check found. `known` is false when git status or git log failed or was
// rejected: the lists are then empty but mean "unknown", never "clean". `filesOk` says the
// uncommitted list itself is real, so a count taken from it may be shown and trusted.
export const summarizeCheck = (st, lg) => {
  const filesOk = st?.code === 0, logOk = lg?.code === 0;
  return { files: filesOk ? parseLines(st.stdout) : [], unpushed: logOk ? parseLines(lg.stdout) : [], known: filesOk && logOk, filesOk };
};

// A remove tick made before the check finished does not survive a result that is not a
// known-clean worktree: the user ticks again against the label they can now see.
export const settleRemove = (remove, check) => remove && check.known && check.files.length === 0 && check.unpushed.length === 0;

// The count `-f` is allowed to follow: only a list the user was shown.
export const forceCount = (check) => (check.filesOk ? check.files.length : 0);

// After the agent is stopped, compare a fresh `git status --short` with the list the user
// saw. Same list: remove, with -f only for that count. Different: stop and show the new
// list. Status failed: remove without -f, so wt's own refusal protects a dirty tree.
export function recheckRemove(check, st) {
  if (st?.code !== 0) return { changed: false, dirty: 0 };
  const fresh = parseLines(st.stdout);
  const same = check.filesOk && fresh.length === check.files.length && fresh.every((f, i) => f === check.files[i]);
  return same ? { changed: false, dirty: fresh.length } : { changed: true, files: fresh };
}

export const planRemove = (offer, dirty) => ({
  cmd: "wt", args: ["-C", offer.root, "remove", offer.branch, "-y", "--foreground", ...(dirty > 0 ? ["-f"] : [])],
});

export const aloneInTab = (panes, tab, terminal) => Boolean(tab) && !panes.some((p) => p.tab === tab && p.terminal !== terminal);

export const planDelete = ({ terminal, tab, alone }) => [
  { name: "terminal.kill", args: { terminal } },
  ...(alone && tab ? [{ name: "tab.close", args: { id: tab, confirmed: true } }] : []),
];

// Archive puts the tab away (it comes back by itself when an agent in it needs you).
export const tabCommand = (action, tab) => ({ name: action === "archive" ? "tab.settle" : "tab.unsettle", args: { id: tab } });

export function editorCommand(editor, path) {
  const [cmd, ...args] = String(editor ?? "").trim().split(/\s+/).filter(Boolean);
  return { cmd: cmd ?? "open", args: [...args, path] };
}
