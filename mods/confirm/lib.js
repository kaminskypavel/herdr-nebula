// What the confirm dialog says before closing a space or a tab. Herdr opens it with props { title,
// detail, command: { name, args } }, e.g. "Close space?" and space.close { id }: this finds what the
// command would close, so the dialog names it and lists the agents it would end. Pure, so node can
// test it. No herdr imports.

// Herdr's agent states in the board's words.
const WORDS = { blocked: "needs you", working: "working", done: "done", idle: "idle" };
const TONE = { blocked: "ansi1", working: "ansi3", done: "ansi6", idle: "ansi2" };

// -> { kind: "space" | "tab", name, folder, tabs, agents: [{ name, word, tone }] }, or null for any
// other command (the dialog then shows Herdr's own title and detail).
export function closing(command, spaces, agents) {
  const id = command?.args?.id;
  if (!id || (command.name !== "space.close" && command.name !== "tab.close")) return null;
  const list = spaces ?? [];
  if (command.name === "space.close") {
    const s = list.find((x) => x.id === id);
    if (!s) return null;
    return {
      kind: "space",
      name: s.name || "this space",
      folder: s.folder ?? null,
      tabs: (s.tabs ?? []).length,
      agents: agentsIn(s, agents, (a) => a.space === id),
    };
  }
  const s = list.find((x) => (x.tabs ?? []).some((t) => t.id === id));
  const tab = s?.tabs.find((t) => t.id === id);
  if (!tab) return null;
  return { kind: "tab", name: tab.name || "this tab", folder: s.folder ?? null, tabs: 1, agents: agentsIn(s, agents, (a) => a.tab === id) };
}

// A tab still called by its number has no name of its own.
const named = (name) => (name && !/^\d+$/.test(name) ? name : null);

function agentsIn(space, agents, keep) {
  return (agents ?? []).filter(keep).map((a) => ({
    name: named(space.tabs?.find((t) => t.id === a.tab)?.name) ?? a.app ?? "agent",
    word: WORDS[a.status] ?? a.status ?? "",
    tone: TONE[a.status] ?? "muted",
  }));
}

// "Ends 2 agents in 3 tabs." / "Nothing is running here." The line under the title.
export function endsLine(c) {
  const n = c.agents.length;
  if (!n) return c.kind === "space" && c.tabs > 1 ? `Closes ${c.tabs} tabs. No agent is running.` : "No agent is running here.";
  const agents = `${n} agent${n === 1 ? "" : "s"}`;
  return c.kind === "space" && c.tabs > 1 ? `Ends ${agents} in ${c.tabs} tabs:` : `Ends ${agents}:`;
}

// The project icon for a folder: the shared "nebula.icons" entry ({ path, initials, color }, keyed by
// project root) of the project holding it, the longest root winning. -> the entry, or null.
// ponytail: the same as mods/toast/lib.js iconOf (a mod cannot import another folder); share them
// through an install-time copy if a third mod needs it.
export function iconOf(icons, cwd) {
  const dir = String(cwd ?? "").replace(/\/+$/, "");
  let best = null;
  for (const [root, icon] of Object.entries(icons ?? {})) {
    const holds = dir === root || dir.startsWith(`${root}/`) || dir.startsWith(`${root}-worktrees/`);
    if (holds && (!best || root.length > best.root.length)) best = { root, icon };
  }
  return best?.icon ?? null;
}

// A path with the home folder shown as ~.
export const tilde = (path, home) => (home && path?.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : (path ?? ""));
