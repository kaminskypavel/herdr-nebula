// Import (role "import") copies what nebula already knows: its project list (sqlite, read
// only) and its default models, effort, editor and archive prompt (config.json). Both
// are read when it opens; each part has a switch, and Import writes the shared values.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, theme, shared, setShared, exec, home, readTextFile } from "herdr";
import { STORE } from "./lib/repos.js";
import { SETTINGS } from "./lib/shared.js";
import {
  SQLITE,
  PROJECTS_SQL,
  nebulaFiles,
  parseNebulaProjects,
  settingsFromNebula,
  applySettings,
  describeSettings,
  planImport,
} from "./lib/nebula-import.js";
import { button, dialogTitle, escapeKey, switchControl } from "./ui.js";
import { fs } from "./lib/scale.js";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// -> { there, projects, projectsNote, config }: there is whether nebula's db exists; projects
// is null when it could not be read.
async function readNebula() {
  const files = nebulaFiles(home());
  const config = await readTextFile(files.config).catch(() => null);
  const there = await exec("/bin/test", ["-e", files.db]).then(
    (r) => r.code === 0,
    () => false,
  );
  let projects = null,
    projectsNote = "No project list found";
  if (there) {
    const r = await exec(SQLITE, ["-readonly", "-json", files.db, PROJECTS_SQL]).catch(() => null);
    if (!r) projectsNote = "sqlite3 is missing, so the project list can't be read";
    else if (r.code !== 0)
      projectsNote = `Couldn't read the project list: ${
        String(r.stderr ?? "")
          .trim()
          .split("\n")[0] || "sqlite3 failed"
      }`;
    else {
      try {
        projects = parseNebulaProjects(r.stdout);
      } catch {
        projectsNote = "Couldn't read the project list: unexpected output";
      }
    }
  }
  return { there, projects, projectsNote, config };
}

export class Import {
  init(cx) {
    this.found = null; // null while looking, else readNebula's result
    this.patch = {};
    this.on = { projects: true, defaults: true };
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(300, () => this.handle.focus());
    cx.spawn(async (cx) => {
      this.found = await readNebula();
      let config = null;
      try {
        config = this.found.config ? JSON.parse(this.found.config) : null;
      } catch {
        /* unreadable config: no defaults */
      }
      this.patch = settingsFromNebula(config);
      cx.notify();
    });
  }

  plan() {
    return planImport(shared(STORE) ?? {}, this.found?.projects ?? []);
  }

  hasProjects() {
    return this.found?.projects != null && this.plan().added > 0;
  }
  hasDefaults() {
    return describeSettings(this.patch) !== "";
  }
  ready() {
    return Boolean((this.on.projects && this.hasProjects()) || (this.on.defaults && this.hasDefaults()));
  }

  submit() {
    if (!this.ready()) return;
    if (this.on.projects && this.hasProjects()) setShared(STORE, this.plan().store);
    if (this.on.defaults && this.hasDefaults()) setShared(SETTINGS, applySettings(shared(SETTINGS), this.patch));
    closeOverlay(props()?.overlay);
  }

  part(t, id, title, desc, usable) {
    const on = usable && this.on[id];
    return h_flex()
      .id(`imp-${id}`)
      .min_h(56)
      .px(14)
      .py(10)
      .gap(16)
      .items_center()
      .flex_none()
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .gap(2)
          .child(
            div()
              .text_size(fs(13))
              .text_color(usable ? t.foreground : t.dim)
              .child(title),
          )
          .child(div().text_size(fs(12)).text_color(t.muted).child(desc)),
      )
      .child(
        switchControl(t, `imp-${id}-sw`, on, (value, cx) => {
          this.on[id] = value;
          cx.notify();
        }).when(!usable, (el) => el.disabled(true).opacity(0.4)),
      );
  }

  render() {
    const t = theme(),
      overlay = props()?.overlay,
      f = this.found;
    const shell = (body, buttons) =>
      v_flex()
        .id("import")
        .track_focus(this.handle)
        .on_key_down((e, cx) => {
          if (escapeKey(e, cx, overlay)) return;
          if (e.key === "enter") {
            this.submit();
            cx.stop_propagation();
          }
        })
        .size_full()
        .px(22)
        .pt(20)
        .pb(18)
        .gap(16)
        .bg(t.popover)
        .text_color(t.foreground)
        .text_size(fs(13))
        .child(dialogTitle(t, "Import from nebula"))
        .child(body)
        .child(h_flex().gap(8).justify_end().children(buttons));
    const close = button(t, "imp-close", "Close", "plain", () => closeOverlay(overlay));

    if (!f) return shell(div().flex_1().text_size(fs(12)).text_color(t.muted).child("Looking for nebula…"), [close]);
    if (!f.there && !f.config) return shell(div().flex_1().text_size(fs(12)).text_color(t.muted).child("nebula was not found on this Mac"), [close]);

    const plan = this.plan(),
      defaults = describeSettings(this.patch);
    const projectsDesc =
      f.projects == null
        ? f.projectsNote
        : !f.projects.length
          ? "nebula has no projects"
          : `${plural(f.projects.length, "project")}, ${plan.added} new${plan.skipped ? ` (${plan.skipped} already here or removed on purpose)` : ""}`;
    const defaultsDesc = defaults || (f.config ? "nebula sets no defaults" : "No config file found");
    return shell(
      v_flex()
        .flex_1()
        .min_h(0)
        .gap(8)
        .child(div().px(2).text_size(fs(12)).text_color(t.muted).child("Read from nebula's own files. Nothing there changes."))
        .child(
          v_flex()
            .rounded(10)
            .border_1()
            .border_color(t.border)
            .overflow_hidden()
            .child(this.part(t, "projects", "Projects", projectsDesc, this.hasProjects()))
            .child(div().h(1).mx(14).bg(t.border).flex_none())
            .child(this.part(t, "defaults", "Defaults", defaultsDesc, this.hasDefaults())),
        ),
      [
        button(t, "imp-cancel", "Cancel", "plain", () => closeOverlay(overlay)),
        button(t, "imp-go", "Import", "primary", () => this.submit()).when(!this.ready(), (el) => el.opacity(0.4)),
      ],
    );
  }
}
