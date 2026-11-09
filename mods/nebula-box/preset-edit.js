// The preset editor, opened by ^A and ^E in the presets list: name, agent, model,
// effort, and the text added before (prefix) and after (postfix) the task. It saves into
// nebula's agent_presets.json with the text it read as `expected`, so a file nebula
// changed meanwhile is refused; then it shows the newer list. Saving, cancelling or
// closing opens the list again with the state it was left with.
// props: name (the preset to edit; null for a new one), and the list's ctx (from,
// launch, newWorktree, branch, task, checkout, root).
import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { props, closeOverlay, theme, writeTextFile, knownAgents, shared } from "herdr";
import { HARNESSES } from "./lib/harness.js";
import { readPresets, writePresets, harnessOf, same } from "./lib/presets.js";
import { NEW_PRESET, harnessReason, presetFrom, savePreset, isStale } from "./lib/preset-list.js";
import { PRESETS, readPresetFile, openList } from "./presets.js";
import { mergeSettings, cycleOf } from "./lib/settings.js";
import { SETTINGS } from "./lib/shared.js";
import { button, dialogTitle, dropdown, agentIcon, inputBox, textCard } from "./ui.js";

const CTRL_W = 260;
const KEYS = { model: 1, effort: 2 }; // the editor field behind each part

export class PresetEdit {
  init(cx) {
    const p = props() ?? {};
    this.was = p.name ?? null;
    this.ctx = { from: p.from, launch: p.launch, newWorktree: p.newWorktree, branch: p.branch, task: p.task, checkout: p.checkout, root: p.root };
    this.handle = cx.focus_handle();
    this.ready = false;
    this.busy = false;
    this.error = "";
    this.known = [];
    this.base = NEW_PRESET;
    this.harness = "claude";
    this.at = 0;
    this.dd = null; // the open dropdown: { key: "agent" | "model" | "effort", hi }
    this.order = !this.was && mergeSettings(shared(SETTINGS)).presetSide === "postfix" ? [0, 1, 2, 4, 3] : [0, 1, 2, 3, 4];
    const field = (placeholder) => {
      const s = InputState.new({ placeholder });
      s.on("change", (_e, cx) => { this.error = ""; cx.notify(); });
      s.on("submit", (_e, cx) => this.save(cx));
      return s;
    };
    const area = (placeholder) => {
      const s = TextareaState.new({ placeholder });
      s.set_auto_grow(2, 5);
      s.on("change", (_e, cx) => { this.error = ""; cx.notify(); });
      return s;
    };
    this.fields = [field("name"), field("default"), field("default"), area("added before the task"), area("added after the task")];
    this.fields.forEach((s, i) => s.on("focus", (_e, cx) => { this.at = i; cx.notify(); }));
    this.fields[0].focus();
    cx.timer.after(600, () => this.fields[this.at].focus());
    cx.spawn(async (cx) => {
      [this.known, this.text] = await Promise.all([knownAgents({}).catch(() => []), readPresetFile()]);
      const found = this.was ? readPresets(this.text).find((q) => same(q.name, this.was)) : null;
      if (this.was && !found) this.error = `"${this.was}" is not in the file any more. Saving adds it back.`;
      this.base = found ?? { ...NEW_PRESET, name: this.was ?? "" };
      this.harness = harnessOf(this.base);
      [this.base.name, this.base.model ?? "", this.base.effort ?? "", this.base.prefix, this.base.postfix].forEach((v, i) => this.fields[i].set_value(v));
      this.ready = true;
      cx.notify();
    });
  }

  // Agents the dropdown offers: the installed ones, plus the preset's own if it is not.
  harnesses() {
    const ids = Object.keys(HARNESSES).filter((id) => id === this.harness || !harnessReason(id, this.known));
    return ids.includes(this.harness) ? ids : [...ids, this.harness];
  }

  cycleHarness(cx) {
    this.harness = cycleOf(this.harnesses(), this.harness, 1);
    cx.notify();
  }

  // Model and effort pick from the agent's list; an agent with no list takes free text.
  choices(key) { const h = HARNESSES[this.harness]; return (key === "model" ? h?.models : h?.efforts) ?? []; }
  free(key) { return !this.choices(key).length; }
  valueOf(key) {
    if (key === "agent") return this.harness;
    return this.fields[KEYS[key]].value().trim() || null;
  }

  items(key) {
    if (key === "agent") return this.harnesses().map((id) => ({ value: id, label: HARNESSES[id]?.label ?? id, icon: HARNESSES[id] ? agentIcon(id) : undefined }));
    const cur = this.valueOf(key), list = this.choices(key);
    return [{ value: null, label: "Default" }, ...(cur && !list.includes(cur) ? [cur] : []).concat(list).map((v) => ({ value: v, label: v }))];
  }

  openDd(key, cx) {
    if (this.dd?.key === key) return this.closeDd(key, cx);
    this.dd = { key, hi: Math.max(0, this.items(key).findIndex((i) => i.value === this.valueOf(key))) };
    this.handle.focus();
    cx.notify();
  }

  closeDd(key, cx) {
    if (!this.dd || (key != null && this.dd.key !== key)) return;
    this.dd = null;
    this.fields[this.tabs().includes(this.at) ? this.at : 0].focus();
    cx.notify();
  }

  pickDd(key, value, cx) {
    if (key === "agent") this.harness = value;
    else this.fields[KEYS[key]].set_value(value ?? "");
    this.closeDd(null, cx);
  }

  ddKey(k, cx) {
    const { key, hi } = this.dd, items = this.items(key);
    if (k === "escape") this.closeDd(null, cx);
    else if (k === "down") this.dd = { key, hi: (hi + 1) % items.length };
    else if (k === "up") this.dd = { key, hi: (hi - 1 + items.length) % items.length };
    else if (k === "enter" || k === "space") this.pickDd(key, items[hi].value, cx);
  }

  // Tab skips the fields that are dropdowns right now.
  tabs() { return this.order.filter((i) => i === 0 || i > 2 || this.free(i === 1 ? "model" : "effort")); }

  leave(notice) {
    closeOverlay(props()?.overlay);
    openList({ ...this.ctx, notice });
  }

  save(cx) {
    if (this.busy || !this.ready) return;
    const [name, model, effort, prefix, postfix] = this.fields.map((s) => s.value());
    const edited = presetFrom(this.base, { name, harness: this.harness, model, effort, prefix, postfix });
    this.busy = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const result = savePreset(readPresets(this.text), edited, this.was);
        if (result.error) { this.error = result.error; return; }
        await writeTextFile(PRESETS(), writePresets(result.presets, this.text), this.text);
        this.leave();
      } catch (error) {
        // Only a stale snapshot sends you back to the newer list; any other failure keeps the editor and its fields.
        if (isStale(error)) this.leave("The presets file changed meanwhile. Showing the newer list; make your edit again.");
        else this.error = String(error?.message ?? error);
      } finally {
        this.busy = false;
        cx.notify();
      }
    });
  }

  key(e, cx) {
    const m = e.modifiers ?? {}, k = e.key;
    if (this.dd) {
      this.ddKey(k, cx);
      cx.stop_propagation();
      cx.notify();
      return;
    }
    if (k === "escape") this.leave();
    else if (k === "tab") {
      const tabs = this.tabs(), n = tabs.length;
      this.fields[tabs[(Math.max(0, tabs.indexOf(this.at)) + (m.shift ? n - 1 : 1)) % n]].focus();
    }
    else if (m.control && k === "g") this.cycleHarness(cx);
    else if (m.control && k === "s") this.save(cx);
    else return;
    cx.stop_propagation();
  }

  // One row: label (and a note) on the left, the control on the right.
  line(t, label, desc, control, tone) {
    return h_flex().min_h(48).px(14).py(8).gap(16).items_center().flex_none()
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().truncate().text_size(13).text_color(t.foreground).child(label))
        .when(Boolean(desc), (el) => el.child(div().truncate().text_size(11.5).text_color(tone ?? t.dim).child(desc))))
      .child(h_flex().flex_none().items_center().child(control));
  }

  // A row whose control is full width: the label and note above, the box below.
  block(t, label, desc, body) {
    return v_flex().px(14).py(10).gap(8).flex_none()
      .child(v_flex().gap(2)
        .child(div().text_size(13).text_color(t.foreground).child(label))
        .child(div().text_size(11.5).text_color(t.dim).child(desc)))
      .child(body);
  }

  pick(t, key) {
    return dropdown(t, {
      id: `pe-${key}`, items: this.items(key), value: this.valueOf(key), open: this.dd?.key === key, hi: this.dd?.hi ?? 0,
      width: CTRL_W, h: 30, rounded: 7, onToggle: (cx) => this.openDd(key, cx), onClose: (cx) => this.closeDd(key, cx),
      onPick: (v, cx) => this.pickDd(key, v, cx),
    });
  }

  render() {
    const t = theme();
    const reason = this.ready ? harnessReason(this.harness, this.known) : null;
    const [name, model, effort, prefix, postfix] = this.fields;
    const text = (i, state) => inputBox(t, Input.new(state), this.at === i).w(CTRL_W);
    const area = (i, state) => textCard(t, Textarea.new(state), this.at === i).rounded(7);
    const choice = (key, i, state) => (this.free(key) ? text(i, state) : this.pick(t, key));
    const note = (key) => (this.free(key) ? "Any id the agent takes; empty is its default" : "Default leaves it to the agent");
    const rows = [
      this.line(t, "Name", "Shown in the preset list", text(0, name)),
      this.line(t, "Agent", reason ?? "The CLI that runs the task", this.pick(t, "agent"), reason ? t.blocked : t.dim),
      this.line(t, "Model", note("model"), choice("model", 1, model)),
      this.line(t, "Effort", note("effort"), choice("effort", 2, effort)),
      ...this.order.slice(3).map((i) => (i === 3
        ? this.block(t, "Prefix", "Added before the task", area(3, prefix))
        : this.block(t, "Postfix", "Added after the task", area(4, postfix)))),
    ];
    const out = [];
    rows.forEach((r, i) => { if (i) out.push(div().h(1).mx(14).bg(t.border).flex_none()); out.push(r); });
    return v_flex().id("preset-edit").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .size_full().px(22).pt(20).pb(16).gap(16).bg(t.popover).text_color(t.foreground).text_size(13)
      .child(dialogTitle(t, this.was ? "Edit preset" : "New preset"))
      .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar()
        .child(v_flex().rounded(10).border_1().border_color(t.border).overflow_hidden().children(out)))
      .when(Boolean(this.error), (el) => el.child(div().text_size(12).text_color(t.blocked).child(this.error)))
      .child(h_flex().gap(8).items_center().flex_none()
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child("Enter save · ^S save from text boxes · Tab next · ^G agent"))
        .child(button(t, "pe-cancel", "Cancel", "plain", () => this.leave()))
        .child(button(t, "pe-save", this.busy ? "Saving…" : "Save", "primary", (_e, cx) => this.save(cx))));
  }
}
