// The right-click menu on a project in the icon bar, a pointer popup (role "project-menu";
// props: { root, name, open (the open roots, in order), selected (the shown project or null for All),
// pinned (it is pinned to the top of the icon bar) }).
// Open terminal starts a shell in the project's folder, in its workspace. Pin to top keeps the project above the others in the icon bar (and ⌘1, ⌘2 ... follow); Close takes the project out of the open list (the next one is shown when it was the selected
// one); Remove asks first, then drops it from the list altogether.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, openOverlay, setShared, shared, theme, exec, run, notify, spaces, panes } from "herdr";
import { planTerminal, runSteps, placedSpaces } from "./lib/launch.js";
import { OPEN, REPO, PINNED_PROJECTS } from "./lib/shared.js";
import { togglePinned } from "./lib/rail.js";
import { closeProject } from "./lib/open.js";
import { fs } from "./lib/scale.js";

const items = (pinned) => [
  { id: "terminal", label: "Open terminal" },
  { id: "pin", label: pinned ? "Unpin" : "Pin to top" },
  { id: "close", label: "Close" },
  { id: "remove", label: "Remove", danger: true },
];

export class ProjectMenu {
  init(cx) {
    this.at = 0;
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  choose(i) {
    const p = props() ?? {},
      id = items(p.pinned)[i]?.id;
    if (id === "terminal") {
      // A shell in the project's folder, in its workspace (lib/launch.js planTerminal), then focused. The menu closes
      // after: a closed popup's code stops, so closing first would drop the half-run steps.
      const steps = planTerminal({ folder: p.root, checkouts: [{ path: p.root, branch: null }], spaces: placedSpaces(spaces(), panes()) });
      runSteps(steps, exec)
        .catch((e) => ({ error: String(e), terminal: null }))
        .then((r) => {
          if (r.error) notify({ title: "Could not open a terminal", body: r.error, level: "error", timeout: 5000 });
          closeOverlay(p.overlay);
          if (r.terminal) run("pane.focus", { terminal: r.terminal });
        });
      return;
    }
    closeOverlay(p.overlay);
    if (id === "pin") setShared(PINNED_PROJECTS, togglePinned(shared(PINNED_PROJECTS), p.root));
    else if (id === "close") {
      const r = closeProject(p.open ?? [], p.root, p.selected ?? null);
      setShared(OPEN, r.open);
      if (r.select) setShared(REPO, r.select);
    } else if (id === "remove") {
      openOverlay({ mod: "nebula-box", kind: "dialog", modal: true, width: 440, height: 200, props: { role: "remove-project", root: p.root, name: p.name } });
    }
  }

  render() {
    const t = theme(),
      list = items(props()?.pinned);
    return v_flex()
      .id("project-menu")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .p(5)
      .bg(t.popover)
      .text_size(fs(13))
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % list.length;
        else if (e.key === "up") this.at = (this.at + list.length - 1) % list.length;
        else if (e.key === "enter") this.choose(this.at);
        else if (e.key === "escape") closeOverlay(props()?.overlay);
        else return;
        cx.notify();
      })
      .children(
        list.map((a, i) =>
          h_flex()
            .id(`pm-${a.id}`)
            .h(31)
            .px(8)
            .rounded(7)
            .items_center()
            .cursor_pointer()
            .text_color(a.danger ? t.blocked : t.foreground)
            .when(i === this.at, (el) => el.bg(t.selected))
            .hover((s) => s.bg(t.hover))
            .on_click(() => this.choose(i))
            .child(div().flex_1().child(a.label)),
        ),
      );
  }
}
