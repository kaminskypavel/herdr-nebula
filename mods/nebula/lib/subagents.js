export function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// Terminals an agent started (`hc run`) have no pane, so agents() leaves them out;
// terminals() names their `parent`. As Herdr's Agents list does: an error counts as
// needing you, and a sub-agent is never done (it reports to its parent).
export function kidStatus(k, listed) {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
}

export function byParent(all) {
  const kids = new Map();
  for (const k of all) {
    if (!k.parent || k.state !== "live") continue;
    if (!kids.has(k.parent)) kids.set(k.parent, []);
    kids.get(k.parent).push(k);
  }
  return kids;
}

export function tree(kids, addr, lead = [], seen = new Set([addr])) {
  const mine = (kids.get(addr) ?? []).filter((k) => !seen.has(k.address));
  return mine.flatMap((k, i) => {
    const last = i === mine.length - 1;
    seen.add(k.address);
    return [{ k, lines: [...lead, last ? "└" : "├"] }, ...tree(kids, k.address, [...lead, last ? "" : "│"], seen)];
  });
}

// Sub-agents an agent runs inside itself (Claude Code's), which have no terminal: the
// `herdr-nebula hook subagent` hooks put each on the agent's own terminal as one label,
// key `nebula.sub.<id>`, value a JSON string {"type", "desc" (what it was asked to do),
// "model", "at" (ms since epoch)}; the stop hook removes it. Oldest first. A label that
// isn't that shape is skipped, and so is one older than 12 hours (the stop hook never
// ran: the agent was killed mid-run) when `now` is given. The app is always Claude Code's
// unless the JSON says otherwise ("app").
export const SUB_PREFIX = "nebula.sub.";
export const HOOK_MAX_AGE = 12 * 3600000;
export function hookSubs(labels, now = null) {
  const out = [];
  for (const [k, v] of Object.entries(labels ?? {})) {
    if (!k.startsWith(SUB_PREFIX) || !v) continue;
    let d;
    try {
      d = JSON.parse(v);
    } catch {
      continue;
    }
    if (!d || typeof d !== "object") continue;
    const h = {
      id: k.slice(SUB_PREFIX.length),
      app: typeof d.app === "string" ? d.app : "claude",
      type: typeof d.type === "string" ? d.type : "",
      at: Number.isFinite(d.at) ? d.at : 0,
      desc: typeof d.desc === "string" ? d.desc : "",
      model: typeof d.model === "string" ? d.model : "",
    };
    if (!h.id || (now !== null && h.at && now - h.at >= HOOK_MAX_AGE)) continue;
    out.push(h);
  }
  return out.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

// Whether a hook sub-agent's app is its parent agent's: "claude" under Claude Code
// ("claude-code"), "codex" under Codex. Another app's leftover label (an earlier agent
// in the same terminal) doesn't show under this one.
export const sameApp = (parentApp, app) => {
  const p = String(parentApp ?? "").toLowerCase(),
    a = String(app ?? "").toLowerCase();
  return Boolean(p && a) && (p === a || p.startsWith(`${a}-`) || p.startsWith(a));
};

export const subRow = (h) => ({ text: h.desc || h.type || "sub-agent", badge: h.model });
