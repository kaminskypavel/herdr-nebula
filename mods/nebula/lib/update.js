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
  // As Herdr's own: "<name> <version> is ready" with Update and What changed (the notes pane).
  // Named by a release only when main carries a newer tag: commits pushed after a release are still "an update".
  const first = (report.subjects ?? [])[0],
    tag = String(report.version ?? "").replace(/-\d+-g[0-9a-f]+$/, ""),
    named = report.latestVersion && report.latestVersion !== tag ? report.latestVersion : "update";
  return {
    title: `herdr-nebula ${named} is ready`,
    body: first ? `${changes} · ${first}` : changes,
    level: "info",
    icon: LOGO,
    action: { name: "nebula.changes", args: {} },
    actions: [
      { label: "Update", name: "nebula.update", args: {}, primary: true },
      { label: "What changed", name: "nebula.changes", args: {} },
    ],
  };
}

// The popup after an update landed (the version changed since the last check), with What changed.
export const updatedNotice = (report) => ({
  title: `herdr-nebula updated to ${report.version || report.head}`,
  body: "Click to see what changed",
  level: "success",
  icon: LOGO,
  action: { name: "nebula.changes", args: {} },
  actions: [{ label: "What changed", name: "nebula.changes", args: {} }],
});

// Whether to show the popup for this report: once per latest commit, so a dismissed update does not nag.
export const shouldNotify = (report, seenLatest) => Boolean(report?.latest) && updateState(report) !== "current" && report.latest !== seenLatest;

// The check's JSON from git's outputs: rev-list counts ("behind\tahead"), status --porcelain, the branch,
// HEAD and origin/main, and the new subjects (one per line). -> the report.
export function parseCheck({ counts, status, branch, head, latest, log, version }) {
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
    version: String(version ?? "").trim(),
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
  if (state === "current") return `Up to date (${report.version || report.head})`;
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

// The CHANGELOG's sections newer than `version` (a tag like v0.1.0, or git describe's v0.1.0-3-gabc, which
// counts as v0.1.0): "## vX" headings, newest first, up to the installed one. -> [{ version, text }] where text
// is the section's body (markdown). Without a known version, only the newest section.
export function notesSince(changelog, version) {
  const base = String(version ?? "").match(/^v\d+\.\d+\.\d+/)?.[0] ?? null;
  const out = [];
  for (const part of String(changelog ?? "").split(/\n(?=## v\d)/)) {
    const m = part.match(/^## (v\d+\.\d+\.\d+)[^\n]*\n([\s\S]*)$/);
    if (!m) continue;
    if (m[1] === base) break;
    out.push({ version: m[1], text: m[2].trim() });
    if (!base) break;
  }
  return out;
}

// One version's section of the CHANGELOG, or null (what the installed version brought).
export function notesOf(changelog, version) {
  const base = String(version ?? "").match(/^v\d+\.\d+\.\d+/)?.[0];
  if (!base) return null;
  const part = String(changelog ?? "")
    .split(/\n(?=## v\d)/)
    .find((x) => x.startsWith(`## ${base}`));
  return part ? part.replace(/^## [^\n]*\n/, "").trim() : null;
}

// A CHANGELOG section's markdown as lines to draw: "### " headings, "- " bullets, the rest as text. Backticks go.
export function noteLines(text) {
  return String(text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("![") && !l.startsWith("<!--")) // images and comments are for GitHub
    .map((l) => {
      const plain = (s) => s.replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1");
      if (l.startsWith("### ")) return { kind: "head", text: plain(l.slice(4)) };
      if (l.startsWith("- ")) return { kind: "item", text: plain(l.slice(2)) };
      return { kind: "text", text: plain(l) };
    });
}
