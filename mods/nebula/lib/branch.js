export const slug = (task) =>
  String(task ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").split("-").slice(0, 5).join("-").slice(0, 40).replace(/-+$/, "");

const ADJECTIVES = "amber brave calm clever eager gentle jolly keen lucky mellow nimble quiet rapid sunny tidy witty".split(" ");
const NOUNS = "badger comet falcon harbor lantern maple otter pebble quokka river sparrow thicket violet willow yarrow zephyr".split(" ");
const pick = (list, rand) => list[Math.floor(rand() * list.length)];

export const branchName = (task, rand = Math.random) => slug(task) || `${pick(ADJECTIVES, rand)}-${pick(NOUNS, rand)}`;
