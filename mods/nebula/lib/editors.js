// Where a session's folder opens: the editors installed on this Mac, offered in the row's right-click menu
// ("Open in Zed", "Open in VS Code", ..., "Reveal in Finder"), with ⇧↩ using the first one. A custom command
// in Settings (the editor setting, anything but "open") still wins for ⇧↩. They open through macOS
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

// What ⇧↩ opens: a custom command from Settings (anything but the default "open"), else the first
// installed editor, else Finder. -> { cmd, args }.
export function defaultOpen(setting, installed, path) {
  const custom = String(setting ?? "").trim();
  if (custom && custom !== "open") {
    const [cmd, ...args] = custom.split(/\s+/);
    return { cmd, args: [...args, path] };
  }
  return openIn(installed?.[0]?.id ?? "finder", path);
}

// The right-click menu items for a row: one per installed editor, the first carrying ⇧↩.
export const editorItems = (installed) =>
  (installed ?? [FINDER]).map((e, i) => ({
    id: `editor:${e.id}`,
    label: e.id === "finder" ? "Reveal in Finder" : `Open in ${e.label}`,
    key: i === 0 ? "⇧↩" : "",
  }));
