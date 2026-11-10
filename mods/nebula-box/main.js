// The dialogs and overlays of the nebula layout, told apart by props.role. They live
// apart from the rail and board so a letter bound to the board never reaches a text
// field here.
import { View, div } from "gpui-kit";
import { props, theme, settings, shared } from "herdr";
import { mergeSettings } from "./lib/settings.js";
import { SETTINGS } from "./lib/shared.js";
import { setTextScale } from "./lib/scale.js";
import { AddRepo } from "./add-repo.js";
import { Launch } from "./launch.js";
import { Presets } from "./presets.js";
import { PresetEdit } from "./preset-edit.js";
import { Menu } from "./menu.js";
import { Confirm } from "./confirm.js";
import { Rename } from "./rename.js";
import { Settings } from "./settings.js";
import { ArchiveConfirm } from "./archive-confirm.js";
import { Help } from "./help.js";
import { RemoveProject } from "./remove-project.js";
import { Import } from "./import.js";
import { Projects } from "./projects.js";
import { ProjectMenu } from "./project-menu.js";
import { Hud } from "./hud.js";
import { Jump } from "./jump.js";
import { About } from "./about.js";
import { Changes } from "./changes.js";

const PARTS = {
  add: AddRepo,
  launch: Launch,
  presets: Presets,
  "preset-edit": PresetEdit,
  menu: Menu,
  confirm: Confirm,
  rename: Rename,
  settings: Settings,
  help: Help,
  "archive-confirm": ArchiveConfirm,
  "remove-project": RemoveProject,
  import: Import,
  projects: Projects,
  "project-menu": ProjectMenu,
  hud: Hud,
  jump: Jump,
  about: About,
  changes: Changes,
};

export default class NebulaBox extends View {
  init(_props, cx) {
    const role = props()?.role || "launch";
    if (!Object.hasOwn(PARTS, role)) return;
    this.part = new PARTS[role]();
    this.part.init(cx);
  }

  render(cx) {
    setTextScale(settings(), mergeSettings(shared(SETTINGS)).textSize);
    if (this.part) return this.part.render(cx);
    return div().size_full().bg(theme().chrome);
  }
}
