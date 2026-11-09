// The right-click menu on a project in the icon bar, a pointer popup (role "project-menu";
// props: { root, name, open (the open roots, in order), selected (the shown project or null for All) }).
// Close takes the project out of the open list (the next one is shown when it was the selected
// one); Remove asks first, then drops it from the list altogether.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, openOverlay, setShared, theme } from "herdr";
import { OPEN, REPO } from "./lib/shared.js";
import { closeProject } from "./lib/open.js";

const ITEMS = [
  { id: "close", label: "Close" },
  { id: "remove", label: "Remove from list...", danger: true },
];

export class ProjectMenu {
  init(cx) {
    this.at = 0;
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  choose(i) {
    const id = ITEMS[i]?.id,
      p = props() ?? {};
    closeOverlay(p.overlay);
    if (id === "close") {
      const r = closeProject(p.open ?? [], p.root, p.selected ?? null);
      setShared(OPEN, r.open);
      if (r.select) setShared(REPO, r.select);
    } else if (id === "remove") {
      openOverlay({ mod: "nebula-box", kind: "dialog", modal: true, width: 440, height: 200, props: { role: "remove-project", root: p.root, name: p.name } });
    }
  }

  render() {
    const t = theme();
    return v_flex()
      .id("project-menu")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % ITEMS.length;
        else if (e.key === "up") this.at = (this.at + ITEMS.length - 1) % ITEMS.length;
        else if (e.key === "enter") this.choose(this.at);
        else if (e.key === "escape") closeOverlay(props()?.overlay);
        else return;
        cx.notify();
      })
      .children(
        ITEMS.map((a, i) =>
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
