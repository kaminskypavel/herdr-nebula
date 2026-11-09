import { groupSessions, bestBand, norm, baseName } from "./projects.js";
import { statusOf, tally, COLOR, STATUS_ORDER } from "./status.js";
import { readLabels } from "./labels.js";
import { duration, hookSubs, sameApp, byParent, tree as subTree, kidStatus, subRow } from "./subagents.js";
import { nextAttention } from "./order.js";
import { visibleSessions, nebulaRow } from "./nebula-sessions.js";

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
  const inside = hookSubs(t.labels, now).filter((h) => sameApp(app, h.app)).map((h) => ({
    key: `${t.address}:${h.app}:${h.id}`, ...subRow(h), status: "working",
    age: h.at > 0 ? duration(Math.max(0, now - h.at)) : "", lines: [],
  }));
  const terminals = subTree(kids, t.address).map(({ k, lines }) => ({
    key: k.address, text: k.name || k.template || k.program?.name || k.address, badge: "", status: subStatus(k, listed), age: "", lines,
  }));
  return [...inside, ...terminals];
}

function sessionRow(t, where, ctx) {
  const tab = where?.tab ?? null, status = statusOf(t), labels = readLabels(t.labels);
  const since = status === "working" ? tab?.working_since ?? tab?.changed_at : tab?.changed_at;
  const exited = status === "exited";
  return {
    id: t.address, address: t.address, pane: where?.pane ?? null, tab: tab?.id ?? null, cwd: t.cwd ?? "",
    status, exited, offers: exited ? ["relaunch", "delete"] : [], archived: Boolean(tab?.settled),
    title: tab?.named && tab.name ? tab.name : NEW_SESSION,
    program: programName(t), model: labels.launch?.model ?? "", launch: labels.launch, prompt: labels.prompt,
    age: exited ? "exited" : since ? duration(Math.max(0, ctx.now - since)) : "",
    subs: subsOf(t, ctx),
  };
}

const counts = (rows) => tally(rows.map((r) => r.status));

const gitOf = (wt, path) => wt[norm(path)] ?? { ahead: 0, added: 0, deleted: 0 };

// `nebula` is nebula's joined session list (lib/nebula-sessions.js) and `resumed` the
// shared "nebula.resumed" map. Their rows follow the live ones in the band holding their
// worktree, or land in Other with the stray terminals.
export function buildBoard({ terminals = [], agents = [], panes = [], spaces = [], repos = [], wt = {}, now = Date.now(), showArchived = false, nebula = [], resumed = {} }) {
  const where = tabLookup(agents, panes, spaces);
  const g = groupSessions(terminals.filter((t) => showArchived || !where.get(t.address)?.tab?.settled), repos);
  const ctx = { kids: byParent(terminals), listed: new Map(agents.map((a) => [a.address, a.status])), now };
  const rowOf = (t) => sessionRow(t, where.get(t.address), ctx);
  const mine = new Map(), strays = [];
  for (const s of visibleSessions(nebula, resumed, new Set(terminals.map((t) => t.address)))) {
    const b = bestBand(g.repos, s.worktree);
    if (!b) strays.push(nebulaRow(s));
    else mine.set(b, [...(mine.get(b) ?? []), nebulaRow(s)]);
  }
  const out = g.repos.map((r) => {
    const bands = r.bands.filter((b) => b.sessions.length || mine.has(b)).map((b) => {
      const git = gitOf(wt, b.path);
      return { path: b.path, branch: b.branch ?? git.branch ?? null, label: b.branch ?? git.branch ?? baseName(b.path), ahead: git.ahead, added: git.added, deleted: git.deleted, rows: [...b.sessions.map(rowOf), ...(mine.get(b) ?? [])] };
    });
    const rows = bands.flatMap((b) => b.rows);
    return { root: r.root, name: r.name, bands, rows, counts: counts(rows) };
  });
  if (g.other.length || strays.length) {
    const rows = [...g.other.map(rowOf), ...strays];
    out.push({ root: OTHER, name: "Other", bands: [{ path: "", branch: null, label: "", ahead: 0, added: 0, deleted: 0, rows }], rows, counts: counts(rows) });
  }
  return { repos: out };
}

export const selectedRepo = (model, root) =>
  model.repos.find((r) => r.root === root) ?? model.repos.find((r) => r.root !== OTHER) ?? model.repos[0] ?? null;

export const summaryParts = (repo) =>
  STATUS_ORDER.filter((s) => repo.counts[s] > 0).map((s) => ({ status: s, n: repo.counts[s], color: COLOR[s], label: LABEL[s] }));

export const bandParts = (b) => [b.ahead > 0 && `↑${b.ahead}`, b.added > 0 && `+${b.added}`, b.deleted > 0 && `−${b.deleted}`].filter(Boolean);

// Items are what a view draws, one per line: { key, type, ... }. Types: repo, band,
// session (with its row), sub (nested under the session before it), summary (another
// repo in Cards and List), divider, empty. Only repo, session and summary can hold the
// cursor, and their keys are the cursor's ids: a session's address, or `repo:<root>`.
const repoKey = (repo) => `repo:${repo.root}`;

function bandItems(repo) {
  return repo.bands.flatMap((b) => [
    ...(b.label ? [{ key: `band:${b.path}`, type: "band", band: b }] : []),
    ...b.rows.flatMap((row) => [
      { key: row.id, type: "session", row },
      ...row.subs.map((sub) => ({ key: `sub:${sub.key}`, type: "sub", sub, parent: row.id })),
    ]),
  ]);
}

export function treeItems(model, folded) {
  if (!model.repos.length) return [{ key: "empty", type: "empty", text: "No repos yet" }];
  return model.repos.flatMap((repo) => [
    { key: repoKey(repo), type: "repo", repo, folded: folded.has(repo.root) },
    ...(folded.has(repo.root) ? [] : bandItems(repo)),
  ]);
}

export function listItems(model, root) {
  const repo = selectedRepo(model, root);
  if (!repo) return [{ key: "empty", type: "empty", text: "No repos yet" }];
  const others = model.repos.filter((r) => r !== repo);
  return [
    ...(repo.rows.length ? bandItems(repo) : [{ key: "empty", type: "empty", text: "No sessions" }]),
    ...(others.length ? [{ key: "others", type: "divider", text: "Other repos" }] : []),
    ...others.map((r) => ({ key: repoKey(r), type: "summary", repo: r })),
  ];
}

const columnsMemo = new WeakMap();

export function columnsModel(model) {
  if (columnsMemo.has(model)) return columnsMemo.get(model);
  const all = model.repos.flatMap((repo) => repo.bands.flatMap((b) => b.rows.map((row) => ({ ...row, where: [repo.name, b.label].filter(Boolean).join(" / ") }))));
  const out = COLUMNS.map((c) => ({ ...c, color: COLOR[c.status], rows: all.filter((r) => (c.status === "seen" ? r.status === "seen" || r.status === "exited" : r.status === c.status)) }));
  columnsMemo.set(model, out);
  return out;
}

// Projects mode of Columns (Miller columns): projects, the selected project's worktrees,
// the selected worktree's sessions. `sel` is { project, worktree } (a repo root and a band
// path); a missing or stale one falls back, the project to the rail's repo (`rail`) when it
// has sessions, else the first project with sessions, and the worktree to the first. Each
// project and worktree carries the most urgent status of its sessions (exited sorts last).
const URGENT = [...STATUS_ORDER, "exited"];
export const rollup = (rows) => URGENT.find((s) => rows.some((r) => r.status === s)) ?? "exited";

export function projectColumns(model, sel = {}, rail = null) {
  const repos = model.repos;
  const repo = repos.find((r) => r.root === sel?.project) ?? repos.find((r) => r.root === rail && r.rows.length)
    ?? repos.find((r) => r.rows.length) ?? repos[0] ?? null;
  const band = repo?.bands.find((b) => b.path === sel?.worktree) ?? repo?.bands[0] ?? null;
  return {
    projects: repos.map((r) => ({ key: r.root, name: r.name, status: rollup(r.rows), count: r.rows.length })),
    worktrees: (repo?.bands ?? []).map((b) => ({ key: b.path, label: b.label || repo.name, status: rollup(b.rows), count: b.rows.length })),
    sessions: band?.rows ?? [],
    sel: { project: repo?.root ?? null, worktree: band?.path ?? null },
  };
}

// The cursor's keys: `proj:<root>`, `wt:<path>`, and a session's address.
export const projectItems = (pc) => [
  ...pc.projects.map((project) => ({ key: `proj:${project.key}`, type: "project", project })),
  ...pc.worktrees.map((worktree) => ({ key: `wt:${worktree.key}`, type: "worktree", worktree })),
  ...pc.sessions.map((row) => ({ key: row.id, type: "session", row })),
];

export const stopsOf = (items) => items.filter((i) => ["session", "repo", "summary", "project", "worktree"].includes(i.type)).map((i) => i.key);

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

export const attentionTarget = (model, from, dir) =>
  nextAttention(live(model).map((r) => ({ id: r.id, status: r.status })), from, dir);

// opts: { mode: "projects", sel } puts Columns' selected project first, in worktree order.
export function agentOrder(model, view, root, opts = {}) {
  const tree = live(model).map((r) => r.id);
  let first = [];
  if (view === "columns" && opts.mode === "projects") first = (model.repos.find((r) => r.root === projectColumns(model, opts.sel, root).sel.project)?.rows ?? []).filter(isLive).map((r) => r.id);
  else if (view === "columns") first = columnsModel(model).flatMap((c) => c.rows).filter(isLive).map((r) => r.id);
  else if (view === "cards" || view === "list") first = (selectedRepo(model, root)?.rows ?? []).filter(isLive).map((r) => r.id);
  const seen = new Set(first);
  return [...first, ...tree.filter((id) => !seen.has(id))];
}

export function parseWt(text) {
  let items;
  try { items = JSON.parse(text)?.items; } catch { return {}; }
  const out = {};
  for (const it of Array.isArray(items) ? items : []) {
    const path = it?.worktree?.path;
    if (!path) continue;
    const d = it.worktree.changes?.diff;
    out[norm(path)] = { branch: it.branch ?? null, ahead: it.upstream?.ahead ?? 0, added: d?.added ?? 0, deleted: d?.deleted ?? 0 };
  }
  return out;
}

// Whether a batch of changed paths sits entirely under the git dir's objects folder:
// `wt list` rewrites pack files there on every run, so such a batch is not a change.
export function objectsOnly(paths, commonDir) {
  const objects = `${norm(commonDir)}/objects`;
  return paths.length > 0 && paths.every((p) => p === objects || p.startsWith(`${objects}/`));
}
