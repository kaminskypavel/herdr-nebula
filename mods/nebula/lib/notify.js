// The macOS notification for an agent that started waiting while the window is in the background: the shell
// script that finds the tools, and the arguments for terminal-notifier (a click opens that agent in the right
// Herdr window) or, without it, osascript (no click action). Pure string building, so node can test the quoting.

// The Herdr app's bundle id: a click on the notification brings that window forward.
export const BUNDLE = "dev.herdr.app";

// Prints `herdr-app=<path>` and `terminal-notifier=<path>` (empty when missing). Run in a login shell, as the
// update check does, so the user's PATH applies.
export const TOOLS_SCRIPT = `printf 'herdr-app=%s\\n' "$(command -v herdr-app)"; printf 'terminal-notifier=%s\\n' "$(command -v terminal-notifier)"`;

/** The tool paths in TOOLS_SCRIPT's output: { herdr, notifier }, each a path or null. */
export function parseTools(stdout) {
  const find = (name) => new RegExp(`^${name}=(/.+)$`, "m").exec(String(stdout ?? ""))?.[1].trim() ?? null;
  return { herdr: find("herdr-app"), notifier: find("terminal-notifier") };
}

/** `s` as one shell word in single quotes (a quote inside becomes '\'' ). */
export const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

// One line: a newline would end an AppleScript string or a shell word early.
const oneLine = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();

/** The shell command a click runs: focus `terminal` in the window of the Herdr home `home`. */
export const focusShell = ({ home, bin, terminal }) => `HERDR_APP_HOME=${shq(home)} ${shq(bin)} do agent.focus ${shq(JSON.stringify({ terminal }))}`;

/** The arguments for terminal-notifier. `group` replaces an older notification of the same row. */
export const notifierArgs = ({ title, message, group, home, bin, terminal }) => [
  "-title",
  oneLine(title),
  "-message",
  oneLine(message) || " ",
  "-group",
  group,
  "-activate",
  BUNDLE,
  "-execute",
  focusShell({ home, bin, terminal }),
];

// An AppleScript string literal.
const quoted = (s) => `"${oneLine(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** The arguments for osascript, the fallback with no click action. */
export const osascriptArgs = (title, message) => ["-e", `display notification ${quoted(message)} with title ${quoted(title)}`];

/** What to say when the agent's own words cannot be read. */
export const fallbackLine = (status) => (status === "needs" ? "needs you" : "finished");

// Whether any Herdr window is the front app: the shell line prints the front app's bundle id, and every Herdr
// window (a second one runs with its own HERDR_APP_ID) shares Herdr's bundle. Asked only while this window is in
// the background, so switching between two Herdr windows is not "away".
export const FRONT_SCRIPT = 'lsappinfo info -only bundleid "$(lsappinfo front)"';
export const herdrInFront = (stdout) => String(stdout ?? "").includes(`"${BUNDLE}"`);
export const FRONT_POLL_MS = 2000;

// A notification is posted once per agent and state across Herdr windows: the window that makes this folder first
// posts it. (ponytail: the folders stay in /tmp until the next reboot; a few bytes each.)
export const NOTIFIED_DIR = "/tmp/herdr-nebula-notified";
export const notifiedLock = (id, key) => `${NOTIFIED_DIR}/${String(`${id}-${key}`).replace(/[^A-Za-z0-9_-]/g, "_")}`;
