#!/usr/bin/env node
// Releasing herdr-nebula. Usage:
//   bun run release:draft [version]   draft the next CHANGELOG section from the commits since the last tag
//                                     (features and fixes; version defaults to a minor step with features,
//                                     else a patch step), and set package.json's version. Edit it, then:
//   bun run release:publish           commit "release: vX", tag vX, push main and the tag; the Release workflow
//                                     (.github/workflows/release.yml) then creates the GitHub release from it
//   node scripts/release.mjs notes vX print one version's notes (what the workflow uses)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { group, nextVersion, section, insertSection, notesFor } from "./release-lib.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHANGELOG = path.join(ROOT, "CHANGELOG.md");
const PKG = path.join(ROOT, "package.json");
const git = (...args) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8" }).trim();
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "");

const [cmd, arg] = process.argv.slice(2);
if (cmd === "notes") {
  const notes = notesFor(read(CHANGELOG), arg ?? "");
  if (!notes) {
    console.error(`No CHANGELOG section for ${arg}.`);
    process.exit(1);
  }
  console.log(notes);
} else if (cmd === "draft") {
  let last = "";
  try {
    last = git("describe", "--tags", "--abbrev=0");
  } catch {}
  const subjects = git("log", "--format=%s", last ? `${last}..HEAD` : "HEAD")
    .split("\n")
    .filter(Boolean);
  const groups = group(subjects);
  const pkg = JSON.parse(read(PKG));
  const version = (arg ?? nextVersion(pkg.version, groups)).replace(/^v/, "");
  if (notesFor(read(CHANGELOG), version)) {
    console.error(`CHANGELOG already has v${version}; edit it, or pick another version.`);
    process.exit(1);
  }
  const sec = section(version, new Date().toISOString().slice(0, 10), groups);
  fs.writeFileSync(CHANGELOG, insertSection(read(CHANGELOG), sec));
  pkg.version = version;
  fs.writeFileSync(PKG, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`Drafted v${version} from ${subjects.length} commits since ${last || "the start"} into CHANGELOG.md:\n\n${sec}`);
  console.log("Edit CHANGELOG.md if you like, then: bun run release:publish");
} else if (cmd === "publish") {
  const version = JSON.parse(read(PKG)).version;
  if (!notesFor(read(CHANGELOG), version)) {
    console.error(`CHANGELOG.md has no v${version} section: run bun run release:draft first.`);
    process.exit(1);
  }
  const dirty = git("status", "--porcelain", "--untracked-files=no")
    .split("\n")
    .filter((l) => l && !/ (CHANGELOG\.md|package\.json)$/.test(l));
  if (dirty.length) {
    console.error(`Commit or stash other changes first:\n${dirty.join("\n")}`);
    process.exit(1);
  }
  if (git("status", "--porcelain", "--untracked-files=no", "--", "CHANGELOG.md", "package.json"))
    git("commit", "-m", `release: v${version}`, "--", "CHANGELOG.md", "package.json");
  git("tag", "-a", `v${version}`, "-m", `herdr-nebula v${version}`);
  git("push", "origin", "main");
  git("push", "origin", `v${version}`);
  console.log(`Tagged and pushed v${version}; the Release workflow creates the GitHub release from CHANGELOG.md.`);
} else {
  console.error("usage: node scripts/release.mjs draft [version] | publish | notes <version>");
  process.exit(2);
}
