// An fzf-style fuzzy matcher, ported from nebula's `nebula-fuzzy` crate (the matcher behind its `/`
// palette). Greedy leftmost subsequence match, case-insensitive (ASCII only, as there). The score
// favors consecutive runs and matches that start a path segment or word. Whitespace in a query
// splits it into terms that must all match, in any order. No herdr imports, so node can test it.

const CONSECUTIVE_BONUS = 8;
const BOUNDARY_BONUS = 6;
const BOUNDARIES = new Set(["/", "\\", "_", "-", ".", " "]);

const lower = (s) => Array.from(s, (c) => (c >= "A" && c <= "Z" ? c.toLowerCase() : c));
const isBoundary = (prev) => prev === undefined || BOUNDARIES.has(prev);

// One greedy leftmost pass over cand[start..]: its score and matched positions, or null.
function greedyFrom(term, cand, start) {
  let score = 0,
    qi = 0,
    prevMatched = false;
  const positions = [];
  for (let i = start; i < cand.length; i++) {
    if (cand[i] === term[qi]) {
      score += 1;
      if (prevMatched) score += CONSECUTIVE_BONUS;
      if (isBoundary(i > 0 ? cand[i - 1] : undefined)) score += BOUNDARY_BONUS;
      positions.push(i);
      prevMatched = true;
      qi++;
      if (qi === term.length) return { score, positions };
    } else prevMatched = false;
  }
  return null;
}

// The best subsequence match of one whitespace-free term anywhere in cand: the highest-scoring
// greedy pass, the leftmost of equals.
function matchTerm(term, cand) {
  if (!term.length) return { score: 0, positions: [] };
  let best = null;
  for (let start = 0; start < cand.length; start++) {
    if (cand[start] !== term[0]) continue;
    const m = greedyFrom(term, cand, start);
    if (!m) break; // a failed pass from here fails from every later start too
    if (!best || m.score > best.score) best = m;
  }
  return best;
}

/**
 * Case-insensitive match of `query` in `candidate` -> { score, positions } or null. An empty or
 * all-whitespace query matches everything with score 0 and no positions.
 */
export function fuzzyMatch(query, candidate) {
  const terms = String(query).split(/\s+/).filter(Boolean).map(lower);
  const cand = lower(String(candidate));
  let score = 0,
    positions = [];
  for (const term of terms) {
    const m = matchTerm(term, cand);
    if (!m) return null;
    score += m.score;
    positions = positions.concat(m.positions);
  }
  // Terms match independently, so their spans can overlap and arrive out of order.
  if (terms.length > 1) positions = [...new Set(positions)].sort((a, b) => a - b);
  return { score, positions };
}

// Keys are numbers or arrays of numbers, compared like Rust tuples.
const cmp = (a, b) => {
  if (!Array.isArray(a)) return a - b;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

/**
 * Ranks `candidates` (strings) against `query`: [{ index, positions }] best first. Score sorts
 * first; equal scores sort by ascending key(index, text), then original order. An empty or
 * all-whitespace query lists every candidate in key order with no positions.
 */
export function rankBy(query, candidates, key) {
  const items = candidates.map((text, i) => ({ i, k: key(i, text), text }));
  if (!String(query).trim()) return items.sort((a, b) => cmp(a.k, b.k) || a.i - b.i).map((x) => ({ index: x.i, positions: [] }));
  return items
    .map((x) => ({ ...x, m: fuzzyMatch(query, x.text) }))
    .filter((x) => x.m)
    .sort((a, b) => b.m.score - a.m.score || cmp(a.k, b.k) || a.i - b.i)
    .map((x) => ({ index: x.i, positions: x.m.positions }));
}

/** rankBy with ties broken by shorter text, then original order; an empty query keeps the original order. */
export function rank(query, candidates) {
  if (!String(query).trim()) return candidates.map((_, index) => ({ index, positions: [] }));
  return rankBy(query, candidates, (i, text) => [Array.from(text).length, i]);
}
