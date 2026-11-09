import { div, svg } from "gpui-kit";
import { h_flex, v_flex, Switch, Select, Popup } from "gpui-base";
import { closeOverlay, exec } from "herdr";

const BUTTON = {
  plain: (t) => [t.input, t.raised, t.foreground],
  primary: (t) => [t.solid, t.solid, t.solid_foreground],
  danger: (t) => [t.blocked, t.blocked, t.background],
};

export function button(t, id, text, kind, action) {
  const [line, bg, color] = BUTTON[kind](t);
  return h_flex().id(id).h(32).px(14).flex_none().items_center().rounded(8)
    .border_1().border_color(line).bg(bg).text_color(color).text_size(12.5).font_medium().cursor_pointer()
    .hover((s) => s.opacity(0.88)).on_click(action).child(text);
}

export const dialogTitle = (t, text) => h_flex().items_center()
  .child(div().flex_1().text_size(15).font_semibold().child(text))
  .child(div().text_size(11).text_color(t.dim).child("Esc"));

export function escapeKey(e, cx, overlay) {
  if (e.key !== "escape") return false;
  closeOverlay(overlay);
  cx.stop_propagation();
  return true;
}

export const keyHint = (t, key) => div().px(4).border_1().border_color(t.selected).rounded(3).text_size(10).text_color(t.dim).child(key);

export const chip = (t, id, value, key, color, action, stop = false) => h_flex().id(id).gap(6).items_center().cursor_pointer().text_size(12.5)
  .when(stop, (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation()))
  .on_click((_e, cx) => { action(cx); cx.notify(); })
  .child(div().max_w(190).truncate().font_semibold().text_color(color).child(value))
  .when(Boolean(key), (el) => el.child(keyHint(t, key)));

export const worktreeToggle = (t, id, on, key, action, center = true) => h_flex().id(id).gap(6)
  .when(center, (el) => el.items_center()).cursor_pointer()
  .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
  .on_click(action)
  .child(div().text_color(on ? t.working : t.muted).child(on ? "[x] new worktree" : "[ ] new worktree"))
  .child(div().text_size(10).text_color(t.dim).child(key));

export const doCmd = (name, args) => exec("herdr-app", ["do", name, JSON.stringify(args)]).catch((e) => ({ code: 1, stderr: String(e) }));

// Desktop controls for dialogs. Each is stateless: the caller owns the value (and, for a
// dropdown, the open state and highlighted item) and passes handlers.

export const agentIcon = (id) => `icons/${id}.svg`;
const CHEVRON = "mods/workspace-chrome/chevron-down.svg";
const CHECK = "mods/workspace-chrome/check.svg";

// A pill switch: gpui-base Switch for the semantics, a knob that slides when it flips.
export const switchControl = (t, id, on, onChange) => Switch.new(id).checked(on)
  .on_change((value, cx) => onChange(value, cx))
  .relative().w(34).h(20).flex_none().rounded(10).border_1().cursor_pointer()
  .border_color(on ? t.accent : t.input).bg(on ? t.accent : t.background)
  .child(div().id(`${id}-knob`).absolute().top(2).left(on ? 16 : 2).w(14).h(14).rounded(7)
    .bg(on ? t.foreground : t.muted).shadow_sm()
    .transition("left", { duration: 120, easing: "ease-out" }));

// A segmented control. options: [{ value, label, icon? }].
export const segmented = (t, id, options, current, pick) => h_flex().flex_none().gap(2).p(2).rounded(8)
  .border_1().border_color(t.border).bg(t.background)
  .children(options.map((o) => {
    const on = o.value === current;
    return h_flex().id(`${id}-${o.value}`).h(24).px(10).gap(6).items_center().rounded(6).border_1().cursor_pointer()
      .text_size(12).text_color(on ? t.foreground : t.muted)
      .border_color(on ? t.input : t.background).bg(on ? t.selected : t.background)
      .when(!on, (el) => el.hover((s) => s.bg(t.hover).border_color(t.hover)))
      .on_click((_e, cx) => { pick(o.value, cx); cx.notify(); })
      .when(Boolean(o.icon), (el) => el.child(svg(o.icon).size(13).flex_none().text_color(on ? t.foreground : t.muted)))
      .child(o.label);
  }));

// A dropdown: Select + Popup. o: { id, items: [{ value, label, icon? }], value, open, hi,
// width, prefix?, prefixW?, hint? (a key hint at the right), h? (28), rounded? (6),
// disabled?, onToggle(cx), onClose(cx), onPick(value, cx) }. The caller moves `hi` with
// the keyboard; a press outside reports through onClose.
export function dropdown(t, o) {
  const cur = o.items.find((i) => i.value === o.value) ?? o.items[0];
  const dim = o.disabled || cur?.value == null;
  const trigger = h_flex().id(`${o.id}-t`).w(o.width).h(o.h ?? 28).px(10).gap(7).items_center().flex_none().rounded(o.rounded ?? 6)
    .border_1().border_color(o.open ? t.accent : t.input).bg(t.background).text_size(12.5)
    .when(o.disabled, (el) => el.opacity(0.5).cursor_default())
    .when(!o.disabled, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => { o.onToggle(cx); cx.notify(); }))
    .when(Boolean(o.prefix), (el) => el.child(div().text_size(11).text_color(t.dim).flex_none()
      .when(Boolean(o.prefixW), (e) => e.w(o.prefixW)).child(o.prefix)))
    .when(Boolean(cur?.icon), (el) => el.child(svg(cur.icon).size(14).flex_none().text_color(t.foreground)))
    .child(div().flex_1().min_w(0).truncate().text_color(dim ? t.muted : t.foreground).child(cur?.label ?? ""))
    .when(Boolean(o.hint), (el) => el.child(keyHint(t, o.hint)))
    .child(svg(CHEVRON).size(12).flex_none().text_color(t.dim));
  const list = v_flex().id(`${o.id}-l`).min_w(o.width).max_w(280).p(4).gap(1).rounded(8)
    .border_1().border_color(t.input).bg(t.raised).shadow_md().role("list_box")
    .children(o.items.map((it, i) => {
      const on = it.value === o.value;
      return h_flex().id(`${o.id}-o${i}`).h(28).px(8).gap(8).items_center().flex_none().rounded(5).cursor_pointer()
        .text_size(12.5).role("list_box_option").aria_selected(on)
        .when(i === o.hi, (el) => el.bg(t.selected).aria_active_descendant())
        .when(i !== o.hi, (el) => el.hover((s) => s.bg(t.hover)))
        .on_click((_e, cx) => { o.onPick(it.value, cx); cx.notify(); })
        .when(Boolean(it.icon), (el) => el.child(svg(it.icon).size(14).flex_none().text_color(t.foreground)))
        .child(div().flex_1().min_w(0).truncate().text_color(it.value == null ? t.muted : t.foreground).child(it.label))
        .child(on ? svg(CHECK).size(12).flex_none().text_color(t.accent) : div().w(12).flex_none());
    }));
  return Select.new(`${o.id}-s`).flex_none().open(Boolean(o.open))
    .on_open_change((open, cx) => { if (!open) { o.onClose(cx); cx.notify(); } })
    .child(Popup.new(`${o.id}-p`, trigger).anchor("top_left").when(o.open && !o.disabled, (el) => el.content(list)));
}

// Text-field looks shared by the box dialogs. Apply to an Input or Textarea element.
export const inputBox = (t, el, focused) => el.h(30).px(10).rounded(7).border_1()
  .border_color(focused ? t.accent : t.input).bg(t.background).text_size(12.5);

export const textCard = (t, el, focused) => el.w_full().px(12).py(10).rounded(10).border_1()
  .border_color(focused ? t.accent : t.input).bg(t.background).text_color(t.foreground).text_size(13);

// The "New worktree" row: a switch, its label and key hint, then either a dim note (when
// the switch is disabled) or, when on, the branch input element passed as o.branch.
// o: { id, on, disabled?, note?, hint?, onToggle(cx), branch? }
export const worktreeRow = (t, o) => h_flex().id(o.id).h(34).gap(10).items_center().flex_none()
  .child(switchControl(t, `${o.id}-sw`, o.on, (value, cx) => { if (value !== o.on) o.onToggle(cx); })
    .when(o.disabled, (el) => el.disabled(true).opacity(0.4)))
  .child(div().id(`${o.id}-lb`).flex_none().text_size(13).text_color(o.disabled ? t.dim : t.foreground)
    .when(!o.disabled, (el) => el.cursor_pointer().on_click((_e, cx) => { o.onToggle(cx); cx.notify(); }))
    .child("New worktree"))
  .when(Boolean(o.hint) && !o.disabled, (el) => el.child(keyHint(t, o.hint)))
  .when(Boolean(o.disabled && o.note), (el) => el.child(div().text_size(11.5).text_color(t.dim).child(o.note)))
  .when(Boolean(o.on && o.branch), (el) => el.child(div().flex_1().min_w(0).child(o.branch)));
