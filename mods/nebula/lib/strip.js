// The attention strip under the board's toolbar: what needs you or finished unseen in the shown tab, as a
// count line and up to three rows to click. Pure; no herdr imports, so node can test it.

export const STRIP_ROWS = 3;

/** "2 need you", "1 needs you". */
export const needText = (n) => `${n} ${n === 1 ? "needs" : "need"} you`;

// A live row the user can act on: not archived, not exited, not one of nebula's own.
const live = (r) => r.kind !== "nebula" && !r.archived && !r.exited;

/**
 * What the strip shows for a model (the shown tab's projects): the counts and the first `max` rows, needs
 * you before done-unseen, newest first (stable on ties). -> { needs, unseen, items: [{ row, project }], more }.
 */
export function attentionStrip(model, max = STRIP_ROWS) {
  const hits = [];
  for (const repo of model.repos)
    for (const row of repo.rows) if (live(row) && (row.status === "needs" || row.status === "unseen")) hits.push({ row, project: repo.name });
  const when = ({ row }) => row.changedAt || row.unseenSince || 0;
  const rank = ({ row }) => (row.status === "needs" ? 0 : 1);
  hits.sort((a, b) => rank(a) - rank(b) || when(b) - when(a));
  const needs = hits.filter((h) => h.row.status === "needs").length;
  return { needs, unseen: hits.length - needs, items: hits.slice(0, max), more: Math.max(0, hits.length - max) };
}

/**
 * The count line as [{ text, tone }] with tone "needs" | "unseen" | "plain", joined by " · " by the caller:
 * "2 need you", "1 done", then each of `tail` (plain words such as "⌘] next"). Empty counts leave their part out.
 */
export function stripParts({ needs, unseen }, tail = []) {
  return [
    ...(needs > 0 ? [{ text: needText(needs), tone: "needs" }] : []),
    ...(unseen > 0 ? [{ text: `${unseen} done`, tone: "unseen" }] : []),
    ...tail.map((text) => ({ text, tone: "plain" })),
  ];
}
