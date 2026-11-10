import test from "node:test";
import assert from "node:assert/strict";
import { pasteName, stalePastes, clipScript, taskWithImages, splitImages, pasteFile, PASTE_DIR } from "../mods/nebula/lib/paste.js";

const DAY = 86400000;
const A = `/h/.config/herdr-app/${PASTE_DIR}/100.png`;
const B = `/h/.config/herdr-app/${PASTE_DIR}/200.png`;

test("a paste's file name is its time, so its age needs no stat", () => {
  assert.equal(pasteName(1760000000000), "1760000000000.png");
  assert.equal(pasteFile(A), "100.png");
});

test("only our own pastes older than 7 days are stale", () => {
  const now = 10 * DAY;
  const names = [pasteName(now - 8 * DAY), pasteName(now - 7 * DAY), pasteName(now - DAY), "notes.png", "123.txt", "x1.png"];
  assert.deepEqual(stalePastes(names, now), [pasteName(now - 8 * DAY)]);
  assert.deepEqual(stalePastes(names, now, 0.5), [pasteName(now - 8 * DAY), pasteName(now - 7 * DAY), pasteName(now - DAY)]);
});

test("the osascript program coerces before it opens the file, and escapes the path", () => {
  const lines = clipScript('/a "b"/c.png').filter((x) => x !== "-e");
  assert.ok(lines.indexOf("set d to the clipboard as «class PNGf»") < lines.findIndex((l) => l.startsWith("set fh to open for access")));
  assert.ok(lines.includes('set fh to open for access POSIX file "/a \\"b\\"/c.png" with write permission'));
  assert.ok(lines.includes('return "none"') && lines.includes('return "ok"'));
});

test("the task ends with one line naming the images", () => {
  assert.equal(taskWithImages("fix it", [A, B]), `fix it\nImages: ${A} ${B}`);
  assert.equal(taskWithImages("fix it\n\n", [A]), `fix it\nImages: ${A}`);
  assert.equal(taskWithImages("", [A]), `Images: ${A}`);
  assert.equal(taskWithImages("fix it  ", []), "fix it  ");
  assert.equal(taskWithImages(undefined, undefined), "");
});

test("a draft's images come back out, and a lookalike line does not", () => {
  assert.deepEqual(splitImages(`fix it\nImages: ${A} ${B}`), { task: "fix it", paths: [A, B] });
  assert.deepEqual(splitImages(`Images: ${A}`), { task: "", paths: [A] });
  assert.deepEqual(splitImages(`a\nb\nImages: ${A}`), { task: "a\nb", paths: [A] });
  for (const text of ["plain", "Images: /etc/passwd", `Images: ${A}\nand more`, "", undefined]) assert.equal(splitImages(text).paths.length, 0);
  assert.equal(splitImages("Images: /etc/passwd").task, "Images: /etc/passwd");
});
