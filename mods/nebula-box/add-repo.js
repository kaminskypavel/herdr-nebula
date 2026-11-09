// AddRepo puts a folder on the rail (role "add-repo"). A git repo, or any of its
// worktrees, resolves to the main repo through git's common dir; a plain folder is its
// own project. Enter adds, Esc closes, Choose opens the system folder picker. A folder
// already on the rail is selected there and reported in the dialog.
import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { props, closeOverlay, theme, shared, setShared, exec, home, pickFolder } from "herdr";
import { STORE, addProject, resolveAdd, resolveFolder } from "./lib/repos.js";
import { REPO } from "./lib/shared.js";
import { button, dialogTitle, escapeKey, inputBox, keyHint } from "./ui.js";

const HINT = "A folder, a git repo, or one of its worktrees. A worktree adds its main repo.";

export class AddRepo {
  init(cx) {
    this.note = null; // { text, bad }: what the last attempt found
    this.busy = false;
    this.handle = cx.focus_handle();
    this.field = InputState.new({ value: "", placeholder: "~/devl/my-project" });
    this.field.on("change", (_e, cx) => { this.note = null; cx.notify(); });
    this.field.on("submit", (_e, cx) => this.add(cx));
    const focus = () => this.field.focus();
    focus();
    cx.timer.after(600, focus);
  }

  choose(cx) {
    cx.spawn(async (cx) => {
      const folder = await pickFolder({ prompt: "Choose the project's folder" });
      if (folder) { this.field.set_value(folder); this.note = null; }
      cx.notify();
    });
  }

  add(cx) {
    if (this.busy) return;
    const typed = this.field.value().trim();
    if (!typed) { this.note = { text: "Type the folder's path.", bad: true }; cx.notify(); return; }
    this.busy = true;
    cx.notify();
    cx.spawn(async (cx) => {
      const found = await resolveFolder(exec, typed.replace(/^~(?=$|\/)/, home()));
      this.busy = false;
      if (found.error) { this.note = { text: found.error, bad: true }; cx.notify(); return; }
      const store = shared(STORE) ?? {};
      const { root, existing } = resolveAdd(store, found.root);
      setShared(REPO, root);
      if (existing) { this.note = { text: `${existing.name} is already on the rail.`, bad: false }; cx.notify(); return; }
      setShared(STORE, addProject(store, root));
      closeOverlay(props()?.overlay);
    });
  }

  render() {
    const t = theme(), overlay = props()?.overlay, note = this.note;
    return v_flex().id("add-repo").track_focus(this.handle)
      .on_key_down((e, cx) => escapeKey(e, cx, overlay))
      .w_full().min_h(0).px(22).pt(20).pb(18).gap(14).bg(t.popover).text_color(t.foreground)
      .child(dialogTitle(t, "Add a project"))
      .child(v_flex().gap(8)
        .child(div().text_size(12).text_color(t.dim).child(HINT))
        .child(h_flex().gap(8).items_center()
          .child(inputBox(t, Input.new(this.field), true).flex_1().min_w(0).h(34)
            .border_color(note?.bad ? t.blocked : t.accent).disabled(this.busy))
          .child(button(t, "ar-choose", "Choose…", "plain", (_e, cx) => this.choose(cx))))
        .child(div().min_h(16).text_size(12).text_color(note?.bad ? t.blocked : t.working).child(note?.text ?? "")))
      .child(h_flex().gap(8).items_center()
        .child(h_flex().flex_1().gap(5).items_center().text_size(11.5).text_color(t.dim)
          .child(keyHint(t, "Enter")).child("adds"))
        .child(button(t, "ar-cancel", "Cancel", "plain", () => closeOverlay(overlay)))
        .child(button(t, "ar-add", this.busy ? "Checking…" : "Add", "primary", (_e, cx) => this.add(cx))));
  }
}
