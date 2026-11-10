// The board's Up next card: the one item that most deserves you across every open project, what to say about it,
// and which agent replies the board still has to read. Pure; no herdr imports, so node can test it.
import { clearKey } from "./waiting.js";
import { sessionOf } from "./reply.js";
import { rowText } from "./prompt.js";

/** How many titles follow "N more:" under the card. */
export const MORE_TITLES = 3;
/** Transcript reads in flight at once. */
export const MAX_READS = 3;

/**
 * What the card shows for the waiting queue (lib/waiting.js waitingRows, cleared ones already out), or null when
 * nothing waits (no card at all). `line` is the agent's line, else the row's last prompt as "› prompt" (until read).
 * -> { item, title, status, subtitle: [{ text, tone }], line, more, moreTitles, needs, unseen }.
 */
export function upNext(queue) {
  if (!queue.length) return null;
  const [item, ...rest] = queue;
  const { row, project } = item;
  const needs = row.status === "needs";
  const titleOf = (x) => rowText(x.row, false).title;
  return {
    item,
    title: titleOf(item),
    status: row.status,
    subtitle: [
      { text: project, tone: "plain" },
      { text: needs ? "asks you" : "finished", tone: needs ? "needs" : "unseen" },
      ...(row.age ? [{ text: row.age, tone: "plain" }] : []),
    ],
    line: row.said || (row.prompt ? `› ${row.prompt}` : ""),
    more: rest.length,
    moreTitles: rest.slice(0, MORE_TITLES).map(titleOf),
    needs: queue.filter((x) => x.row.status === "needs").length,
    unseen: queue.filter((x) => x.row.status === "unseen").length,
  };
}

/**
 * The transcripts to read now: queue rows with a conversation whose cached reply is not for their current state.
 * -> [{ id, key, status, s: { app, id } }], in queue order.
 */
export function readsDue(queue, replies) {
  const due = [];
  for (const { row } of queue) {
    const s = sessionOf(row.session);
    const key = clearKey(row);
    if (s && replies?.[row.id]?.key !== key) due.push({ id: row.id, key, status: row.status, s });
  }
  return due;
}

/** The replies map after adding `got`, keeping only ids still in `liveIds` (so it never grows without end). */
export function mergeReplies(prev, got, liveIds) {
  const keep = new Set(liveIds);
  return Object.fromEntries(Object.entries({ ...prev, ...got }).filter(([id]) => keep.has(id)));
}
