// Keeping herdr-nebula up to date. `herdr-nebula update --check --json` reports where the installed copy
// stands against GitHub's main; the icon bar asks it once a day and offers the update in a popup; a click
// runs `herdr-nebula update` (pull, reinstall; Herdr reloads changed mods by itself). A copy with its own
// changes (a developer checkout) is never updated automatically. Pure, so node can test it. No herdr imports.

export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
// The nebula logo, on every herdr-nebula update popup.
export const LOGO = "mods/nebula/icons/nebula-logo.png";

// { behind, ahead, dirty, branch } (from git) -> "current" | "available" | "local".
// local: commits or edits of its own, or not on main; the update is left to git.
export function updateState({ behind = 0, ahead = 0, dirty = false, branch = "main" } = {}) {
  if (dirty || ahead > 0 || branch !== "main") return behind > 0 ? "local" : "current";
  return behind > 0 ? "available" : "current";
}

// The popup for an available update, or null. `subjects`: the new commits' subjects, newest first.
export function updateNotice(report) {
  const state = updateState(report);
  if (state === "current") return null;
  const n = report.behind,
    changes = `${n} change${n === 1 ? "" : "s"}`;
  if (state === "local")
    return { title: "herdr-nebula has updates", body: `${changes} on GitHub; your copy has its own changes, so pull with git`, level: "info", icon: LOGO };
  const first = (report.subjects ?? [])[0];
  return {
    title: "herdr-nebula update",
    body: first ? `${changes} · ${first} · click to update` : `${changes} · click to update`,
    level: "info",
    icon: LOGO,
    action: { name: "nebula.update", args: {} },
  };
}

// Whether to show the popup for this report: once per latest commit, so a dismissed update does not nag.
export const shouldNotify = (report, seenLatest) => Boolean(report?.latest) && updateState(report) !== "current" && report.latest !== seenLatest;

// The check's JSON from git's outputs: rev-list counts ("behind\tahead"), status --porcelain, the branch,
// HEAD and origin/main, and the new subjects (one per line). -> the report.
export function parseCheck({ counts, status, branch, head, latest, log }) {
  const [behind, ahead] = String(counts ?? "0\t0")
    .trim()
    .split(/\s+/)
    .map((n) => Number(n) || 0);
  return {
    behind,
    ahead,
    dirty: String(status ?? "").trim().length > 0,
    branch: String(branch ?? "").trim(),
    head: String(head ?? "").trim(),
    latest: String(latest ?? "").trim(),
    subjects: String(log ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  };
}

// Settings' Updates line for a report (or none yet).
export function updateLine(report) {
  if (!report) return "Not checked yet";
  const state = updateState(report),
    n = report.behind;
  if (state === "current") return `Up to date (${report.head})`;
  if (state === "local") return `${n} new on GitHub; your copy has its own changes, pull with git`;
  return `${n} new change${n === 1 ? "" : "s"} (${report.head} to ${report.latest})`;
}

// The JSON report in a login shell's output, or null. Rc files and terminal integrations (iTerm's
// shell-integration escapes) may print before it, even on the same line, so it starts at the first `{"`.
export function reportIn(stdout) {
  const line = String(stdout ?? "")
    .split("\n")
    .reverse()
    .find((l) => l.includes('{"'));
  try {
    return line ? JSON.parse(line.slice(line.indexOf('{"'))) : null;
  } catch {
    return null;
  }
}
