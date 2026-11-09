export function nextAttention(rows, fromId, dir = 1) {
  const i = rows.findIndex((r) => r.id === fromId);
  const around = i < 0 ? rows : [...rows.slice(i + 1), ...rows.slice(0, i)];
  const ordered = dir < 0 ? [...around].reverse() : around;
  for (const status of ["needs", "unseen"]) {
    const hit = ordered.find((r) => r.status === status);
    if (hit) return hit.id;
  }
  return null;
}

export const flatten = (grouped) => [...grouped.repos.flatMap((r) => r.bands.flatMap((b) => b.sessions)), ...grouped.other];
