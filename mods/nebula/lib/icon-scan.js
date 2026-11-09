// Finds a project's icon on disk (lib/icons.js ranks the candidates) and copies the chosen file into the
// cache folder under the app home, named by its sha1, because image() only loads from there.
// `exec` is herdr's exec, passed in so node can test it.
import { rankIcons, MAX_ICON_BYTES, CACHE_DIR } from "./icons.js";

// Candidate files of a project: tracked files in a git repo, else a shallow find of a plain folder.
const LIST = `cd "$1" || exit 2
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then git ls-files
else find . -maxdepth 3 \\( -name node_modules -o -name .git -o -name dist -o -name build \\) -prune -o -type f -print | sed 's|^\\./||'
fi | grep -iE '(^|/)(apple-touch-icon|favicon|logo|icon)[^/]*\\.(svg|png|jpe?g|webp|ico)$'
[ $? -le 1 ]`;

// The first candidate (in rank order) that is a file within the size limit: hash it, copy it, print "hash<TAB>ext".
const PICK = `root=$1; dest=$2; limit=$3; shift 3
for f in "$@"; do
  p="$root/$f"
  [ -f "$p" ] || continue
  [ "$(wc -c < "$p")" -le "$limit" ] || continue
  h=$(shasum -a 1 < "$p" | cut -c1-40)
  ext=$(printf %s "\${f##*.}" | tr 'A-Z' 'a-z')
  mkdir -p "$dest" || exit 3
  [ -f "$dest/$h.$ext" ] || cp "$p" "$dest/$h.$ext" || continue
  printf '%s\\t%s\\n' "$h" "$ext"
  exit 0
done`;

const sh = (exec, script, args) => exec("/bin/sh", ["-c", script, "sh", ...args], { timeout: 30000 });

// -> { hash, ext }, or null when there is no usable icon (or the scan failed). appHome: the folder CACHE_DIR sits under.
export async function pickIcon(exec, root, appHome, opts) {
  try {
    const list = await sh(exec, LIST, [root]);
    if (list.code !== 0) return null;
    const ranked = rankIcons(list.stdout.split("\n").filter(Boolean), opts).slice(0, 12);
    if (!ranked.length) return null;
    const r = await sh(exec, PICK, [root, `${appHome}/${CACHE_DIR}`, String(MAX_ICON_BYTES), ...ranked]);
    if (r.code !== 0) return null;
    const [hash, ext] = r.stdout.trim().split("\t");
    return hash && ext ? { hash, ext } : null;
  } catch {
    return null;
  }
}
