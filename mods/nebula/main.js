// One mod, three parts of the window told apart by props.role: "top" (the strip under
// the window buttons), "rail" (the icon bar) and "board" (the project tabs and sessions). Dialogs are
// in the nebula-box mod: letter keys bound to this mod would swallow typing in a text
// field here.
import { View, div } from "gpui-kit";
import { props, theme } from "herdr";
import { Rail } from "./rail.js";
import { Board } from "./board.js";

export default class Nebula extends View {
  init(_props, cx) {
    const role = props()?.role;
    if (role === "rail") this.part = new Rail();
    else if (role === "board") this.part = new Board();
    else return;
    this.part.init(cx);
  }

  render() {
    if (this.part) return this.part.render();
    return div().size_full().bg(theme().chrome);
  }
}
