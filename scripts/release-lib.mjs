// The release notes, drafted from commit subjects (Conventional Commits: `feat(scope): ...`, `fix: ...`).
// scripts/release.mjs reads git and writes files; this part is pure, so node can test it.

// What each commit type and scope reads as in the notes. Types not listed (docs, test, chore, ci, build,
// style, refactor) stay out: the notes are for people using herdr-nebula, not for its developers.
const TYPES = { feat: "Features", fix: "Fixes", perf: "Performance" };
const SCOPES = {
  box: "New session",
  launch: "New session",
  rail: "Icon bar",
  board: "Board",
  motion: "Motion",
  toast: "Notifications",
  confirm: "Dialogs",
  cli: "CLI",
  settings: "Settings",
  hud: "Icon bar",
};

// subjects (newest first, as git log prints them) -> { Features: [...], Fixes: [...], Performance: [...] }, oldest first.
export function group(subjects) {
  const out = {};
  for (const s of [...subjects].reverse()) {
    const m = String(s).match(/^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/);
    const kind = m && TYPES[m[1]];
    if (!kind) continue;
    const text = m[3].charAt(0).toUpperCase() + m[3].slice(1);
    const area = SCOPES[m[2]];
    out[kind] ??= [];
    out[kind].push(area ? `${area}: ${text}` : text);
  }
  return out;
}

// The next version: a minor step when there are features, else a patch step. current: "0.1.0".
export function nextVersion(current, groups) {
  const [major, minor, patch] = String(current || "0.0.0")
    .split(".")
    .map((n) => Number(n) || 0);
  return groups.Features?.length ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
}

// A CHANGELOG section: "## v0.2.0 (2026-11-20)" and a "###" list per kind that has entries.
export const IMAGES = "https://raw.githubusercontent.com/kaminskypavel/herdr-nebula";

export function section(version, date, groups) {
  const parts = Object.values(TYPES)
    .filter((k) => groups[k]?.length)
    .map((k) => `### ${k}\n${groups[k].map((x) => `- ${x}`).join("\n")}`);
  // A slot for screenshots (shot from the demo window, never a real one): the link holds once the tag exists.
  const slot = `<!-- Screenshots: save them in assets/releases/v${version}/ and add ![What it shows](${IMAGES}/v${version}/assets/releases/v${version}/name.png) -->`;
  return `## v${version} (${date})\n\n${slot}\n\n${parts.join("\n\n") || "Maintenance only."}\n`;
}

// The CHANGELOG with a new section on top (under its "# Changelog" heading).
export function insertSection(changelog, sec) {
  const text = String(changelog ?? "");
  const head = text.match(/^# Changelog\n+/);
  return head ? `${head[0]}${sec}\n${text.slice(head[0].length)}` : `# Changelog\n\n${sec}\n${text}`;
}

// One version's section body (for the GitHub release), or null. version: "v0.2.0" or "0.2.0".
export function notesFor(changelog, version) {
  const v = String(version).replace(/^v?/, "v");
  const part = String(changelog ?? "")
    .split(/\n(?=## v\d)/)
    .find((x) => x.startsWith(`## ${v} `) || x.startsWith(`## ${v}\n`));
  // An unfilled screenshot slot (an HTML comment) stays out of the release.
  return part
    ? part
        .replace(/^## [^\n]*\n/, "")
        .replace(/^<!--[^\n]*-->\n*/gm, "")
        .trim()
    : null;
}
