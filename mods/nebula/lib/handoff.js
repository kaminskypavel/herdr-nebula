// Continuing a session in another worktree of its project: a new session there, told where the first one got to,
// while the first stays where its edits are (they are uncommitted files in its own worktree, and its conversation
// belongs to that folder). The board asks on the drop or menu pick whether to archive the first one. Pure; no herdr
// imports, so node can test it.

/** The other worktrees of the session's project, as targets: [{ path, label }] (the session's own one left out). */
export function continueTargets(model, id) {
  for (const repo of model?.repos ?? []) {
    const here = repo.bands.find((b) => b.rows.some((r) => r.id === id));
    if (here) return repo.bands.filter((b) => b.label && b.path && b.path !== here.path).map((b) => ({ path: b.path, label: b.label }));
  }
  return [];
}

/** The "Move to ›" submenu: ‹ Back, then one item per target worktree. */
export const continueItems = (targets, max = 12) => [
  { id: "back", label: "\u2039 Back", key: "", icon: null },
  ...(targets ?? []).slice(0, max).map((x, i) => ({
    id: `continue:${x.path}`,
    label: x.label,
    key: "",
    icon: "mods/nebula/icons/git-branch.svg",
    sep: i === 0,
  })),
];

/**
 * The new session's task: what the first session was doing, where it got to, and that its changes live in the other
 * worktree (so the agent looks there rather than assuming they are here).
 */
export function handoffTask({ title, prompt, said, fromPath, fromLabel }) {
  const lines = [
    `Continue the work of the session "${title}" from the worktree ${fromLabel} (${fromPath}).`,
    prompt ? `Its task: ${prompt}` : null,
    said ? `Where it got to (its last reply): ${said}` : null,
    `Its changes are in ${fromPath}, not in this worktree. Check \`git -C ${fromPath} status\` and \`git -C ${fromPath} diff\`, and bring over what you need before going on.`,
  ];
  return lines.filter(Boolean).join("\n");
}
