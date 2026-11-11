import { inside, norm } from "./projects.js";
import { canResume } from "./resume.js";
import { editorItems } from "./editors.js";

// resume: only where the agent has left and its conversation is known (Enter does the same);
// live: only on an agent still running (it sleeps: its CLI stops, Enter resumes it).
const ALL = [
  { id: "resume", label: "Resume", key: "⇧R", resume: true, icon: "mods/nebula/icons/play.svg" },
  { id: "sleep", label: "Sleep", key: "z", live: true, icon: "mods/nebula/icons/moon.svg" },
  { id: "rename", label: "Rename", key: "r", tab: true, icon: "mods/nebula/icons/pencil.svg" },
  { id: "relaunch", label: "Relaunch with same setup", key: "⇧P", launch: true, icon: "mods/nebula/icons/rotate-ccw.svg" },
  { id: "folder", label: "Open folder in editor", key: "⇧↩", icon: "mods/nebula/icons/folder-open.svg" },
  { id: "archive", label: "Archive", key: "a", tab: true, sep: true, icon: "mods/nebula/icons/archive.svg" },
  { id: "unarchive", label: "Unarchive", key: "u", tab: true, sep: true, icon: "mods/nebula/icons/undo-2.svg" },
  { id: "delete", label: "Delete", key: "d", danger: true, icon: "mods/nebula/icons/trash.svg" },
];

// A nebula row (kind "nebula") belongs to nebula: a click or Enter resumes it, and the one
// action hides it from the board (a or d), since nothing here can delete nebula's session.
const HIDE = [{ id: "hide", label: "Hide from board", key: "d", icon: "mods/nebula/icons/eye-off.svg" }];
// What a key or menu pick does to this row: on a nebula row, delete and archive both mean Hide.
export const rowAction = (row, action) => (row.kind === "nebula" && (action === "delete" || action === "archive") ? "hide" : action);

export const actionsFor = (row, hasLaunch) => withPorts(row.ports, row.kind === "nebula" ? HIDE : rowActions(row, hasLaunch));

// "Open localhost:<port>" for the first ports the session listens on (lib/ports.js), above the rest.
const PORTS_SHOWN = 3;
function withPorts(ports, list) {
  const open = (ports ?? [])
    .slice(0, PORTS_SHOWN)
    .map((p) => ({ id: `port:${p}`, label: `Open localhost:${p}`, key: "", icon: "mods/nebula/icons/external-link.svg" }));
  return open.length && list.length ? [...open, { ...list[0], sep: true }, ...list.slice(1)] : [...open, ...list];
}

const rowActions = (row, hasLaunch) =>
  ALL.filter(
    (a) =>
      (!a.tab || row.tab) &&
      (!a.launch || hasLaunch) &&
      (!a.resume || canResume(row)) &&
      (!a.live || (row.address && !row.exited)) &&
      (a.id !== "archive" || !row.archived) &&
      (a.id !== "unarchive" || row.archived),
  ).flatMap((a) => (a.id === "folder" && row.editors ? editorItems(row.editors, row.editor) : [a])); // Open in <the Settings pick>, Reveal in Finder (lib/editors.js)

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

// The worktree an empty band's `d` removes, or null when the board may not offer it: the band
// has a session (use that session's delete) or buildBoard marked it undeletable (no branch to
// name to `wt remove`, not a linked worktree, the repo's own checkout, the default branch).
// A worktree header's right-click menu: open its folder (the editor picked in Settings, and Finder), then Remove
// worktree for a linked one (the repo's own checkout and the default branch stay), naming the sessions it would end.
/**
 * @param {{ editors?: any, editor?: string, deletable?: boolean, sessions?: number }} o
 * @returns {{ id: string, label: string, key: string, icon?: string, danger?: boolean, sep?: boolean }[]}
 */
export const worktreeActions = ({ editors, editor, deletable, sessions = 0 }) => [
  ...editorItems(editors, editor).map((it) => ({ ...it, key: "" })),
  ...(deletable
    ? [
        {
          id: "removeWorktree",
          label: sessions ? `Remove worktree (ends ${sessions} session${sessions === 1 ? "" : "s"})` : "Remove worktree",
          key: "d",
          danger: true,
          sep: true,
          icon: "mods/nebula/icons/trash.svg",
        },
      ]
    : []),
];

// What removing a worktree from its header ends first: its live sessions (the confirm kills each, then runs wt remove).
export const worktreeSessions = (band, panesNow) =>
  (band?.rows ?? [])
    .filter((r) => r.address && !r.exited && r.kind !== "nebula")
    .map((r) => ({ terminal: r.address, tab: r.tab, alone: aloneInTab(panesNow, r.tab, r.address), title: r.title }));

export const bandOffer = (root, band) => (band && !band.rows.length && band.deletable ? { root, path: band.path, branch: band.branch } : null);

export const parseLines = (text) =>
  String(text ?? "")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean);

export const removeLabel = (dirty) => (dirty > 0 ? `Remove and discard ${dirty} file${dirty === 1 ? "" : "s"}` : "Remove worktree");

// What the worktree check found. `known` is false when git status or git log failed or was
// rejected: the lists are then empty but mean "unknown", never "clean". `filesOk` says the
// uncommitted list itself is real, so a count taken from it may be shown and trusted.
export const summarizeCheck = (st, lg) => {
  const filesOk = st?.code === 0,
    logOk = lg?.code === 0;
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
  cmd: "wt",
  args: ["-C", offer.root, "remove", offer.branch, "-y", "--foreground", ...(dirty > 0 ? ["-f"] : [])],
});

export const aloneInTab = (panes, tab, terminal) => Boolean(tab) && !panes.some((p) => p.tab === tab && p.terminal !== terminal);

export const planDelete = ({ terminal, tab, alone }) => [
  { name: "terminal.kill", args: { terminal } },
  ...(alone && tab ? [{ name: "tab.close", args: { id: tab, confirmed: true } }] : []),
];

// Archive puts the tab away (it comes back by itself when an agent in it needs you).
export const tabCommand = (action, tab) => ({ name: action === "archive" ? "tab.settle" : "tab.unsettle", args: { id: tab } });

export function editorCommand(editor, path) {
  const [cmd, ...args] = String(editor ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return { cmd: cmd ?? "open", args: [...args, path] };
}
