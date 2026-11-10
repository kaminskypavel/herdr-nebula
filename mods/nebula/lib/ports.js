// The TCP ports each agent's terminal is listening on, like cmux's sidebar shows. Every program a
// Herdr terminal starts carries HC_TERMINAL_ID=<address> in its environment (a dev server the agent
// ran included), so one `lsof` for the listening sockets plus `ps eww` for those pids' environment
// maps each port to a terminal. Pure, so node can test it. No herdr imports.

// Prints "<address> <port>" lines, one per listening socket whose process belongs to a Herdr terminal.
// ponytail: one system-wide lsof per poll; per-terminal pid trees if it ever shows up in a profile.
export const PORTS_SCRIPT = `for p in $(lsof -nP -iTCP -sTCP:LISTEN -t 2>/dev/null | sort -u); do
  t=$(ps eww -o command= -p "$p" 2>/dev/null | grep -oE 'HC_TERMINAL_ID=[^ ]+' | head -n 1)
  [ -n "$t" ] || continue
  lsof -nP -a -p "$p" -iTCP -sTCP:LISTEN -F n 2>/dev/null | sed -n "s/^n.*:\\([0-9][0-9]*\\)$/\${t#HC_TERMINAL_ID=} \\1/p"
done`;

// -> { [address]: [port, ...] } sorted, without repeats (IPv4 and IPv6 listen on the same port).
export function parsePorts(out) {
  const by = {};
  for (const line of String(out ?? "").split("\n")) {
    const m = line.trim().match(/^(\S+) (\d+)$/);
    if (!m) continue;
    const port = Number(m[2]);
    if (!(port > 0 && port < 65536)) continue;
    by[m[1]] ??= new Set();
    by[m[1]].add(port);
  }
  return Object.fromEntries(Object.entries(by).map(([k, s]) => [k, [...s].sort((a, b) => a - b)]));
}

export const portUrl = (port) => `http://localhost:${port}`;

// What a row shows: ":3000 :5173", the first three, then "+N".
export function portsLabel(ports, max = 3) {
  if (!ports?.length) return "";
  const more = ports.length - max;
  return (
    ports
      .slice(0, max)
      .map((p) => `:${p}`)
      .join(" ") + (more > 0 ? ` +${more}` : "")
  );
}

// Tree and List take one click handler for the whole list (no handler inside a row), so a click on a
// row's port is found by where it landed: the ports are fixed-width cells at the row's right end.
// `fromRight` is the click's distance from the list's right edge; `inset` the space between that edge
// and the last cell, `width` and `gap` a cell's. Cells hold the first `shown` ports, left to right.
// -> the port clicked, or null.
export function portAt(ports, fromRight, { inset, width, gap, shown = 3 }) {
  let x = fromRight - inset;
  for (const port of (ports ?? []).slice(0, shown).reverse()) {
    if (x < 0) return null;
    if (x <= width) return port;
    x -= width + gap;
  }
  return null;
}
