// What a Tree or List session row says: its title and, under it, the last prompt.
// A row still called "New session" has nothing better to show than its prompt, so the
// prompt becomes the title; any other row keeps its title and gets the prompt on a dim
// second line (the "Prompt line on rows" setting turns that line off). Pure; no herdr imports.
import { NEW_SESSION } from "./viewmodel.js";

/** -> { title, sub }: `sub` is the second line's text or "" for none. */
export function rowText(row, promptLine = true) {
  const prompt = String(row.prompt ?? "").trim();
  if (!prompt) return { title: row.title, sub: "" };
  if (row.title === NEW_SESSION) return { title: prompt, sub: "" };
  return { title: row.title, sub: promptLine ? prompt : "" };
}
