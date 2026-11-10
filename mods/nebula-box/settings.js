import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { props, closeOverlay, openOverlay, theme, shared, setShared, knownAgents, run } from "herdr";
import { HARNESSES } from "./lib/harness.js";
import { installedHarnesses } from "./lib/launch.js";
import { VIEW_IDS, VIEW_TITLE, SIDES, AWAY_CHOICES, AWAY_LABEL, mergeSettings, defaultHarness, harnessChoice, cycleOf } from "./lib/settings.js";
import { SETTINGS, UPDATE } from "./lib/shared.js";
import { updateLine, updateState } from "./lib/update.js";
import { SLEEP_CHOICES, sleepLabel } from "./lib/sleep.js";
import { button, dialogTitle, switchControl, segmented, dropdown, agentIcon } from "./ui.js";
import { fs, TEXT_SIZES, textSizeLabel } from "./lib/scale.js";

const VIEW_OPTIONS = VIEW_IDS.map((v) => ({ value: v, label: VIEW_TITLE[v], icon: `mods/nebula/icons/${v}.svg` }));
const SIDE_OPTIONS = [
  { value: "prefix", label: "Before task" },
  { value: "postfix", label: "After task" },
];
const TOGGLES = {
  newWorktree: ["New worktree", "Start new sessions in their own wt worktree"],
  autoTitle: ["Auto-title", "Name each session after its first prompt"],
  confirmArchive: ["Confirm archive", "Ask before hiding a session"],
  promptLine: ["Prompt line on rows", "Show the last prompt under each session's title"],
  showEmptyWorktrees: ["Show empty worktrees", "Give every worktree a band, one with nothing running too"],
  preview: ["Preview while moving", "Show the agent as you move the highlight; Herdr moves the keys there. Off: only Enter or a click opens"],
  nebulaSessions: ["Nebula sessions", "Show nebula sessions on the board"],
  reduceMotion: ["Reduce motion", "Turn every animation off: spinners, bobbing, nudges and slides"],
};
const SLEEP_OPTIONS = SLEEP_CHOICES.map((m) => ({ value: m, label: sleepLabel(m) }));
const AWAY_OPTIONS = [
  { value: "macos", label: "macOS" },
  { value: "herdr", label: "Card" },
  { value: "off", label: "Off" },
];
const TEXT_OPTIONS = TEXT_SIZES.map((p) => ({ value: p, label: textSizeLabel(p) }));
const PICK_W = 150;

export class Settings {
  init(cx) {
    this.s = mergeSettings(shared(SETTINGS));
    this.ids = [];
    this.loaded = false;
    this.at = 0;
    this.dd = null; // the open dropdown: { key: "harness" | "<agent>:model" | "<agent>:effort", hi }
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(300, () => {
      if (!this.editing()) this.handle.focus();
    });
    this.editor = InputState.new({ value: this.s.editor === "open" ? "" : this.s.editor, placeholder: "open" });
    this.editor.on("change", (_e, cx) => {
      this.saveEditor();
      cx.notify();
    });
    cx.spawn(async (cx) => {
      this.ids = installedHarnesses(await knownAgents({}).catch(() => []));
      this.loaded = true;
      cx.notify();
    });
  }

  rows() {
    return [
      "view",
      "newWorktree",
      "autoTitle",
      "confirmArchive",
      "promptLine",
      "showEmptyWorktrees",
      "preview",
      "presetSide",
      "editor",
      "textSize",
      "reduceMotion",
      "harness",
      ...this.ids.map((id) => `h:${id}`),
      "sleepAfter",
      "away",
      "nebulaSessions",
      "import",
      "update",
    ];
  }

  // Settings' Update button and Enter on its row: the icon bar runs it (nebula.update, or a check first).
  updateNow() {
    run(updateState(shared(UPDATE) ?? {}) === "available" ? "nebula.update" : "nebula.checkupdate", {});
  }

  // Closes this overlay first: it would otherwise save its older copy over the import.
  openImport() {
    this.saveEditor();
    closeOverlay(props()?.overlay);
    openOverlay({ mod: "nebula-box", kind: "dialog", modal: true, width: 520, height: 420, props: { role: "import" } });
  }

  editing() {
    return this.rows()[this.at] === "editor";
  }

  save(patch) {
    const next = mergeSettings({ ...this.s, ...patch });
    if (JSON.stringify(next) === JSON.stringify(this.s)) return;
    this.s = next;
    setShared(SETTINGS, this.s);
  }

  saveEditor() {
    this.save({ editor: this.editor.value() });
  }

  go(i, cx) {
    const n = this.rows().length;
    this.at = (i + n) % n;
    this.dd = null;
    if (this.editing()) this.editor.focus();
    else this.handle.focus();
    cx.notify();
  }

  setHarnessChoice(id, part, value) {
    this.save({ harnesses: { ...this.s.harnesses, [id]: { ...harnessChoice(this.s, id), [part]: value } } });
  }

  change(row, dir, part = "model") {
    if (row === "view") this.save({ view: cycleOf(VIEW_IDS, this.s.view, dir) });
    else if (row === "harness" && this.ids.length) this.save({ harness: cycleOf(this.ids, defaultHarness(this.s, this.ids), dir) });
    else if (row === "presetSide") this.save({ presetSide: cycleOf(SIDES, this.s.presetSide, dir) });
    else if (row === "sleepAfter") this.save({ sleepAfter: cycleOf(SLEEP_CHOICES, this.s.sleepAfter, dir) });
    else if (row === "away") this.save({ away: cycleOf(AWAY_CHOICES, this.s.away, dir) });
    else if (row === "textSize") this.save({ textSize: cycleOf(TEXT_SIZES, this.s.textSize, dir) });
    else if (row in TOGGLES) this.save({ [row]: !this.s[row] });
    else if (row.startsWith("h:")) {
      const id = row.slice(2),
        h = HARNESSES[id],
        choices = part === "model" ? h.models : h.efforts;
      if (choices.length) this.setHarnessChoice(id, part, cycleOf([null, ...choices], harnessChoice(this.s, id)[part], dir));
    }
  }

  // Dropdown data. A key is "harness" or "<agent>:<model|effort>".
  items(key) {
    if (key === "harness") return this.ids.map((id) => ({ value: id, label: HARNESSES[id].label, icon: agentIcon(id) }));
    const [id, part] = key.split(":"),
      h = HARNESSES[id];
    return [{ value: null, label: "Default" }, ...(part === "model" ? h.models : h.efforts).map((v) => ({ value: v, label: v }))];
  }

  valueOf(key) {
    if (key === "harness") return defaultHarness(this.s, this.ids);
    const [id, part] = key.split(":");
    return harnessChoice(this.s, id)[part];
  }

  openDd(key, cx) {
    if (this.dd?.key === key) {
      this.dd = null;
      cx.notify();
      return;
    }
    const row = key === "harness" ? "harness" : `h:${key.split(":")[0]}`;
    this.go(this.rows().indexOf(row), cx);
    const hi = this.items(key).findIndex((i) => i.value === this.valueOf(key));
    this.dd = { key, hi: Math.max(hi, 0) };
    cx.notify();
  }

  closeDd(key, cx) {
    if (this.dd && (key == null || this.dd.key === key)) {
      this.dd = null;
      cx.notify();
    }
  }

  pickDd(key, value, cx) {
    if (key === "harness") this.save({ harness: value });
    else {
      const [id, part] = key.split(":");
      this.setHarnessChoice(id, part, value);
    }
    this.dd = null;
    this.handle.focus();
    cx.notify();
  }

  ddKey(k, cx) {
    const { key, hi } = this.dd,
      items = this.items(key);
    if (k === "escape") this.dd = null;
    else if (k === "down") this.dd = { key, hi: (hi + 1) % items.length };
    else if (k === "up") this.dd = { key, hi: (hi - 1 + items.length) % items.length };
    else if (k === "enter" || k === "space") this.pickDd(key, items[hi].value, cx);
  }

  key(e, cx) {
    const m = e.modifiers ?? {},
      k = e.key,
      row = this.rows()[this.at],
      typing = row === "editor";
    if (this.dd) this.ddKey(k, cx);
    else if (k === "escape") {
      this.saveEditor();
      closeOverlay(props()?.overlay);
    } else if (k === "down") this.go(this.at + 1, cx);
    else if (k === "up") this.go(this.at - 1, cx);
    else if (k === "tab") this.change("harness", m.shift ? -1 : 1);
    else if (typing) return;
    else if (k === "left" || k === "right") this.change(row, k === "right" ? 1 : -1, m.shift ? "effort" : "model");
    else if (k === "enter" || k === "space") {
      if (row === "harness" && this.ids.length) this.openDd("harness", cx);
      else if (row.startsWith("h:")) this.openAgent(row.slice(2), m.shift ? "effort" : "model", cx);
      else if (row === "import") this.openImport();
      else if (row === "update") this.updateNow();
      else this.change(row, 1);
    } else return;
    cx.stop_propagation();
    cx.notify();
  }

  openAgent(id, part, cx) {
    if ((part === "model" ? HARNESSES[id].models : HARNESSES[id].efforts).length) this.openDd(`${id}:${part}`, cx);
  }

  // One settings row: the label and an optional description on the left, the control
  // right-aligned. The keyboard row gets a quiet highlight that fills the card's width.
  line(t, i, label, desc, control, onLabel) {
    return h_flex()
      .id(`row-${i}`)
      .min_h(48)
      .px(14)
      .py(8)
      .gap(16)
      .items_center()
      .flex_none()
      .when(this.at === i, (el) => el.bg(t.hover))
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .gap(2)
          .when(Boolean(onLabel), (el) =>
            el.cursor_pointer().on_click((_e, cx) => {
              onLabel(cx);
              cx.notify();
            }),
          )
          .child(typeof label === "string" ? div().truncate().text_size(fs(13)).text_color(t.foreground).child(label) : label)
          .when(Boolean(desc), (el) => el.child(div().truncate().text_size(fs(12)).text_color(t.muted).child(desc))),
      )
      .child(h_flex().flex_none().items_center().child(control));
  }

  group(t, title, rows) {
    const out = [];
    rows.forEach((r, i) => {
      if (i) out.push(div().h(1).mx(14).bg(t.border).flex_none());
      out.push(r);
    });
    return v_flex()
      .gap(8)
      .flex_none()
      .child(div().px(2).text_size(fs(12)).font_semibold().text_color(t.muted).child(title))
      .child(v_flex().rounded(10).border_1().border_color(t.border).overflow_hidden().children(out));
  }

  pick(t, key, extra = {}) {
    const items = this.items(key),
      open = this.dd?.key === key;
    return dropdown(t, {
      id: `dd-${key.replace(":", "-")}`,
      items,
      value: this.valueOf(key),
      open,
      hi: this.dd?.hi ?? 0,
      width: PICK_W,
      onToggle: (cx) => this.openDd(key, cx),
      onClose: (cx) => this.closeDd(key, cx),
      onPick: (v, cx) => this.pickDd(key, v, cx),
      ...extra,
    });
  }

  render() {
    const t = theme(),
      s = this.s,
      rows = this.rows();
    const at = (id) => rows.indexOf(id);
    const toggle = (id) => {
      const [label, desc] = TOGGLES[id];
      return this.line(
        t,
        at(id),
        label,
        desc,
        switchControl(t, `st-${id}`, s[id], (on, cx) => {
          this.go(at(id), cx);
          this.save({ [id]: on });
        }),
        (cx) => {
          this.go(at(id), cx);
          this.change(id, 1);
        },
      );
    };
    const agent = (id) => {
      const h = HARNESSES[id];
      const col = (part) =>
        this.pick(t, `${id}:${part}`, {
          prefix: part === "model" ? "Model" : "Effort",
          width: PICK_W,
          disabled: !(part === "model" ? h.models : h.efforts).length,
          onToggle: (cx) => this.openAgent(id, part, cx),
        });
      return this.line(
        t,
        at(`h:${id}`),
        h_flex()
          .min_w(0)
          .gap(9)
          .items_center()
          .child(svg(agentIcon(id)).size(16).flex_none().text_color(t.foreground))
          .child(div().truncate().text_size(fs(13)).text_color(t.foreground).child(h.label)),
        null,
        h_flex().gap(6).items_center().child(col("model")).child(col("effort")),
      );
    };
    return v_flex()
      .id("settings")
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.key(e, cx))
      .size_full()
      .px(22)
      .pt(20)
      .pb(16)
      .gap(18)
      .bg(t.popover)
      .text_color(t.foreground)
      .text_size(fs(13))
      .child(dialogTitle(t, "Settings"))
      .child(
        v_flex()
          .flex_1()
          .min_h(0)
          .gap(22)
          .overflow_y_scrollbar()
          .child(
            this.group(t, "Board", [
              this.line(
                t,
                at("view"),
                "Opens in",
                null,
                segmented(t, "view", VIEW_OPTIONS, s.view, (v, cx) => {
                  this.go(at("view"), cx);
                  this.save({ view: v });
                }),
              ),
              toggle("newWorktree"),
              toggle("autoTitle"),
              toggle("confirmArchive"),
              toggle("promptLine"),
              toggle("showEmptyWorktrees"),
              toggle("preview"),
              this.line(
                t,
                at("presetSide"),
                "Preset text",
                "Where a preset's text goes in the task",
                segmented(t, "presetSide", SIDE_OPTIONS, s.presetSide, (v, cx) => {
                  this.go(at("presetSide"), cx);
                  this.save({ presetSide: v });
                }),
              ),
              this.line(
                t,
                at("editor"),
                "Open folder with",
                "The command for Shift+Enter on a row",
                Input.new(this.editor)
                  .w(170)
                  .h(30)
                  .px(10)
                  .rounded(7)
                  .border_1()
                  .border_color(this.editing() ? t.accent : t.input)
                  .bg(t.background)
                  .text_size(fs(12)),
              ),
            ]),
          )
          .child(
            this.group(t, "Look", [
              this.line(
                t,
                at("textSize"),
                "Text size",
                "The panels' text, next to the terminal's size in Herdr's settings",
                segmented(t, "textSize", TEXT_OPTIONS, s.textSize, (v, cx) => {
                  this.go(at("textSize"), cx);
                  this.save({ textSize: v });
                }),
              ),
              toggle("reduceMotion"),
            ]),
          )
          .child(
            this.group(t, "Agents", [
              this.line(
                t,
                at("harness"),
                "Default agent",
                "Picked first in the new-session box",
                this.ids.length
                  ? this.pick(t, "harness", { width: 170 })
                  : div()
                      .text_size(fs(12))
                      .text_color(t.muted)
                      .child(this.loaded ? "No supported agent installed" : "Looking for agents\u2026"),
              ),
              ...this.ids.map(agent),
              this.line(
                t,
                at("sleepAfter"),
                "Sleep idle agents after",
                "Frees memory; Enter resumes it",
                segmented(t, "sleepAfter", SLEEP_OPTIONS, s.sleepAfter, (v, cx) => {
                  this.go(at("sleepAfter"), cx);
                  this.save({ sleepAfter: v });
                }),
              ),
              this.line(
                t,
                at("away"),
                v_flex()
                  .gap(2)
                  .child(div().truncate().text_size(fs(13)).text_color(t.foreground).child("When you're away"))
                  .child(div().truncate().text_size(fs(12)).text_color(t.muted).child(AWAY_LABEL[s.away]))
                  .child(div().truncate().text_size(fs(12)).text_color(t.muted).child("Herdr's own popup is unaffected")),
                null,
                segmented(t, "away", AWAY_OPTIONS, s.away, (v, cx) => {
                  this.go(at("away"), cx);
                  this.save({ away: v });
                }),
              ),
            ]),
          )
          .child(
            this.group(t, "Data", [
              toggle("nebulaSessions"),
              this.line(
                t,
                at("import"),
                "Import from nebula",
                "Projects and defaults from nebula's own files",
                button(t, "st-import", "Import...", "plain", () => this.openImport()),
              ),
            ]),
          )
          .child(
            this.group(t, "Updates", [
              this.line(
                t,
                at("update"),
                "herdr-nebula",
                updateLine(shared(UPDATE)),
                updateState(shared(UPDATE) ?? {}) === "available"
                  ? button(t, "st-update", "Update", "primary", () => this.updateNow())
                  : button(t, "st-check", "Check now", "plain", () => this.updateNow()),
              ),
            ]),
          ),
      )
      .child(
        h_flex()
          .items_center()
          .text_size(fs(12))
          .text_color(t.muted)
          .child(div().flex_1().child("Changes save as you go"))
          .child(div().child("\u2191\u2193 move   \u2190\u2192 change   Enter open")),
      );
  }
}
