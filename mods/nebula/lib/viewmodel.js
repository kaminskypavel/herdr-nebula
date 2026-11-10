import { groupSessions, bestBand, norm, baseName } from "./projects.js";
import { statusOf, tally, COLOR, STATUS_ORDER } from "./status.js";
import { readLabels } from "./labels.js";
import { duration, hookSubs, sameApp, byParent, tree as subTree, kidStatus, subRow } from "./subagents.js";
import { nextAttention } from "./order.js";
import { visibleSessions, nebulaRow } from "./nebula-sessions.js";
import { byName, rowGroup } from "./arrange.js";
import { freshState } from "./attention.js";
import { isLinked } from "./actions.js";
import { parseSession, resumeHint } from "./resume.js";
import { stampOdd } from "./rowmeta.js";

export const OTHER = "other:";

export const NEW_SESSION = "New session";

export const LABEL = { needs: "needs you", working: "working", unseen: "unseen", seen: "idle", exited: "exited" };

export const COLUMNS = [
  { status: "needs", title: "Needs you" },
  { status: "working", title: "Working" },
  { status: "unseen", title: "Unseen" },
  { status: "seen", title: "Seen" },
];

function tabLookup(agents, panes, spaces) {
  const tabs = new Map();
  for (const s of spaces) for (const tb of s.tabs ?? []) tabs.set(tb.id, tb);
  const out = new Map();
  for (const p of panes) if (p.terminal) out.set(p.terminal, { tab: tabs.get(p.tab) ?? null, pane: p.pane ?? null });
  for (const a of agents) out.set(a.address, { tab: tabs.get(a.tab) ?? null, pane: a.pane ?? null });
  return out;
}

const GENERIC = new Set(["program", "agent"]);
function programName(t) {
  const p = t.program;
  if (p && !p.shell && p.key && !GENERIC.has(p.key)) return p.key;
  return p?.name || t.app || t.agent || "";
}

const subStatus = (k, listed) => statusOf({ status: kidStatus(k, listed) }) ?? "seen";

function subsOf(t, { kids, listed, now }) {
  const app = t.app ?? t.agent ?? t.program?.key;
  const inside = hookSubs(t.labels, now)
    .filter((h) => sameApp(app, h.app))
    .map((h) => ({
      key: `${t.address}:${h.app}:${h.id}`,
      ...subRow(h),
      status: "working",
      age: h.at > 0 ? duration(Math.max(0, now - h.at)) : "",
      lines: [],
    }));
  const terminals = subTree(kids, t.address).map(({ k, lines }) => ({
    key: k.address,
    text: k.name || k.template || k.program?.name || k.address,
    badge: "",
    status: subStatus(k, listed),
    age: "",
    lines,
  }));
  return [...inside, ...terminals];
}

function sessionRow(t, where, ctx) {
  const tab = where?.tab ?? null,
    status = statusOf(t),
    labels = readLabels(t.labels);
  const since = status === "working" ? (tab?.working_since ?? tab?.changed_at) : tab?.changed_at;
  const exited = status === "exited";
  // When it entered its state: the tab's change time (working: when it began working), else the board's own note
  // of seeing it change (ctx.changeAt). A dot pulses only while that is fresh (lib/attention.js).
  const stateSince = since > 0 ? since : (ctx.changeAt[t.address] ?? 0);
  const unseenSince = status === "unseen" ? stateSince : 0;
  const archived = Boolean(tab?.settled);
  // The CLI's conversation, if the prompt hook has seen one; asleep means the board stopped the CLI itself.
  const session = parseSession(labels.session) ? labels.session : null;
  const resume = { exited, session, address: t.address, asleep: exited && labels.asleep };
  return {
    id: t.address,
    address: t.address,
    pane: where?.pane ?? null,
    tab: tab?.id ?? null,
    cwd: t.cwd ?? "",
    status,
    exited,
    offers: exited ? ["relaunch", "delete"] : [],
    archived,
    fresh: freshState(status, archived, stateSince, ctx.now),
    unseenSince,
    stateSince,
    title: tab?.named && tab.name ? tab.name : NEW_SESSION,
    program: programName(t),
    model: labels.launch?.model ?? "",
    effort: labels.launch?.effort ?? "",
    launch: labels.launch,
    prompt: labels.prompt,
    session,
    asleep: resume.asleep,
    changedAt: tab?.changed_at > 0 ? tab.changed_at : 0,
    age: tab?.settled ? "archived" : exited ? resumeHint(resume) || "exited" : since ? duration(Math.max(0, ctx.now - since)) : "",
    subs: subsOf(t, ctx),
    ports: ctx.ports?.[t.address] ?? [],
  };
}

// Every list is ordered by status: needs you, working, unseen, seen, then grey last (exited
// rows and nebula rows). The sort is stable, so rows keep their order within a status.
const rank = (s) => {
  const i = STATUS_ORDER.indexOf(s);
  return i < 0 ? STATUS_ORDER.length : i;
};
const greyLast = (r) => rank(r.kind === "nebula" ? null : r.status);
export const byStatus = (rows) => [...rows].sort((a, b) => greyLast(a) - greyLast(b));
// A band's rows: live, then archived, then nebula's, each group in status order.
export const byGroup = (rows) => [...rows].sort((a, b) => rowGroup(a) - rowGroup(b) || greyLast(a) - greyLast(b));

const counts = (rows) => tally(rows.map((r) => r.status));

// Whether the board may offer to remove a checkout: a named linked worktree, never the
// repo's own checkout (wt's `main`) or the default branch.
const canDelete = (root, branch, path, git) => Boolean(branch) && isLinked(root, path) && !git.main && !git.isDefault;

const gitOf = (wt, path) => wt[norm(path)] ?? { ahead: 0, added: 0, deleted: 0 };

// `showEmpty` keeps the bands with no session (a checkout of its own with nothing running);
// `changeAt` is { [terminal]: ms } the board noted for tabs that carry no change time (lib/attention.js).
// `ports` is { [terminal]: [port] }, the TCP ports each terminal's programs listen on (lib/ports.js).
// `nebula` is nebula's joined session list (lib/nebula-sessions.js) and `resumed` the
// shared "nebula.resumed" map. Their rows follow the live ones in the band holding their
// worktree, or land in Other with the stray terminals.
export function buildBoard({
  terminals = [],
  agents = [],
  panes = [],
  spaces = [],
  repos = [],
  wt = {},
  now = Date.now(),
  showArchived = false,
  nebula = [],
  resumed = {},
  showEmpty = false,
  changeAt = {},
  ports = {},
}) {
  const where = tabLookup(agents, panes, spaces);
  const g = groupSessions(
    terminals.filter((t) => showArchived || !where.get(t.address)?.tab?.settled),
    repos,
  );
  const ctx = { kids: byParent(terminals), listed: new Map(agents.map((a) => [a.address, a.status])), now, changeAt, ports };
  const rowOf = (t) => sessionRow(t, where.get(t.address), ctx);
  const mine = new Map(),
    strays = [];
  for (const s of visibleSessions(nebula, resumed, new Set(terminals.map((t) => t.address)))) {
    const b = bestBand(g.repos, s.worktree);
    if (!b) strays.push(nebulaRow(s));
    else mine.set(b, [...(mine.get(b) ?? []), nebulaRow(s)]);
  }
  const out = g.repos.map((r) => {
    const bands = r.bands
      .filter((b) => showEmpty || b.sessions.length || mine.has(b))
      .map((b) => {
        const git = gitOf(wt, b.path);
        return {
          path: b.path,
          branch: b.branch ?? git.branch ?? null,
          label: b.branch ?? git.branch ?? baseName(b.path),
          ahead: git.ahead,
          added: git.added,
          deleted: git.deleted,
          deletable: canDelete(r.root, b.branch ?? git.branch ?? null, b.path, git),
          rows: byGroup([...b.sessions.map(rowOf), ...(mine.get(b) ?? [])]),
        };
      });
    const rows = bands.flatMap((b) => b.rows);
    stampOdd(rows);
    return { root: r.root, name: r.name, bands, rows, counts: counts(rows) };
  });
  if (g.other.length || strays.length) {
    const rows = byGroup([...g.other.map(rowOf), ...strays]);
    stampOdd(rows);
    out.push({ root: OTHER, name: "Other", bands: [{ path: "", branch: null, label: "", ahead: 0, added: 0, deleted: 0, rows }], rows, counts: counts(rows) });
  }
  return { repos: out };
}

export const summaryParts = (repo) =>
  STATUS_ORDER.filter((s) => repo.counts[s] > 0).map((s) => ({ status: s, n: repo.counts[s], color: COLOR[s], label: LABEL[s] }));

// The git stats of a worktree band as coloured pieces: ahead (cyan), added (green), deleted (red).
export const BAND_COLOR = { ahead: "ansi6", added: "ansi2", deleted: "ansi1" };
export const bandStats = (b) =>
  [
    b.ahead > 0 && { kind: "ahead", text: `↑${b.ahead}` },
    b.added > 0 && { kind: "added", text: `+${b.added}` },
    b.deleted > 0 && { kind: "deleted", text: `−${b.deleted}` },
  ].filter(Boolean);
export const bandParts = (b) => bandStats(b).map((p) => p.text);

// Items are what a view draws, one per line: { key, type, ... }. Types: repo, band,
// session (with its row), sub (nested under the session before it), divider, shelf (the thin
// "Archived" line above a band's archived rows), vacant (the line under a band with no session,
// which `p` and `d` act on), empty. Only repo, session and vacant can hold the cursor, and their
// keys are the cursor's ids: a session's address, `repo:<root>` or `vacant:<path>`.
const repoKey = (repo) => `repo:${repo.root}`;

// A band folds by its path (`folded` is a Set of paths); the header stays and stands for
// the hidden sessions with their status counts. A band with no label (Other) has no header
// and cannot fold.
export const bandSummary = (b) => summaryParts({ counts: tally(b.rows.map((r) => r.status)) });
export const bandPaths = (repo) => (repo?.bands ?? []).filter((b) => b.label).map((b) => b.path);

// Folds (true) or unfolds (false) every band of `repos` in a copy of the folded set.
export function foldBands(folded, repos, fold) {
  const out = new Set(folded);
  for (const p of repos.flatMap(bandPaths)) fold ? out.add(p) : out.delete(p);
  return out;
}

// The dim line of a band with no session: what can be done there. `d` is offered only where the
// board may remove the checkout (never the repo's own, never the default branch).
export const vacantHint = (band) => `nothing running · ⌘K new session${band.deletable ? " · d delete worktree" : ""}`;

function bandItems(repo, folded) {
  return repo.bands.flatMap((b) => [
    ...(b.label ? [{ key: `band:${b.path}`, type: "band", band: b, folded: folded.has(b.path) }] : []),
    ...(b.label && !b.rows.length && !folded.has(b.path) ? [{ key: `vacant:${b.path}`, type: "vacant", band: b, root: repo.root }] : []),
    ...(b.label && folded.has(b.path) ? [] : b.rows).flatMap((row, i, rows) => [
      ...(row.archived && !rows[i - 1]?.archived ? [{ key: `archived:${b.path}`, type: "shelf", text: "Archived" }] : []),
      { key: row.id, type: "session", row },
      ...row.subs.map((sub) => ({ key: `sub:${sub.key}`, type: "sub", sub, parent: row.id })),
    ]),
  ]);
}

export function treeItems(model, folded, empty = "No repos yet", bands = new Set()) {
  if (!model.repos.length) return [{ key: "empty", type: "empty", text: empty }];
  return model.repos.flatMap((repo) => [
    { key: repoKey(repo), type: "repo", repo, folded: folded.has(repo.root) },
    ...(folded.has(repo.root) ? [] : bandItems(repo, bands)),
  ]);
}

// Cards and List: on All the projects with their headers (as Tree), on a project tab that
// project's bands alone (the model holds only it, see lib/tabs.js).
export function listItems(model, { all = false, empty = "No repos yet", bands = new Set(), folded = new Set() } = {}) {
  if (all) return treeItems(model, folded, empty, bands);
  const repo = model.repos[0];
  if (!repo) return [{ key: "empty", type: "empty", text: empty }];
  return repo.bands.length ? bandItems(repo, bands) : [{ key: "empty", type: "empty", text: "No sessions" }];
}

const columnsMemo = new WeakMap();

export function columnsModel(model) {
  if (columnsMemo.has(model)) return columnsMemo.get(model);
  const all = model.repos.flatMap((repo) =>
    repo.bands.flatMap((b) => b.rows.map((row) => ({ ...row, where: [repo.name, b.label].filter(Boolean).join(" / ") }))),
  );
  const order = model.sort === "name" ? (rows) => [...rows].sort(byName((r) => r.title)) : byStatus;
  const out = COLUMNS.map((c) => ({
    ...c,
    color: COLOR[c.status],
    rows: order(all.filter((r) => (c.status === "seen" ? r.status === "seen" || r.status === "exited" : r.status === c.status))),
  }));
  columnsMemo.set(model, out);
  return out;
}

// Projects mode of Columns (Miller columns): projects, the selected project's worktrees,
// the selected worktree's sessions. `sel` is { project, worktree } (a repo root and a band
// path); a missing or stale one falls back, the project to the selected tab (`rail`) when it
// has sessions, else the first project with sessions, and the worktree to the first. On a project
// tab (`scoped`) the model holds that project alone and the PROJECTS column is left out. Each
// project and worktree carries the most urgent status of its sessions (exited sorts last), and
// both columns are ordered by it, all-grey ones last.
const URGENT = [...STATUS_ORDER, "exited"];
export const rollup = (rows) => URGENT.find((s) => rows.some((r) => r.status === s)) ?? "exited";

// A model sorted by name (lib/arrange.js) keeps its own order.
const byUrgency = (items, model) => (model.sort === "name" ? items : [...items].sort((a, b) => rank(a.status) - rank(b.status)));

export function projectColumns(model, sel = {}, rail = null, scoped = false) {
  const repos = model.repos;
  const repo =
    repos.find((r) => r.root === sel?.project) ?? repos.find((r) => r.root === rail && r.rows.length) ?? repos.find((r) => r.rows.length) ?? repos[0] ?? null;
  const band = repo?.bands.find((b) => b.path === sel?.worktree) ?? repo?.bands[0] ?? null;
  return {
    projects: byUrgency(
      repos.map((r) => ({ key: r.root, name: r.name, status: rollup(r.rows), count: r.rows.length })),
      model,
    ),
    worktrees: byUrgency(
      (repo?.bands ?? []).map((b) => ({ key: b.path, label: b.label || repo.name, status: rollup(b.rows), count: b.rows.length })),
      model,
    ),
    sessions: band?.rows ?? [],
    sel: { project: repo?.root ?? null, worktree: band?.path ?? null },
    scoped,
    // One worktree (or none): the WORKTREES column is left out and SESSIONS names the branch.
    single: (repo?.bands ?? []).length <= 1,
  };
}

// The cursor's keys: `proj:<root>`, `wt:<path>`, and a session's address.
export const projectItems = (pc) => [
  ...(pc.scoped ? [] : pc.projects).map((project) => ({ key: `proj:${project.key}`, type: "project", project })),
  ...pc.worktrees.map((worktree) => ({ key: `wt:${worktree.key}`, type: "worktree", worktree })),
  ...pc.sessions.map((row) => ({ key: row.id, type: "session", row })),
];

export const stopsOf = (items) => items.filter((i) => ["session", "repo", "project", "worktree", "vacant"].includes(i.type)).map((i) => i.key);

export function placeCursor(stops, cursor, lastIndex = 0) {
  if (!stops.length) return { id: null, index: 0 };
  const i = stops.indexOf(cursor);
  if (i >= 0) return { id: cursor, index: i };
  const j = Math.min(Math.max(lastIndex, 0), stops.length - 1);
  return { id: stops[j], index: j };
}

export function stepCursor(stops, cursor, delta) {
  if (!stops.length) return null;
  const i = stops.indexOf(cursor);
  return i < 0 ? stops[0] : stops[Math.min(Math.max(i + delta, 0), stops.length - 1)];
}

// Rows of Herdr terminals: nebula's own rows are not agents Herdr can show or step to.
const isLive = (r) => r.kind !== "nebula";
const live = (model) => model.repos.flatMap((r) => r.rows).filter(isLive);

// `statuses` narrows the walk: ["unseen"] is the next finished agent that has not been looked at (lib/order.js).
export const attentionTarget = (model, from, dir, statuses) =>
  nextAttention(
    live(model).map((r) => ({ id: r.id, status: r.status })),
    from,
    dir,
    statuses,
  );

// The model is what the board shows (the selected tab). opts: { mode: "projects", sel } puts Columns' selected project first, in worktree order.
export function agentOrder(model, view, root, opts = {}) {
  const tree = live(model).map((r) => r.id);
  let first = [];
  if (view === "columns" && opts.mode === "projects")
    first = (model.repos.find((r) => r.root === projectColumns(model, opts.sel, root).sel.project)?.rows ?? []).filter(isLive).map((r) => r.id);
  else if (view === "columns")
    first = columnsModel(model)
      .flatMap((c) => c.rows)
      .filter(isLive)
      .map((r) => r.id);
  const seen = new Set(first);
  return [...first, ...tree.filter((id) => !seen.has(id))];
}

export function parseWt(text) {
  let items, repoDefault;
  try {
    const parsed = JSON.parse(text);
    items = parsed?.items;
    repoDefault = parsed?.repo?.default_branch;
  } catch {
    return {};
  }
  const out = {};
  for (const it of Array.isArray(items) ? items : []) {
    const path = it?.worktree?.path;
    if (!path) continue;
    const d = it.worktree.changes?.diff;
    out[norm(path)] = {
      branch: it.branch ?? null,
      main: it.worktree.main === true,
      isDefault: Boolean(it.branch) && it.branch === repoDefault,
      ahead: it.upstream?.ahead ?? 0,
      added: d?.added ?? 0,
      deleted: d?.deleted ?? 0,
    };
  }
  return out;
}

// Whether a batch of changed paths sits entirely under the git dir's objects folder:
// `wt list` rewrites pack files there on every run, so such a batch is not a change.
export function objectsOnly(paths, commonDir) {
  const objects = `${norm(commonDir)}/objects`;
  return paths.length > 0 && paths.every((p) => p === objects || p.startsWith(`${objects}/`));
}
