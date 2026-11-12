// A new worktree's branch name from the task: its meaningful words, not its first ones ("I want you to scan the
// monorepo packages" became i-want-you-to-scan). Filler (pronouns, want, please, to, the, ...) goes, the first four
// content words stay, at most 40 characters. A task with none (empty, or another script) gets a random two-word name.

// Words that say nothing about the work. Verbs that do (fix, add, scan, remove, ...) are not here.
const FILLER = new Set(
  (
    "i im ive id me my mine we were us our you your yours youre he she it its they them their " +
    "want wanna need would like love please plz pls can could should shall will may might must let lets " +
    "s t d ll ve re to the a an and or but of for in on at with without by as from into onto about over " +
    "this that these those there here then than so just also too very really some any all each every " +
    "is are was be been being am do does did done doing have has had having get got go going make sure " +
    "hey hi hello ok okay now still again maybe think see look try help know tell ask thing things stuff " +
    "what how why when where which who whom whose if else not no yes etc"
  ).split(" "),
);

export const slug = (task) => {
  const words = String(task ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !FILLER.has(w));
  const kept = [...new Set(words)].slice(0, 4);
  let out = "";
  for (const w of kept) {
    const next = out ? `${out}-${w}` : w;
    if (next.length > 40) break;
    out = next;
  }
  return out || (kept[0] ?? "").slice(0, 40);
};

const ADJECTIVES = "amber brave calm clever eager gentle jolly keen lucky mellow nimble quiet rapid sunny tidy witty".split(" ");
const NOUNS = "badger comet falcon harbor lantern maple otter pebble quokka river sparrow thicket violet willow yarrow zephyr".split(" ");
const pick = (list, rand) => list[Math.floor(rand() * list.length)];

export const branchName = (task, rand = Math.random) => slug(task) || `${pick(ADJECTIVES, rand)}-${pick(NOUNS, rand)}`;
