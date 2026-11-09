// The new session box: pick a repo, a checkout (or a new worktree made by wt), an agent
// and a preset, type the task, Enter starts the agent. The board opens it with role
// "launch"; Cmd+K opens it with no props, which is a launch from a terminal. A session's
// launch label in props.prefill (shift-P) sets the starting choices. The choices become
// ordered steps in lib/launch.js; this file only runs them.
import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import {
  props, closeOverlay, theme, shared, setShared, exec, home, run, spaces, panes, focused, knownAgents,
} from "herdr";
import { STORE, projectList, listCheckouts, commonDirOf, resolveAdd, tilde } from "./lib/repos.js";
import { HARNESSES } from "./lib/harness.js";
import { readPresets } from "./lib/presets.js";
import { inside } from "./lib/projects.js";
import { REFOCUS_MS } from "./lib/focus.js";
import { branchName } from "./lib/branch.js";
import { mergeSettings, defaultHarness, harnessChoice, cycleOf } from "./lib/settings.js";
import { REPO, SETTINGS, FOCUS_BOARD, LAUNCHED } from "./lib/shared.js";
import { openList, readPresetFile } from "./presets.js";
import { button, dialogTitle, dropdown, agentIcon, inputBox, textCard, worktreeRow } from "./ui.js";
import {
  planLaunch, runSteps, words, branchOf, worktreeOf, worktreePath, checkoutIndex, installedHarnesses, usablePresets, applyPreset,
  cyclePreset, prefillOf, withoutEnter,
} from "./lib/launch.js";

// Two field triggers per row inside the dialog's 22px side padding (640 - 44 = 596 = 2 * 293 + 10).
const FIELD_W = 293;
const LEGEND = "Enter launch · Shift+Enter new line · Shift+Tab presets";
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function place(s, all) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return all.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder || null;
}

// Detached work outlives the box (owner: null), so it must not touch a closed view.
const alive = (cx) => { try { cx.notify(); } catch {} };

export class Launch {
  init(cx) {
    this.from = props()?.role === "launch" ? "board" : "terminal";
    this.handle = cx.focus_handle();
    this.ready = false;
    this.busy = null;
    this.error = "";
    this.repos = projectList(shared(STORE) ?? {});
    this.settings = mergeSettings(shared(SETTINGS));
    this.r = 0;
    this.lists = {};
    this.plain = {};
    this.checkout = null;
    this.ids = [];
    this.harness = null;
    this.model = null;
    this.effort = null;
    this.presets = [];
    this.preset = null;
    this.newWt = props()?.prefill && "harness" in props().prefill ? Boolean(props().prefill.newWorktree) : this.settings.newWorktree;
    this.typed = null;
    this.auto = "";
    this.random = props()?.prefill?.branch || branchName("");
    this.inBranch = false;
    this.picker = null;
    this.dd = null; // the open field dropdown: { key: "repo" | "checkout" | "harness" | "preset", hi }
    this.taskFocus = true;
    this.before = "";
    this.now = "";

    this.task = TextareaState.new({ placeholder: "What should the agent do? Leave empty to start it without a task." });
    this.task.set_auto_grow(4, 10);
    this.task.on("focus", (_e, cx) => { this.taskFocus = true; cx.notify(); });
    this.task.on("blur", (_e, cx) => { this.taskFocus = false; cx.notify(); });
    this.task.on("change", (_e, cx) => {
      this.before = this.now;
      this.now = this.task.value();
      this.error = "";
      this.syncBranch();
      cx.notify();
    });
    this.task.on("submit", (e, cx) => { if (!e.shift) this.go(cx); });
    this.branch = InputState.new({ placeholder: "branch" });
    this.branch.on("change", (_e, cx) => {
      const v = this.branch.value();
      this.typed = v === this.auto ? null : v;
      this.error = "";
      cx.notify();
    });
    this.branch.on("submit", (_e, cx) => { this.task.focus(); cx.notify(); });
    this.branch.on("focus", (_e, cx) => { this.inBranch = true; cx.notify(); });
    this.branch.on("blur", (_e, cx) => { this.inBranch = false; cx.notify(); });

    if (this.newWt) this.syncBranch();
    const seed = props()?.prefill?.task;
    if (seed) { this.now = seed; this.task.set_value(seed); }
    this.task.focus();
    cx.timer.after(600, () => { if (!this.picker && !this.inBranch) this.task.focus(); });
    cx.spawn(async (cx) => {
      try { await this.load(); } catch (error) { this.error = String(error); }
      this.ready = true;
      cx.notify();
    });
  }

  async load() {
    const [known, text] = await Promise.all([knownAgents({}).catch(() => []), readPresetFile()]);
    this.ids = installedHarnesses(known);
    this.presets = usablePresets(readPresets(text), this.ids);
    const pf = prefillOf(props()?.prefill, this.ids);
    const cwd = focused()?.cwd ?? null, want = shared(REPO);
    const at = (pred) => this.repos.findIndex(pred);
    // Worktrees live beside their repo, not inside it, so git's common dir names the repo.
    const folder = pf?.checkout || (this.from === "terminal" ? cwd : null);
    const common = folder ? await commonDirOf(exec, folder) : null;
    const hit = common?.code === 0 ? resolveAdd(shared(STORE), common.stdout.trim()).existing : null;
    const byRoot = pf?.root ? at((p) => p.root === pf.root) : -1;
    const byGit = hit ? at((p) => p.root === hit.root) : -1;
    const byPrefill = pf?.checkout ? at((p) => inside(pf.checkout, p.root)) : -1;
    const byCwd = this.from === "terminal" && cwd ? at((p) => inside(cwd, p.root)) : -1;
    this.r = Math.max(0, [byRoot, byGit, byPrefill, byCwd, at((p) => p.root === want)].find((i) => i >= 0) ?? 0);
    await this.ensureList();
    const list = this.list();
    const i = checkoutIndex(pf?.checkout, list) >= 0 ? checkoutIndex(pf.checkout, list) : checkoutIndex(cwd, list);
    this.checkout = list[Math.max(0, i)]?.path ?? null;
    this.harness = pf?.harness ?? defaultHarness(this.settings, this.ids);
    if (!pf?.harness) Object.assign(this, harnessChoice(this.settings, this.harness));
    if (pf?.harness) {
      this.model = pf.model;
      this.effort = pf.effort;
      this.preset = this.presets.find((p) => p.name === pf.preset) ?? null;
    }
  }

  repo() { return this.repos[this.r] ?? null; }
  // A folder git cannot list worktrees for is a plain folder: no worktrees, no branch.
  git() { const r = this.repo(); return !r || !this.plain[r.root]; }
  wt() { return this.newWt && this.git(); }
  list() { const r = this.repo(); return r ? this.lists[r.root] ?? [{ path: r.root, branch: null }] : []; }
  close() { closeOverlay(props()?.overlay); }

  async ensureList() {
    const r = this.repo();
    if (!r || this.lists[r.root]) return;
    const list = await listCheckouts(exec, r.root);
    this.plain[r.root] = !list;
    this.lists[r.root] = list ?? [{ path: r.root, branch: null }];
  }

  effective() { return branchOf(this.typed, this.now, this.random); }

  syncBranch() {
    if (this.typed !== null) return;
    const next = this.effective();
    if (next !== this.auto) { this.auto = next; this.branch.set_value(next); }
  }

  setRepo(i) {
    this.r = i;
    this.checkout = this.list()[0]?.path ?? null;
  }

  cycle(what, dir, cx) {
    if (this.busy) return;
    if (what === "repo" && this.repos.length) {
      this.setRepo((this.r + dir + this.repos.length) % this.repos.length);
      cx.spawn(async (cx) => {
        await this.ensureList();
        this.checkout = this.list()[0]?.path ?? null;
        cx.notify();
      });
    } else if (what === "checkout") {
      const list = this.list();
      if (list.length) this.checkout = cycleOf(list.map((c) => c.path), this.checkout, dir);
      this.newWt = false;
    } else if (what === "harness" && this.ids.length) {
      this.setHarness(cycleOf(this.ids, this.harness, dir));
    } else if (what === "preset") {
      this.preset = cyclePreset(this.presets, this.preset?.name, dir);
      if (this.preset) Object.assign(this, applyPreset(this.preset));
    } else if (what === "worktree") {
      if (!this.git()) { cx.notify(); return; }
      this.newWt = !this.newWt;
      this.syncBranch();
      if (this.newWt) this.branch.focus(); else this.task.focus();
    }
    this.error = "";
    cx.notify();
  }

  // Field dropdowns. Items per key; the trigger shows the current one.
  ddItems(key) {
    const r = this.repo(), none = (label) => [{ value: null, label }];
    if (key === "repo") return this.repos.length ? this.repos.map((p) => ({ value: p.root, label: p.name })) : none(this.ready ? "No project" : "Loading…");
    if (key === "checkout") {
      const own = this.list().map((c) => ({ value: c.path, label: c.branch ?? (c.path === r?.root ? "main checkout" : c.path.split("/").pop()) }));
      return this.wt() ? [{ value: "@new", label: `New: ${this.effective()}` }, ...own] : own;
    }
    if (key === "harness") {
      const tail = [this.model, this.effort].filter(Boolean).join(" · ");
      return this.ids.length ? this.ids.map((id) => ({ value: id, label: HARNESSES[id].label + (id === this.harness && tail ? ` · ${tail}` : ""), icon: agentIcon(id) })) : none(this.ready ? "None installed" : "Loading…");
    }
    return [{ value: null, label: "Default" }, ...this.presets.map((p) => ({ value: p.name, label: p.name }))];
  }

  ddValue(key) {
    if (key === "repo") return this.repo()?.root ?? null;
    if (key === "checkout") return this.wt() ? "@new" : this.checkout;
    if (key === "harness") return this.harness;
    return this.preset?.name ?? null;
  }

  openDd(key, cx) {
    if (this.busy) return;
    if (this.dd?.key === key) return this.closeDd(key, cx);
    this.dd = { key, hi: Math.max(0, this.ddItems(key).findIndex((i) => i.value === this.ddValue(key))) };
    this.handle.focus();
    cx.notify();
  }

  closeDd(key, cx) {
    if (!this.dd || (key != null && this.dd.key !== key)) return;
    this.dd = null;
    if (!this.inBranch) this.task.focus();
    cx.notify();
  }

  pickDd(key, value, cx) {
    this.dd = null;
    if (key === "repo") {
      const i = this.repos.findIndex((p) => p.root === value);
      if (i >= 0 && i !== this.r) this.cycle("repo", i - this.r, cx);
    } else if (key === "checkout") {
      if (value && value !== "@new") { this.checkout = value; this.newWt = false; }
    } else if (key === "harness") {
      if (value) this.setHarness(value);
    } else {
      this.preset = this.presets.find((p) => p.name === value) ?? null;
      if (this.preset) Object.assign(this, applyPreset(this.preset));
    }
    this.error = "";
    this.task.focus();
    cx.notify();
  }

  ddKey(k, cx) {
    const { key, hi } = this.dd, items = this.ddItems(key);
    if (k === "escape") this.closeDd(null, cx);
    else if (k === "down") this.dd = { key, hi: (hi + 1) % items.length };
    else if (k === "up") this.dd = { key, hi: (hi - 1 + items.length) % items.length };
    else if (k === "enter" || k === "space") this.pickDd(key, items[hi].value, cx);
  }

  setHarness(id) {
    if (id === this.harness) return;
    this.harness = id;
    Object.assign(this, harnessChoice(this.settings, id));
    if (this.preset && applyPreset(this.preset).harness !== id) this.preset = null;
  }

  stepsOf() {
    const h = HARNESSES[this.harness];
    return ["harness", ...(h?.models.length ? ["model"] : []), ...(h?.efforts.length ? ["effort"] : [])];
  }

  rows(step) {
    const h = HARNESSES[this.harness];
    if (step === "harness") return this.ids.map((id) => ({ value: id, label: HARNESSES[id].label, hint: id === this.harness ? [this.model, this.effort].filter(Boolean).join(" · ") || "default" : "" }));
    return [{ value: null, label: "default" }, ...(step === "model" ? h.models : h.efforts).map((v) => ({ value: v, label: v }))];
  }

  openPicker(cx) {
    if (!this.ids.length || this.busy) return;
    this.dd = null;
    this.picker = { step: "harness", i: Math.max(0, this.ids.indexOf(this.harness)) };
    this.handle.focus();
    cx.notify();
  }

  closePicker(cx) {
    this.picker = null;
    this.task.focus();
    cx.notify();
  }

  pick(i, cx) {
    const { step } = this.picker, row = this.rows(step)[i];
    if (!row) return;
    if (step === "harness") this.setHarness(row.value);
    else if (step === "model") this.model = row.value;
    else this.effort = row.value;
    const steps = this.stepsOf(), next = steps[steps.indexOf(step) + 1];
    if (!next) return this.closePicker(cx);
    const cur = next === "model" ? this.model : this.effort;
    this.picker = { step: next, i: Math.max(0, this.rows(next).findIndex((r) => r.value === cur)) };
    cx.notify();
  }

  back(cx) {
    const steps = this.stepsOf(), prev = steps[steps.indexOf(this.picker.step) - 1];
    if (!prev) return this.closePicker(cx);
    this.picker = { step: prev, i: Math.max(0, this.rows(prev).findIndex((r) => r.value === (prev === "harness" ? this.harness : this.model))) };
    cx.notify();
  }

  key(e, cx) {
    const m = e.modifiers ?? {}, k = e.key;
    if (this.busy) { if (k === "escape") cx.stop_propagation(); return; }
    if (this.dd) {
      this.ddKey(k, cx);
      cx.stop_propagation();
      cx.notify();
      return;
    }
    if (this.picker) {
      const n = this.rows(this.picker.step).length;
      if (k === "escape") this.closePicker(cx);
      else if (k === "down" || k === "up") this.picker = { ...this.picker, i: (this.picker.i + (k === "down" ? 1 : n - 1)) % n };
      else if (k === "enter" || k === "right") this.pick(this.picker.i, cx);
      else if (k === "left") this.back(cx);
      else return;
      cx.stop_propagation();
      cx.notify();
      return;
    }
    if (k === "escape") {
      if (this.inBranch) this.task.focus();
      else this.close();
      cx.stop_propagation();
    } else if (k === "tab") {
      if (m.shift) openList({ from: this.from, launch: props()?.overlay, newWorktree: this.wt(), branch: this.effective(), task: this.task.value(), checkout: this.checkout, root: this.repo()?.root });
      else this.cycle("harness", 1, cx);
      cx.stop_propagation();
    } else if (m.control && !m.platform && !m.alt) {
      const what = { p: "repo", t: "checkout", o: "preset", n: "worktree" }[k];
      if (what) this.cycle(what, 1, cx);
      else if (k === "b" && this.wt()) this.branch.focus();
      else if (k === "g") this.openPicker(cx);
      else return;
      cx.stop_propagation();
    }
  }

  go(cx) {
    if (this.busy || !this.ready) return;
    const repo = this.repo();
    if (!repo) { this.error = "Add a project first."; cx.notify(); return; }
    if (!this.harness) { this.error = "No supported agent is installed."; cx.notify(); return; }
    const now = this.task.value(), task = withoutEnter(this.now === now ? this.before : this.now, now);
    this.busy = "Launching…";
    cx.notify();
    // owner: null, so closing the box (Cmd+K again) does not cancel the launch half way.
    cx.spawn(async (cx) => {
      let terminal = null;
      try { terminal = await this.start(repo, task, cx); } catch (error) { this.error = words(error); }
      this.busy = null;
      if (this.error) { alive(cx); return; }
      this.finish(terminal, cx);
    }, { owner: null });
  }

  async start(repo, task, cx) {
    await this.ensureList();
    const list = this.list(), branch = this.effective();
    const exists = this.wt() && !worktreeOf(list, branch)
      ? (await exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: repo.root }).catch(() => null))?.code === 0
      : false;
    const allPanes = panes();
    const plan = planLaunch({
      repo, checkouts: list, checkout: this.checkout, git: this.git(), newWorktree: this.newWt, branch, branchExists: exists,
      spaces: spaces().filter((s) => !s.machine).map((s) => ({ id: s.id, path: place(s, allPanes) })).filter((s) => s.path),
      harness: this.harness, model: this.model, effort: this.effort, preset: this.preset, task, from: this.from,
    });
    const r = await runSteps(plan.steps, exec, (step) => {
      this.busy = step.type === "wt" ? `Creating worktree ${branch}…` : "Launching…";
      alive(cx);
    });
    this.error = r.error;
    return r.terminal;
  }

  finish(terminal, cx) {
    try { this.close(); } catch {}
    if (this.from === "board") {
      setShared(LAUNCHED, Math.random());
      setShared(FOCUS_BOARD, Math.random());
    } else if (terminal) {
      const ask = () => run("pane.focus", { terminal });
      ask();
      for (const ms of REFOCUS_MS) cx.timer.after(ms, ask, { owner: null });
    }
  }

  pickerView(t) {
    const { step, i } = this.picker, title = { harness: "Agent", model: "Model", effort: "Effort" }[step];
    return v_flex().flex_1().min_h(0).gap(2)
      .child(h_flex().pb(6).gap(8).text_size(12.5).child(div().font_semibold().text_color(t.foreground).child(title))
        .child(div().text_color(t.dim).child("↑↓ choose · → deeper · ← back · Esc close")))
      .children(this.rows(step).map((row, n) => h_flex().id(`pick-${step}-${n}`).h(28).px(10).gap(8).items_center().rounded(6).cursor_pointer()
        .text_size(13).text_color(n === i ? t.foreground : t.muted)
        .when(n === i, (el) => el.bg(t.selected))
        .when(n !== i, (el) => el.hover((s) => s.bg(t.hover)))
        .on_click((_e, cx) => this.pick(n, cx))
        .child(div().child(row.label)).child(div().flex_1())
        .child(div().text_size(11.5).text_color(t.dim).child(row.hint ?? ""))));
  }

  render() {
    const t = theme(), r = this.repo(), busy = Boolean(this.busy);
    const branch = this.effective(), have = r ? worktreeOf(this.list(), branch) : null;
    const off = busy ? 0.5 : 1;
    const trigger = (key, label, hint) => dropdown(t, {
      id: `ln-${key}`, items: this.ddItems(key), value: this.ddValue(key), open: this.dd?.key === key, hi: this.dd?.hi ?? 0,
      width: FIELD_W, prefix: label, prefixW: 62, hint, h: 30, rounded: 7, disabled: busy,
      onToggle: (cx) => this.openDd(key, cx), onClose: (cx) => this.closeDd(key, cx), onPick: (v, cx) => this.pickDd(key, v, cx),
    });
    return v_flex().id("launch").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .size_full().px(22).pt(20).pb(16).gap(14).bg(t.popover).text_color(t.foreground).text_size(13)
      .child(dialogTitle(t, "New session"))
      .when(Boolean(this.picker), (el) => el.child(this.pickerView(t)))
      .when(!this.picker, (el) => el
        .child(v_flex().gap(8).flex_none()
          .child(h_flex().gap(10).child(trigger("repo", "Project", "^P")).child(trigger("checkout", "Checkout", "^T")))
          .child(h_flex().gap(10).child(trigger("harness", "Agent", "Tab")).child(trigger("preset", "Preset", "^O"))))
        .child(textCard(t, Textarea.new(this.task), this.taskFocus).opacity(off).disabled(busy))
        .child(v_flex().gap(2).flex_none().opacity(off)
          .child(worktreeRow(t, {
            id: "ln-wt", on: this.wt(), disabled: !this.git(), note: "Not a git repo", hint: "^N",
            onToggle: (cx) => this.cycle("worktree", 1, cx),
            branch: this.wt() ? inputBox(t, Input.new(this.branch), this.inBranch).w_full().disabled(busy) : null,
          }))
          .when(this.wt(), (el) => el.child(div().pl(54).truncate().text_size(11.5).text_color(t.dim)
            .child(have ? "Existing worktree" : r ? tilde(worktreePath(r.root, branch), home()) : "")))))
      .when(Boolean(this.error), (el) => el.child(div().text_size(12).text_color(t.blocked).child(this.error)))
      .child(div().flex_1())
      .child(h_flex().gap(8).items_center().flex_none()
        .child(h_flex().flex_1().min_w(0).gap(8).items_center().text_size(11.5).text_color(t.dim)
          .when(busy || !this.ready, (el) => el.child(div().frames(SPINNER, 90)))
          .child(div().truncate().child(this.busy ?? LEGEND)))
        .child(button(t, "ln-cancel", "Cancel", "plain", () => { if (!this.busy) this.close(); }))
        .child(button(t, "ln-go", busy ? "Launching…" : "Launch", "primary", (_e, cx) => this.go(cx))));
  }
}
