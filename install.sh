#!/bin/sh
# One-line install:
#   curl -fsSL https://raw.githubusercontent.com/kaminskypavel/herdr-nebula/main/install.sh | sh
# Clones (or updates) herdr-nebula into ~/.local/share/herdr-nebula, runs its installer and
# switches Herdr to the nebula layout. HERDR_NEBULA_DIR picks another folder.
set -eu

fail() { echo "herdr-nebula: $1" >&2; exit 1; }
command -v herdr-app >/dev/null 2>&1 || fail "install the Herdr app first: https://herdr.dev"
command -v git >/dev/null 2>&1 || fail "git is required"
command -v node >/dev/null 2>&1 || fail "Node 22 or newer is required"
node -e 'process.exit(Number(process.versions.node.split(".")[0]) < 22 ? 1 : 0)' || fail "Node 22 or newer is required"

dir="${HERDR_NEBULA_DIR:-$HOME/.local/share/herdr-nebula}"
if [ -d "$dir/.git" ]; then
  git -C "$dir" pull --ff-only --quiet
else
  git clone --quiet --depth 1 https://github.com/kaminskypavel/herdr-nebula "$dir"
fi

sh "$dir/scripts/install.sh"
herdr-app do layout.switch '{"name":"nebula"}' >/dev/null 2>&1 || true
echo "herdr-nebula is installed. Cmd+Shift+L switches layouts."
