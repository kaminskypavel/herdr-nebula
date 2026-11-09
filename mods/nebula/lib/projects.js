// Sessions grouped by project and checkout. A project is { root, name, checkouts:
// [{ path, branch }] } (the main checkout first); a live agent terminal belongs to the
// checkout whose folder holds its cwd, the longest folder winning, so a worktree nested
// inside its repo still gets its own band. No herdr imports, so node can test it.
//
// groupSessions(terminals, projects) -> { repos: [{ root, name, bands: [{ path, branch,
// label, sessions }] }], other: [terminal] }. Every project is listed, with a band per
// checkout (empty ones too). A terminal outside every checkout but carrying a git
// `commonDir` of a listed project gets a band of its own at its cwd. Sub-agent terminals
// (with a parent), plain shells and anything not live are left out.
import { statusOf, tally } from "./status.js";

// A path without trailing slashes ("/" stays "/").
export const norm = (path) => {
  const s = String(path ?? "");
  return s.replace(/\/+$/, "") || (s.startsWith("/") ? "/" : "");
};

// Whether path is root or lies below it.
export const inside = (path, root) => {
  const p = norm(path), r = norm(root);
  if (!p || !r) return false;
  return p === r || p.startsWith(r === "/" ? "/" : `${r}/`);
};

export const baseName = (path) => String(path ?? "").replace(/\/+$/, "").split("/").pop() || String(path ?? "");

// The repo folder behind a git common dir: <repo>/.git -> <repo>. Anything else (a bare
// repo) stands for itself.
export const repoRoot = (commonDir) => norm(commonDir).replace(/\/\.git$/, "");

// The band whose folder holds cwd, the longest folder winning, or null.
export function bestBand(repos, cwd) {
  let best = null, depth = -1;
  for (const repo of repos) {
    for (const b of repo.bands) {
      const len = norm(b.path).length;
      if (inside(cwd, b.path) && len > depth) { best = b; depth = len; }
    }
  }
  return best;
}

const band = (path, branch = null) => ({ path, branch, label: branch ?? baseName(path), sessions: [] });

export function groupSessions(terminals, projects) {
  const repos = projects.map((p) => ({
    root: p.root, name: p.name ?? baseName(p.root), bands: (p.checkouts ?? []).map((c) => band(c.path, c.branch ?? null)),
  }));
  const other = [];
  const extra = new Map();

  const place = (t) => {
    const best = bestBand(repos, t.cwd);
    if (best) return best;
    if (!t.commonDir || !t.cwd) return null;
    const home = repos.find((repo) => norm(repo.root) === repoRoot(t.commonDir));
    if (!home) return null;
    const key = `${home.root}\n${norm(t.cwd)}`;
    if (!extra.has(key)) {
      extra.set(key, band(t.cwd));
      home.bands.push(extra.get(key));
    }
    return extra.get(key);
  };

  for (const t of terminals) {
    if (t.parent || t.state !== "live" || statusOf(t) === null) continue;
    (place(t)?.sessions ?? other).push(t);
  }
  return { repos, other };
}

export const repoCounts = (repo) => tally(repo.bands.flatMap((b) => b.sessions).map(statusOf));
