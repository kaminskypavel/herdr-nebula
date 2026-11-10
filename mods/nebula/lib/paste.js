// Pasted images for the new-session box. The box writes the clipboard's PNG into
// <appHome>/nebula-pastes/ (macOS osascript), shows it as a thumbnail, and on launch ends the
// task with one line naming the files so the agent reads them. Pure; no herdr imports.

export const PASTE_DIR = "nebula-pastes";
export const PASTE_DAYS = 7;
const DAY = 86400000;

// A file name that carries its own age, so cleaning up needs no stat.
export const pasteName = (ms) => `${ms}.png`;

// The names in `names` older than `days`; anything that is not one of our files is left alone.
export function stalePastes(names, now, days = PASTE_DAYS) {
  return names.filter((n) => {
    const m = /^(\d+)\.png$/.exec(n);
    return m && now - Number(m[1]) > days * DAY;
  });
}

// osascript arguments that write the clipboard's PNG to `file` and print "ok", or print "none"
// when the clipboard holds no image. The coercion fails before the file is opened, so "none" leaves no file.
export function clipScript(file) {
  const path = String(file).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return [
    "-e",
    "try",
    "-e",
    "set d to the clipboard as «class PNGf»",
    "-e",
    "on error",
    "-e",
    'return "none"',
    "-e",
    "end try",
    "-e",
    `set fh to open for access POSIX file "${path}" with write permission`,
    "-e",
    "set eof fh to 0",
    "-e",
    "write d to fh",
    "-e",
    "close access fh",
    "-e",
    'return "ok"',
  ];
}

// ponytail: paths are space separated, so an app home with a space in it splits them; quote if that ever matters.
const LINE = /^Images: (\/\S*\/nebula-pastes\/\d+\.png(?: \/\S*\/nebula-pastes\/\d+\.png)*)$/;

// The task with its last line naming the pasted files (absolute paths). No images: the task as it is.
export function taskWithImages(task, paths) {
  const text = String(task ?? "");
  if (!paths?.length) return text;
  const body = text.trimEnd();
  return `${body ? `${body}\n` : ""}Images: ${paths.join(" ")}`;
}

// The reverse, for a draft: { task, paths }. Only a last line that names our own files counts.
export function splitImages(text) {
  const s = String(text ?? ""),
    cut = s.lastIndexOf("\n") + 1,
    m = LINE.exec(s.slice(cut));
  return m ? { task: s.slice(0, Math.max(0, cut - 1)), paths: m[1].split(" ") } : { task: s, paths: [] };
}

export const pasteFile = (path) => String(path).split("/").pop();
