// The agent presets list, opened by `t` on the board and by Shift+Tab in the new session
// box. It reads herdr-nebula's own presets.json (nebula's copied in once). Type to
// filter; Enter launches through the new session box (prefilled with the preset), ^A
// makes a preset, ^E edits one, ^D deletes after a confirm. Tab toggles a new worktree.
// props: from ("board" | "terminal", where the launch box returns to), launch (the open
// new session box's overlay id, closed when a preset launches), newWorktree, branch
// (the list's own state, carried through the editor), task, checkout, root (what the
// box had, handed back to it with the preset), notice (a line to show at once).
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { props, closeOverlay, openOverlay, theme, home, readTextFile, writeTextFile, knownAgents } from "herdr";
import { HARNESSES } from "./lib/harness.js";
import { readPresets, writePresets, harnessOf } from "./lib/presets.js";
import { rowsOf, removePreset, launchPrefill, writeFailure } from "./lib/preset-list.js";
import { branchName } from "./lib/branch.js";
import { button, dialogTitle, agentIcon, inputBox, worktreeRow } from "./ui.js";
import { fs } from "./lib/scale.js";

// herdr-nebula's own presets (same format as nebula's agent_presets.json). nebula's file is copied in once, the first
// time ours is missing; after that nebula's is never read or written.
export const PRESETS = () => `${home()}/.config/herdr-nebula/presets.json`;
const NEBULA_PRESETS = () => `${home()}/Library/Application Support/dev.nebula.nebula/agent_presets.json`;
// null when there is no file yet: writeTextFile takes that as "create it".
export async function readPresetFile() {
  const own = await readTextFile(PRESETS()).catch(() => null);
  if (own !== null) return own;
  const theirs = await readTextFile(NEBULA_PRESETS()).catch(() => null);
  if (theirs === null) return null;
  await writeTextFile(PRESETS(), theirs, null).catch(() => null);
  return theirs;
}
const SHOWN = 8;
const ROW_H = 34;
const SEARCH = "mods/workspace-chrome/search.svg";
// Dialog sizes. The new session box is also sized in nebula/board.js (openLaunch) and mod.json (Cmd+K).
const LIST_SIZE = [600, 540];
const EDIT_SIZE = [600, 640];
const LAUNCH_SIZE = [640, 520];

const dialog = (width, height, props) => openOverlay({ mod: "nebula-box", kind: "dialog", width, height, props, modal: true });

export const openList = (ctx) => dialog(...LIST_SIZE, { role: "presets", ...ctx });

export class Presets {
  init(cx) {
    const p = props() ?? {};
    this.ctx = {
      from: p.from ?? "board",
      launch: p.launch ?? null,
      newWorktree: Boolean(p.newWorktree),
      branch: p.branch ?? branchName(""),
      task: p.task,
      checkout: p.checkout,
      root: p.root,
    };
    this.handle = cx.focus_handle();
    this.presets = [];
    this.known = [];
    this.ready = false;
    this.at = 0;
    this.top = 0;
    this.confirm = null;
    this.error = p.notice ?? "";
    this.filterFocus = true;
    this.branchFocus = false;
    this.filter = InputState.new({ placeholder: "Filter presets" });
    this.filter.on("focus", (_e, cx) => {
      this.filterFocus = true;
      cx.notify();
    });
    this.filter.on("blur", (_e, cx) => {
      this.filterFocus = false;
      cx.notify();
    });
    this.branchIn = InputState.new({ placeholder: "branch", value: this.ctx.branch });
    this.branchIn.on("change", (_e, cx) => {
      this.ctx.branch = this.branchIn.value();
      cx.notify();
    });
    this.branchIn.on("submit", (_e, cx) => this.enter(cx));
    this.branchIn.on("focus", (_e, cx) => {
      this.branchFocus = true;
      cx.notify();
    });
    this.branchIn.on("blur", (_e, cx) => {
      this.branchFocus = false;
      cx.notify();
    });
    this.filter.on("change", (_e, cx) => {
      this.at = 0;
      this.top = 0;
      this.confirm = null;
      this.error = "";
      cx.notify();
    });
    this.filter.on("submit", (_e, cx) => this.enter(cx));
    this.filter.focus();
    cx.timer.after(600, () => this.filter.focus());
    cx.spawn(async (cx) => {
      [this.known] = await Promise.all([knownAgents({}).catch(() => []), this.reload()]);
      this.ready = true;
      cx.notify();
    });
  }

  async reload() {
    this.presets = readPresets(await readPresetFile());
  }

  rows() {
    return rowsOf(this.presets, this.known, this.filter.value());
  }
  sel() {
    const rows = this.rows();
    return rows[Math.min(this.at, rows.length - 1)] ?? null;
  }
  close() {
    closeOverlay(props()?.overlay);
  }

  edit(name) {
    this.close();
    dialog(...EDIT_SIZE, { role: "preset-edit", name, ...this.ctx });
  }

  enter(cx) {
    if (!this.ready) return;
    const row = this.sel();
    if (this.confirm) return this.remove(this.confirm, cx);
    if (!row) return;
    if (row.reason) {
      this.error = `${row.preset.name} can't launch: ${row.reason}.`;
      cx.notify();
      return;
    }
    if (this.ctx.launch) closeOverlay(this.ctx.launch);
    this.close();
    dialog(...LAUNCH_SIZE, { ...(this.ctx.from === "board" ? { role: "launch" } : {}), prefill: launchPrefill(row.preset, this.ctx) });
  }

  remove(name, cx) {
    this.confirm = null;
    cx.spawn(async (cx) => {
      try {
        const text = await readPresetFile();
        await writeTextFile(PRESETS(), writePresets(removePreset(readPresets(text), name), text), text);
        await this.reload();
      } catch (error) {
        await this.reload();
        this.error = writeFailure(error, "The presets file changed meanwhile. Showing the newer list; delete again if you still want to.");
      }
      cx.notify();
    });
    cx.notify();
  }

  move(d, cx) {
    const n = this.rows().length;
    if (!n) return;
    this.at = (this.at + d + n) % n;
    if (this.at < this.top) this.top = this.at;
    if (this.at >= this.top + SHOWN) this.top = this.at - SHOWN + 1;
    this.confirm = null;
    cx.notify();
  }

  key(e, cx) {
    const m = e.modifiers ?? {},
      k = e.key;
    if (k === "escape") {
      if (this.confirm) {
        this.confirm = null;
        cx.notify();
      } else this.close();
    } else if (k === "down") this.move(1, cx);
    else if (k === "up") this.move(-1, cx);
    else if (k === "tab") {
      this.ctx.newWorktree = !this.ctx.newWorktree;
      cx.notify();
    } else if (m.control && k === "a") this.edit(null);
    else if (m.control && k === "e") {
      const row = this.sel();
      if (row) this.edit(row.preset.name);
    } else if (m.control && k === "d") {
      const row = this.sel();
      if (row) {
        this.confirm = row.preset.name;
        cx.notify();
      }
    } else return;
    cx.stop_propagation();
  }

  badge(t, text) {
    return h_flex().h(18).px(7).flex_none().items_center().rounded(9).border_1().border_color(t.border).text_size(fs(11)).text_color(t.muted).child(text);
  }

  row(t, r, i) {
    const p = r.preset,
      on = i === this.at,
      id = harnessOf(p);
    const meta = [p.model, p.effort].filter(Boolean).join(" · ") || "default";
    return h_flex()
      .id(`pl-${i}`)
      .h(ROW_H)
      .flex_none()
      .px(10)
      .gap(9)
      .items_center()
      .rounded(7)
      .cursor_pointer()
      .opacity(r.reason ? 0.55 : 1)
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click((_e, cx) => {
        this.at = i;
        this.confirm = null;
        this.enter(cx);
      })
      .child(HARNESSES[id] ? svg(agentIcon(id)).size(16).flex_none().text_color(t.foreground) : div().w(16).flex_none())
      .child(div().max_w(240).truncate().text_size(fs(13)).text_color(t.foreground).child(p.name))
      .child(div().flex_1().min_w(0).truncate().text_size(fs(12)).text_color(t.muted).child(meta))
      .when(Boolean(p.prefix.trim()), (el) => el.child(this.badge(t, "prefix")))
      .when(Boolean(p.postfix.trim()), (el) => el.child(this.badge(t, "postfix")))
      .when(Boolean(r.reason), (el) => el.child(div().flex_none().text_size(fs(11)).text_color(t.blocked).child(r.reason)));
  }

  render() {
    const t = theme(),
      rows = this.rows();
    this.at = Math.min(this.at, Math.max(0, rows.length - 1));
    const shown = rows.slice(this.top, this.top + SHOWN);
    return v_flex()
      .id("presets")
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.key(e, cx))
      .size_full()
      .px(22)
      .pt(20)
      .pb(16)
      .gap(14)
      .bg(t.popover)
      .text_color(t.foreground)
      .text_size(fs(13))
      .child(dialogTitle(t, "Agent presets"))
      .child(
        h_flex()
          .h(34)
          .flex_none()
          .px(11)
          .gap(8)
          .items_center()
          .rounded(7)
          .border_1()
          .border_color(this.filterFocus ? t.accent : t.input)
          .bg(t.background)
          .child(svg(SEARCH).size(14).flex_none().text_color(t.dim))
          .child(Input.new(this.filter).flex_1().h_full().text_size(fs(13)).text_color(t.foreground)),
      )
      .child(
        v_flex()
          .flex_1()
          .min_h(0)
          .gap(2)
          .children(shown.map((r, n) => this.row(t, r, this.top + n)))
          .when(this.ready && !rows.length, (el) =>
            el.child(
              div()
                .py(28)
                .flex()
                .justify_center()
                .text_size(fs(12))
                .text_color(t.muted)
                .child(this.presets.length ? "No preset matches." : "No presets yet. Press ^A to add one."),
            ),
          ),
      )
      .when(Boolean(this.error), (el) => el.child(div().text_size(fs(12)).text_color(t.blocked).child(this.error)))
      .child(
        worktreeRow(t, {
          id: "pl-wt",
          on: this.ctx.newWorktree,
          hint: "Tab",
          onToggle: (cx) => {
            this.ctx.newWorktree = !this.ctx.newWorktree;
            cx.notify();
          },
          branch: inputBox(t, Input.new(this.branchIn), this.branchFocus).w_full(),
        }),
      )
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .flex_none()
          .child(
            div()
              .flex_1()
              .min_w(0)
              .truncate()
              .text_size(fs(12))
              .text_color(this.confirm ? t.blocked : t.muted)
              .child(this.confirm ? `Delete "${this.confirm}"? Enter yes · Esc no` : "Enter launch · ^A new · ^E edit · ^D delete"),
          )
          .child(button(t, "pl-new", "New preset", "plain", () => this.edit(null))),
      );
  }
}
