// Where a session's folder opens: the editor picked in Settings (one of those installed on this Mac, shown with its
// app icon), offered in the row's right-click menu as "Open in <it>" (⇧↩) beside Reveal in Finder. An old custom
// command in Settings still works. They open through macOS
// `open -a <App>`, so no command-line helper has to be installed. Pure, so node can test it. No herdr imports.

// In the order ⇧↩ prefers them.
export const EDITORS = [
  { id: "zed", label: "Zed", app: "Zed" },
  { id: "cursor", label: "Cursor", app: "Cursor" },
  { id: "vscode", label: "VS Code", app: "Visual Studio Code" },
  { id: "windsurf", label: "Windsurf", app: "Windsurf" },
  { id: "sublime", label: "Sublime Text", app: "Sublime Text" },
  { id: "webstorm", label: "WebStorm", app: "WebStorm" },
  { id: "xcode", label: "Xcode", app: "Xcode" },
];
export const FINDER = { id: "finder", label: "Finder", app: null };

// The command that lists the app folders (its output feeds installedEditors).
export const LIST_APPS = 'ls -1 /Applications "$HOME/Applications" 2>/dev/null';

// The known editors whose app is installed, in EDITORS order; Finder always last.
export function installedEditors(listing) {
  const apps = new Set(
    String(listing ?? "")
      .split("\n")
      .map((l) => l.trim()),
  );
  return [...EDITORS.filter((e) => apps.has(`${e.app}.app`)), FINDER];
}

// The command for opening `path` in editor `id` (an EDITORS id or "finder"). -> { cmd, args }, or null.
export function openIn(id, path) {
  if (id === "finder") return { cmd: "open", args: ["-R", path] };
  const e = EDITORS.find((x) => x.id === id);
  return e ? { cmd: "open", args: ["-a", e.app, path] } : null;
}

// Where the app icons are kept, under the Herdr home (image() paths are relative to it): ICON_SCRIPT writes
// <id>.png there once per editor, from the app's own .icns.
export const APP_ICONS = "nebula-cache/app-icons";
const FINDER_APP = "/System/Library/CoreServices/Finder";

// Old Settings values were commands ("code", "zed", "open"); they name these editors ("open": the first installed).
const LEGACY = { code: "vscode", zed: "zed", cursor: "cursor", subl: "sublime", xed: "xcode", windsurf: "windsurf", webstorm: "webstorm", open: "" };

/**
 * The editor Settings picked (its "editor" value): an installed one by id (or an old command naming it), else the
 * first installed, else Finder. A command that names no known editor stays a custom command, run as before.
 * -> an installed entry ({ id, label, app, icon? }), or { id: "custom", label, custom }.
 */
export function chosenEditor(setting, installed) {
  const list = installed?.length ? installed : [FINDER];
  const raw = String(setting ?? "").trim();
  const id = Object.hasOwn(LEGACY, raw) ? LEGACY[raw] : raw;
  const hit = list.find((e) => e.id === id);
  if (hit) return hit;
  const known = Object.hasOwn(LEGACY, raw) || EDITORS.some((e) => e.id === raw) || raw === "finder";
  return raw && !known ? { id: "custom", label: raw.split(/\s+/)[0], custom: raw } : list[0];
}

// What ⇧↩ (and the menu's Open in item) opens: the editor Settings picked. -> { cmd, args }.
export function defaultOpen(setting, installed, path) {
  const e = chosenEditor(setting, installed);
  if (e.custom) {
    const [cmd, ...args] = e.custom.split(/\s+/);
    return { cmd, args: [...args, path] };
  }
  return openIn(e.id, path);
}

const FOLDER_ICON = "mods/nebula/icons/folder-open.svg";

// The right-click menu's folder items: one "Open in <the picked editor>" with ⇧↩, then Reveal in Finder (one item
// when Finder is the pick). Each carries the app's icon when ICON_SCRIPT found it.
export function editorItems(installed, setting) {
  const e = chosenEditor(setting, installed),
    finder = (installed ?? []).find((x) => x.id === "finder") ?? FINDER;
  const reveal = { id: "editor:finder", label: "Reveal in Finder", key: "", icon: finder.icon ?? FOLDER_ICON };
  if (e.id === "finder") return [{ ...reveal, id: "folder", key: "⇧↩" }];
  return [{ id: "folder", label: `Open in ${e.label}`, key: "⇧↩", icon: e.icon ?? "mods/nebula/icons/square-code.svg" }, reveal];
}

// Extracts each app's icon to $1/<id>.png (64 px) once and prints the ids that have one. Args after $1: id=app pairs,
// app being a name in /Applications or ~/Applications, or an absolute path without .app.
export const ICON_SCRIPT = `d="$1"; shift; mkdir -p "$d"
for pair in "$@"; do id="\${pair%%=*}"; app="\${pair#*=}"; out="$d/$id.png"
  if [ -s "$out" ]; then echo "$id"; continue; fi
  for base in "" /Applications "$HOME/Applications"; do
    case "$app" in /*) [ -z "$base" ] || continue; p="$app.app" ;; *) [ -n "$base" ] || continue; p="$base/$app.app" ;; esac
    [ -d "$p" ] || continue
    f=$(defaults read "$p/Contents/Info" CFBundleIconFile 2>/dev/null); [ -n "$f" ] || continue
    case "$f" in *.icns) ;; *) f="$f.icns" ;; esac
    sips -s format png -Z 64 "$p/Contents/Resources/$f" --out "$out" >/dev/null 2>&1 && { echo "$id"; break; }
  done
done`; // app names have spaces ("Visual Studio Code"), so paths are never word-split

/** ICON_SCRIPT's arguments for the installed editors (Finder by its system path). */
export const iconArgs = (installed) => installed.map((e) => `${e.id}=${e.id === "finder" ? FINDER_APP : e.app}`);

/** The installed list with each found icon (ICON_SCRIPT's output: one id per line) as its image path. */
export const withIcons = (installed, stdout) => {
  const got = new Set(
    String(stdout ?? "")
      .split("\n")
      .map((l) => l.trim()),
  );
  return installed.map((e) => (got.has(e.id) ? { ...e, icon: `${APP_ICONS}/${e.id}.png` } : e));
};
