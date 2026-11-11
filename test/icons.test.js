import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execSync } from "node:child_process";
import { iconRank, rankIcons, dropShared, initialsOf, colorOf, PALETTE, buildIcons, iconFor, cachedPath, CACHE_DIR } from "../mods/nebula/lib/icons.js";
import { pickIcon } from "../mods/nebula/lib/icon-scan.js";

test("preferred names rank in the stated order, then other matches", () => {
  const order = ["a/apple-touch-icon.png", "logo.svg", "logo.png", "favicon.svg", "favicon.png", "icon.svg", "icon.png", "favicon.ico"];
  assert.deepEqual(rankIcons([...order].reverse()), order);
  assert.deepEqual(rankIcons(["logo-dark.svg", "icon.webp", "favicon-32x32.png", "logo.jpg", "readme.md", "iconv.js"]), [
    "logo-dark.svg",
    "logo.jpg",
    "favicon-32x32.png",
    "icon.webp",
  ]);
});

test("a shorter path wins a tie; fixtures, tests, mockups, storybook and node_modules are skipped", () => {
  assert.deepEqual(rankIcons(["docs/site/logo.svg", "public/logo.svg", "logo.svg"]), ["logo.svg", "public/logo.svg", "docs/site/logo.svg"]);
  for (const p of [
    "node_modules/x/logo.svg",
    "test/logo.svg",
    "src/__tests__/icon.png",
    "tests/fixtures/favicon.ico",
    "mockups/logo.svg",
    ".storybook/logo.svg",
    "web/Storybook/logo.png",
  ]) {
    assert.equal(iconRank(p), null, p);
  }
  assert.equal(iconRank("src/contest/logo.svg"), 1); // "contest" is not "test"
});

test("ico candidates can be switched off", () => {
  assert.deepEqual(rankIcons(["favicon.ico", "icon.png"], { ico: false }), ["icon.png"]);
  assert.equal(iconRank("favicon.ico", { ico: false }), null);
});

test("a hash picked by two or more projects is a default and is dropped for all of them", () => {
  const a = { hash: "h1", ext: "png" },
    b = { hash: "h2", ext: "svg" };
  assert.deepEqual(dropShared({ "/a": a, "/b": a, "/c": b, "/d": null }), { "/a": null, "/b": null, "/c": b, "/d": null });
});

test("initials: first letters of two words split on - _ space, else the first two characters", () => {
  assert.equal(initialsOf("herdr-nebula"), "HN");
  assert.equal(initialsOf("my_cool app"), "MC");
  assert.equal(initialsOf("alpha"), "AL");
  assert.equal(initialsOf("x"), "X");
  assert.equal(initialsOf("a-b-c"), "AB");
  assert.equal(initialsOf("--"), "?");
  assert.equal(initialsOf(""), "?");
});

test("the color is deterministic and from the palette", () => {
  assert.equal(colorOf("herdr-nebula"), colorOf("herdr-nebula"));
  assert.ok(PALETTE.includes(colorOf("anything")));
  assert.ok(new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map(colorOf)).size > 3);
});

test("buildIcons: own icon, initials after the default filter, initials without a file", () => {
  const projects = [
    { root: "/a", name: "alpha" },
    { root: "/b", name: "beta-app" },
    { root: "/c", name: "gamma" },
    { root: "/d", name: "delta" },
  ];
  const own = { hash: "own", ext: "svg" },
    dflt = { hash: "next", ext: "ico" };
  const icons = buildIcons(projects, { "/a": own, "/b": dflt, "/c": dflt });
  assert.equal(icons["/a"].path, `${CACHE_DIR}/own.svg`);
  assert.equal(cachedPath(own), icons["/a"].path);
  assert.equal(icons["/b"].path, null);
  assert.equal(icons["/b"].initials, "BA");
  assert.equal(icons["/c"].path, null);
  assert.equal(icons["/d"].path, null);
  assert.equal(icons["/d"].initials, "DE");
  assert.deepEqual(iconFor(icons, "/d", "delta"), icons["/d"]);
  assert.equal(iconFor({}, "/x", "xylo-phone").initials, "XP"); // before the scan is done
});

// The scan against real folders, with a real exec.
const exec = (cmd, args) => new Promise((res) => execFile(cmd, args, (err, stdout, stderr) => res({ code: err ? (err.code ?? 1) : 0, stdout, stderr })));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hn-icons-"));
const put = (root, rel, bytes = "x") => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), bytes);
};

test("a git repo: the best tracked candidate is copied into the cache under its hash", async () => {
  const root = tmp(),
    home = tmp();
  put(root, "docs/logo.svg", "<svg>doc</svg>");
  put(root, "public/favicon.ico", "ico");
  put(root, "public/apple-touch-icon.png", "touch");
  put(root, "node_modules/x/logo.svg", "nm");
  put(root, "untracked/logo.svg", "u");
  execSync("git init -q && git add docs public node_modules && git -c user.name=t -c user.email=t@t commit -qm i", { cwd: root });
  const got = await pickIcon(exec, root, home);
  assert.equal(got.ext, "png");
  assert.equal(fs.readFileSync(path.join(home, CACHE_DIR, `${got.hash}.png`), "utf8"), "touch");
  assert.equal(got.hash, execSync("shasum -a 1", { input: "touch" }).toString().slice(0, 40));
});

test("a plain folder: shallow find, skipping node_modules, dist and build; files over 512 KB are passed over", async () => {
  const root = tmp(),
    home = tmp();
  put(root, "node_modules/p/logo.svg", "nm");
  put(root, "dist/logo.svg", "dist");
  put(root, "a/b/c/d/logo.svg", "deep");
  put(root, "logo.svg", Buffer.alloc(512 * 1024 + 1));
  put(root, "assets/favicon.png", "fav");
  const got = await pickIcon(exec, root, home);
  assert.equal(got.ext, "png");
  assert.equal(fs.readFileSync(path.join(home, CACHE_DIR, `${got.hash}.png`), "utf8"), "fav");
});

test("no candidate, or a folder that is gone, gives null", async () => {
  const root = tmp(),
    home = tmp();
  put(root, "README.md", "hi");
  assert.equal(await pickIcon(exec, root, home), null);
  assert.equal(await pickIcon(exec, path.join(root, "nope"), home), null);
});

test("a scan that throws or whose copy step fails gives null", async () => {
  const home = tmp();
  assert.equal(await pickIcon(() => Promise.reject(new Error("boom")), "/x", home), null);
  const calls = [];
  const seq = [
    { code: 0, stdout: "logo.svg\n" },
    { code: 3, stdout: "" },
  ];
  assert.equal(await pickIcon(() => Promise.resolve(seq[calls.push(1) - 1]), "/x", home), null);
  assert.equal(await pickIcon(() => Promise.resolve({ code: 0, stdout: "\n" }), "/x", home), null);
});

test("release screenshots are never a project's icon; a logo.svg is", async () => {
  const { rankIcons } = await import("../mods/nebula/lib/icons.js");
  assert.deepEqual(rankIcons(["assets/releases/v0.1.0/icon-bar.png", "assets/logo.svg", "docs/screenshots/icon.png"]), ["assets/logo.svg"]);
});
