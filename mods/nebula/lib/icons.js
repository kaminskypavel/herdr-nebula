// Project icons: which file in a project is its logo, and what stands in when there is none.
// Pure; no herdr imports, so node can test it. lib/icon-scan.js does the file reading.
//
// A project's icon is a favicon, logo, icon or apple-touch-icon file in its repo. The best candidate
// is hashed; a hash that two or more projects picked is a framework default (the create-next-app
// favicon, the CRA logo, ...) and says nothing about the project, so those projects get initials.
// Without an icon: two letters on a color picked from the name.

export const MAX_ICON_BYTES = 512 * 1024;
// Where the board keeps the chosen files (under the app home; a hidden folder, so saving there does not reload the mod).
export const CACHE_DIR = "mods/nebula/.icons";

const STEMS = ["apple-touch-icon", "logo", "favicon", "icon"];
const EXTS = ["svg", "png", "jpg", "jpeg", "webp", "ico"];
const PREFERRED = ["apple-touch-icon.png", "logo.svg", "logo.png", "favicon.svg", "favicon.png", "icon.svg", "icon.png", "favicon.ico"];
const NAME = /^(apple-touch-icon|logo|favicon|icon)[^/]*\.(svg|png|jpe?g|webp|ico)$/;
const SKIP = /^(node_modules|tests?|__tests__|fixtures?|mockups?|\.?storybook)$/i;

// Lower is better; null when the path is no icon candidate. Exact preferred names come first
// (the order above), then any other match by stem and extension.
export function iconRank(path, { ico = true } = {}) {
  const parts = String(path).split("/"), base = parts.pop().toLowerCase();
  const m = NAME.exec(base);
  if (!m || parts.some((p) => SKIP.test(p)) || (!ico && m[2] === "ico")) return null;
  const exact = PREFERRED.indexOf(base);
  return exact >= 0 ? exact : 10 + STEMS.indexOf(m[1]) * 10 + EXTS.indexOf(m[2]);
}

// The candidates among `paths` (relative to the project), best first; a shorter path wins a tie.
export function rankIcons(paths, opts) {
  return paths.map((p) => ({ p, r: iconRank(p, opts) })).filter((x) => x.r !== null)
    .sort((a, b) => a.r - b.r || a.p.length - b.p.length || (a.p < b.p ? -1 : a.p > b.p ? 1 : 0)).map((x) => x.p);
}

// picks: { [root]: { hash, ext } | null }. A hash picked by 2 or more projects becomes null for all of them.
export function dropShared(picks) {
  const seen = {};
  for (const p of Object.values(picks)) if (p) seen[p.hash] = (seen[p.hash] ?? 0) + 1;
  return Object.fromEntries(Object.entries(picks).map(([root, p]) => [root, p && seen[p.hash] < 2 ? p : null]));
}

// Two letters: the first letters of the first two words (split on - _ and space), else the first two characters.
export function initialsOf(name) {
  const words = String(name ?? "").split(/[-_\s]+/).filter(Boolean).map((w) => [...w]);
  const chars = words.length >= 2 ? [words[0][0], words[1][0]] : (words[0] ?? ["?"]).slice(0, 2);
  return chars.join("").toUpperCase();
}

// Mid-dark colors: white initials read on each, and each reads on Dracula's dark chrome.
export const PALETTE = ["#7a5fc8", "#b8508a", "#c4663c", "#3f9a6b", "#2f8fa8", "#4f6fc7", "#a8553f", "#7d8a2e"];

export function colorOf(name) {
  let h = 2166136261; // FNV-1a
  for (const c of String(name ?? "")) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const cachedPath = (pick) => `${CACHE_DIR}/${pick.hash}.${pick.ext}`;

// The shared "nebula.icons" value: { [root]: { path, initials, color } }; path is null when the
// project has no icon of its own. projects: [{ root, name }].
export function buildIcons(projects, picks) {
  const kept = dropShared(Object.fromEntries(projects.map((p) => [p.root, picks[p.root] ?? null])));
  return Object.fromEntries(projects.map((p) => [p.root, {
    path: kept[p.root] ? cachedPath(kept[p.root]) : null, initials: initialsOf(p.name), color: colorOf(p.name),
  }]));
}

// The entry to draw for a project: the published one, else initials worked out on the spot (before the scan is done).
export const iconFor = (icons, root, name) => icons?.[root] ?? { path: null, initials: initialsOf(name), color: colorOf(name) };
