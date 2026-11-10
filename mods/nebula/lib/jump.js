// The jump palette's list (/ on the board, cmd-J anywhere), after nebula's `/` palette: every live
// session of every project, open or closed, as `project / title`. With no text it lists in attention
// order (needs you, working, unseen, then the rest), most recent first inside each tier; typing
// fuzzy-filters it (lib/fuzzy.js), the attention order breaking ties. No herdr imports, so node can
// test it.
import { OTHER } from "./viewmodel.js";
import { rankBy } from "./fuzzy.js";
import { rh } from "./scale.js";

export const JUMP_ROWS = 9;

const TIER = { needs: 0, working: 1, unseen: 2 };
const tierOf = (status) => TIER[status] ?? 3;

/**
 * The sessions of a board model (lib/viewmodel.js buildBoard over every project, not only the open
 * ones) as palette items, in build order. Nebula's own rows and archived sessions are left out: there is no
 * terminal to land on. `text` is what the query runs over (project/branch/title, so a query can narrow
 * by any of them); `label` is what is drawn. A working session counts as just touched.
 */
export function jumpRows(model, now = Date.now()) {
  return model.repos.flatMap((repo) =>
    repo.bands.flatMap((band) =>
      band.rows
        .filter((r) => r.kind !== "nebula" && !r.archived)
        .map((r) => ({
          id: r.id,
          project: repo.name,
          other: repo.root === OTHER,
          title: r.title,
          status: r.status,
          age: r.age,
          text: [repo.name, band.label, r.title].filter(Boolean).join("/"),
          label: `${repo.name} / ${r.title}`,
          tier: tierOf(r.status),
          touched: r.status === "working" ? now : (r.changedAt ?? 0),
        })),
    ),
  );
}

// Each item's position in the attention order: tier, then most recently touched, then build order.
export function attentionRank(items) {
  const order = items.map((_, i) => i).sort((a, b) => items[a].tier - items[b].tier || items[b].touched - items[a].touched || a - b);
  const rank = new Array(items.length);
  order.forEach((i, pos) => {
    rank[i] = pos;
  });
  return rank;
}

/** The items the query leaves, best first: the fuzzy score decides, the attention order breaks ties and is the whole order with no query. */
export function rankJump(items, query) {
  const rank = attentionRank(items);
  return rankBy(
    query,
    items.map((x) => x.text),
    (i) => rank[i],
  ).map((r) => ({ ...items[r.index], positions: r.positions }));
}

const ROW_H = 32;
const FIELD_H = 36;

/** The palette's size for the current text scale (call after setTextScale). */
export const jumpSize = () => ({ width: 600, height: 16 + 6 + rh(FIELD_H) + JUMP_ROWS * (rh(ROW_H) + 1) });
export const JUMP_ROW_H = ROW_H;
export const JUMP_FIELD_H = FIELD_H;

/** The first palette row to draw so row `at` is inside the window of JUMP_ROWS rows starting at `top`. */
export const windowTop = (top, at, rows = JUMP_ROWS) => (at < top ? at : at >= top + rows ? at - rows + 1 : top);
