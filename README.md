<div align="center">

# herdr-nebula

**[nebula](https://github.com/AgentSystemLabs/nebula)'s mission control, inside [Herdr](https://herdr.dev).**

Every coding agent you run, on one board: open projects as tabs, their worktrees and sessions beside them,
and Herdr's own terminal next to it all.

```sh
curl -fsSL https://raw.githubusercontent.com/kaminskypavel/herdr-nebula/main/install.sh | sh
```

<img src="assets/board.png" alt="herdr-nebula in Herdr: project tabs, the Tree view grouping sessions by project and worktree with status dots, and the agent's terminal beside it" width="100%">

</div>

## Why

I'm a huge fan of [nebula](https://github.com/AgentSystemLabs/nebula). Its model (project, then worktree, then session), the one-key task box and the four status colors are how I run six to fifteen agents a day.

I like [Herdr](https://herdr.dev) too: a native window, real panes, and terminals that keep running after you close it.

So herdr-nebula brings nebula's workflow into Herdr, as a layout and two mods. Nothing to choose between.

## What you get

- **Project tabs.** Git repos or plain folders. The projects you have open live in the icon bar, like a vertical workspace switcher: an **All** icon, then one icon per open project (its favicon or logo, else colored initials) with a status dot, in a stable order that picking a project never changes. The selected one has an accent bar on the left; hover for the name. When more projects are open than fit, the list scrolls and the bottom buttons stay put. Right-click a project for **Close** (or **Remove from list...**). <kbd>+</kbd> opens the projects picker (search, session counts, a check on the open ones, and "Add a project"). A closed project whose agent needs you opens as a tab by itself, and <kbd>+</kbd> carries a red dot until it does.
- **One rule for every view.** The selected tab scopes Tree, Cards, List and Columns alike: a project tab shows that project alone, All shows every open project grouped by project, with sessions outside any project at the end. The filter and the sort work inside the tab. When you open an agent in the main panel (or jump with <kbd>⌘]</kbd>), the board selects that agent's project tab and highlights it; on All it stays on All.
- **An icon bar.** A thin bar on the left: Board (show or fold it), the project tabs (All, your open projects, <kbd>+</kbd>), and at the bottom New window, Shortcuts and Settings. Presets and New session are in the board's top row (<kbd>⌘K</kbd> opens New session anywhere).
- **A board in four views.** Tree, Cards, List and Columns. Columns groups by status, or nebula-style as Projects, Worktrees, Sessions.
- **Status at a glance.** 🔴 needs you, 🟡 working, 🔵 done and not seen yet, 🟢 done and seen.
- **A new-session box** (<kbd>⌘K</kbd> or <kbd>p</kbd>). Pick the project, checkout, agent (only the installed ones) and preset, type the task, and optionally start it in a fresh [`wt`](https://github.com/max-sixty/worktrunk) worktree.
- **Presets shared with nebula.** Same `agent_presets.json`, so both tools see the same list.
- **One-click import from nebula.** Your projects and per-agent defaults, straight from nebula's own files.
- **Sessions that name themselves.** Claude Code and Codex title their tab after the first prompt. A name you give always wins.
- **Row actions.** Rename, archive, relaunch with the same setup, open the folder, or delete. Delete offers to remove the worktree and shows uncommitted files and unpushed commits first.
- **A second window.** The New window button on the icon bar opens another Herdr window on the same agents, for two boards side by side.
- **Keyboard first.** <kbd>⌃`</kbd> hands the keys to the board and back. <kbd>⌘]</kbd> jumps to the next agent that needs you, from anywhere.

<table>
<tr>
<td width="33%"><img src="assets/status.png" alt="Columns view grouped by status: needs you, working, unseen, seen"></td>
<td width="33%"><img src="assets/columns.png" alt="Columns view in nebula's Projects, Worktrees, Sessions layout"></td>
<td width="33%"><img src="assets/settings.png" alt="Settings: default view, new worktree, auto-title, presets and per-agent model and effort"></td>
</tr>
<tr>
<td align="center">Columns by status</td>
<td align="center">Columns, nebula-style</td>
<td align="center">Settings</td>
</tr>
</table>

## Install

You need the [Herdr app](https://herdr.dev) and Node 22 or newer. [`wt`](https://github.com/max-sixty/worktrunk) is optional, for new worktrees.

```sh
curl -fsSL https://raw.githubusercontent.com/kaminskypavel/herdr-nebula/main/install.sh | sh
```

That clones herdr-nebula into `~/.local/share/herdr-nebula`, installs the two mods and the `nebula` layout into `~/.config/herdr-app`, adds the layout's keys, links the `herdr-nebula` command into `~/.local/bin`, adds the auto-title hook to Claude Code and Codex (with backups), and switches Herdr to the layout. Run it again to update. In Codex, approve the hook once with `/hooks`.

## Coming from nebula?

<img src="assets/import-banner.png" alt="The empty board offers Import from nebula and Add a project" width="560">

- **Bring your projects.** Click **Import from nebula** on the empty board, or Settings, Data, Import. It reads nebula's own files: your projects and per-agent defaults. Nothing in nebula changes.
- **Presets just work.** herdr-nebula reads and writes nebula's `agent_presets.json`, so both tools share one list.
- **Same keys, same colors.** <kbd>p</kbd> opens the new-session box (<kbd>^P</kbd> <kbd>^T</kbd> <kbd>Tab</kbd> <kbd>^O</kbd> as in nebula), worktrees land in `<repo>-worktrees/<branch>` via `wt`, and the status colors mean the same. Running sessions stay in nebula; start new ones here.

## Keys

| Where | Key | Does |
|---|---|---|
| Anywhere | <kbd>⌃`</kbd> | Board takes the keys; again hands them back |
| Anywhere | <kbd>⌘]</kbd> <kbd>⌘[</kbd> | Next, previous session that needs you |
| Anywhere | <kbd>⌘K</kbd> | New session |
| Anywhere | <kbd>⌘1</kbd> to <kbd>⌘9</kbd> | Select a project in the icon bar |
| Board | <kbd>j</kbd> <kbd>k</kbd>, <kbd>↩</kbd> or a click | Move, show the agent |
| Board | <kbd>p</kbd> <kbd>e</kbd> <kbd>v</kbd> | New session, presets, next view |
| Board | <kbd>r</kbd> <kbd>a</kbd> <kbd>u</kbd> <kbd>d</kbd> | Rename, archive, unarchive, delete |
| Board | <kbd>s</kbd>, or shift-click | Pin the agent beside the active one (again to unpin) |
| Board | <kbd>0</kbd>, <kbd>1</kbd> to <kbd>9</kbd> | Select the All tab, or an open project tab |

The <kbd>?</kbd> button on the icon bar lists them all, live.

## Roll back

Switch back with <kbd>⌘⇧L</kbd>. The hooks (prompt, and for Claude Code the sub-agent start and stop) are the groups tagged `_herdrNebulaManaged` in `~/.claude/settings.json` and `~/.codex/hooks.json`, with backups beside each file.

## Develop

`node --test` runs the tests; `herdr-app check mods/nebula` checks the board mod.

---

<div align="center">

Developed by [Pavel "PK" Kaminsky](https://pavel-kaminsky.com) · Built on [Herdr](https://herdr.dev) · Inspired by [nebula](https://github.com/AgentSystemLabs/nebula)

MIT licensed. Icons from [Lucide](https://lucide.dev) (ISC).

</div>
