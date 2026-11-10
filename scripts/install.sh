#!/bin/sh
# Installs the nebula layout into a Herdr home by copying, so a second run changes
# nothing. Usage: scripts/install.sh [target-dir]   (default ~/.config/herdr-app)
#
# - mods/nebula and mods/nebula-box -> <target>/mods, without the jsconfig.json and
#   gpui-kit.d.ts Herdr writes into mod folders (and keeping mods/nebula/.icons, the cache of project icons)
# - mods/nebula/lib -> <target>/mods/nebula-box/lib (a mod cannot import another folder)
# - layouts/nebula.json -> <target>/layouts
# - keys/nebula.keys.json merged into <target>/keys.json: bindings you have stay as they
#   are, in the same order; only missing ones are added (a backup is kept when it changes)
# - Herdr's own toast and confirm mods back, where an older herdr-nebula replaced them: Herdr restores its
#   shipped mods on every start (and moves edited ones to <mod>-edited), so herdr-nebula no longer replaces
#   them; its own popups are a window of the nebula-box mod.
# - herdr-app check on the installed mods
# - bin/herdr-nebula.mjs linked as ~/.local/bin/herdr-nebula, and its prompt hook added to
#   Claude and Codex settings (real install only)
# The repo's own mods/nebula-box/lib is refreshed the same way (git ignores it), so
# `herdr-app check mods/nebula-box` also works from the repo.
set -eu

repo=$(cd "$(dirname "$0")/.." && pwd)
target=${1:-$HOME/.config/herdr-app}
skip="--exclude=jsconfig.json --exclude=gpui-kit.d.ts"

mkdir -p "$repo/mods/nebula-box/lib" "$target/mods/nebula" "$target/mods/nebula-box/lib" "$target/layouts"

# shellcheck disable=SC2086
rsync -a --delete $skip --exclude=/.icons "$repo/mods/nebula/" "$target/mods/nebula/"
# shellcheck disable=SC2086
rsync -a --delete $skip --exclude=/lib "$repo/mods/nebula-box/" "$target/mods/nebula-box/"
rsync -a --delete "$repo/mods/nebula/lib/" "$repo/mods/nebula-box/lib/"
# shellcheck disable=SC2086
rsync -a --delete $skip "$repo/mods/nebula/lib/" "$target/mods/nebula-box/lib/"
for m in toast confirm; do
  if [ -f "$target/mods/$m/main.js" ] && grep -q "herdr-nebula" "$target/mods/$m/main.js"; then
    if [ -d "$target/backups/$m-herdr" ]; then rsync -a --delete "$target/backups/$m-herdr/" "$target/mods/$m/"; else rm -rf "$target/mods/$m"; fi
  fi
  if [ -f "$target/mods/$m-edited/main.js" ] && grep -q "herdr-nebula" "$target/mods/$m-edited/main.js"; then rm -rf "$target/mods/$m-edited"; fi
done
cmp -s "$repo/layouts/nebula.json" "$target/layouts/nebula.json" || cp "$repo/layouts/nebula.json" "$target/layouts/nebula.json"

node - "$repo/keys/nebula.keys.json" "$target/keys.json" <<'JS'
const fs = require("fs");
const [, , from, to] = process.argv;
const want = JSON.parse(fs.readFileSync(from, "utf8"));
const text = fs.existsSync(to) ? fs.readFileSync(to, "utf8") : null;
let have;
try { have = text === null ? {} : JSON.parse(text); } catch (e) { console.error(`keys: ${to} is not valid JSON (${e.message}); left alone`); process.exit(1); }
let added = 0;
// nebula.focus was renamed nebula.keys (Herdr sends a focusable mod a bare "focus" of its own).
// mod.open:nebula-box became nebula.new in the nebula layout (one New session key that follows the board).
const RENAMED = { "nebula.focus": "nebula.keys" };
for (const [section, binds] of Object.entries(have)) for (const [key, action] of Object.entries(binds ?? {})) {
  const to = RENAMED[action] ?? (section === "layout:nebula" && action === "mod.open:nebula-box" ? "nebula.new" : null);
  if (to) { binds[key] = to; added++; }
}
for (const [section, binds] of Object.entries(want)) {
  have[section] ??= {};
  for (const [key, action] of Object.entries(binds)) {
    if (!(key in have[section])) { have[section][key] = action; added++; }
    else if (have[section][key] !== action) console.log(`keys: kept your ${section} ${key} = ${JSON.stringify(have[section][key])} (nebula wants ${JSON.stringify(action)})`);
  }
}
if (!added) { console.log("keys: up to date"); process.exit(0); }
if (text !== null) fs.copyFileSync(to, `${to}.bak-${Date.now()}`);
fs.writeFileSync(to, JSON.stringify(have, null, 2) + "\n");
console.log(`keys: added ${added} binding${added === 1 ? "" : "s"} to ${to}`);
JS

herdr-app check "$target/mods/nebula"
herdr-app check "$target/mods/nebula-box"
if [ "$target" = "$HOME/.config/herdr-app" ]; then
  mkdir -p "$HOME/.local/bin"
  ln -sfn "$repo/bin/herdr-nebula.mjs" "$HOME/.local/bin/herdr-nebula"
  node "$repo/bin/herdr-nebula.mjs" install-hooks
fi
echo "installed nebula into $target"
