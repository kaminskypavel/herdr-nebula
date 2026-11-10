// The delete confirm. It names the session (title, worktree, status). When this was the
// last session in a linked worktree it also lists the uncommitted files and the unpushed
// commits and offers to remove the worktree, off by default. Delete ends the agent's
// terminal (and its tab when the agent was alone in it); a failed removal keeps the
// worktree and shows what `wt` said.
// props: { title, worktree, status, terminal, tab, alone, offer: { root, path, branch } | null }.
// With worktreeOnly (the board's `d` on a worktree with no session) there is no session to end:
// the same check runs, the removal starts ticked, and Delete runs `wt remove` alone.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, theme, exec } from "herdr";
import { planDelete, planRemove, removeLabel, summarizeCheck, settleRemove, forceCount, recheckRemove } from "./lib/actions.js";
import { WT_TIMEOUT } from "./lib/launch.js";
import { button, dialogTitle, escapeKey, doCmd } from "./ui.js";
import { fs } from "./lib/scale.js";

const SHOWN = 6;
// The dialog may be closed while the work runs; a redraw of a closed view throws.
const poke = (cx) => {
  try {
    cx.notify();
  } catch {
    /* view closed */
  }
};

export class Confirm {
  init(cx) {
    this.check = summarizeCheck(null, null);
    this.files = [];
    this.unpushed = [];
    this.killed = Boolean(props()?.worktreeOnly); // no session to end
    this.loaded = !props()?.offer;
    this.remove = Boolean(props()?.worktreeOnly); // settled by the check below: only a known-clean worktree stays ticked
    this.busy = false;
    this.deleted = false;
    this.error = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(300, () => this.handle.focus());
    const offer = props()?.offer;
    if (offer)
      cx.spawn(async (cx) => {
        const [st, lg] = await Promise.all([
          exec("git", ["status", "--short"], { cwd: offer.path }).catch(() => null),
          exec("git", ["log", "HEAD", "--not", "--remotes", "--oneline"], { cwd: offer.path }).catch(() => null),
        ]);
        this.check = summarizeCheck(st, lg);
        this.files = this.check.files;
        this.unpushed = this.check.unpushed;
        this.loaded = true;
        this.remove = settleRemove(this.remove, this.check);
        cx.notify();
      });
  }

  submit(cx) {
    const p = props() ?? {};
    if (this.busy || this.deleted) return;
    if (this.remove && p.offer && !this.loaded) return;
    if (p.worktreeOnly && !this.remove) return;
    this.busy = true;
    this.error = null;
    cx.notify();
    // Owner null: closing the dialog must not cancel the work between terminal.kill and wt remove.
    cx.spawn(
      async (cx) => {
        if (!this.killed) {
          for (const step of planDelete(p)) {
            const r = await doCmd(step.name, step.args);
            // The tab may already be gone once its terminal ended.
            if (r.code !== 0 && step.name === "terminal.kill") {
              this.busy = false;
              this.error = (r.stderr || r.stdout || "Could not end the session.").trim();
              poke(cx);
              return;
            }
          }
          this.killed = true;
        }
        let dirty = 0;
        if (this.remove && p.offer) {
          // The agent can no longer write: re-read the tree before any -f.
          const st = await exec("git", ["status", "--short"], { cwd: p.offer.path }).catch(() => null);
          const re = recheckRemove(this.check, st);
          if (re.changed) {
            this.check = { ...this.check, files: re.files, filesOk: true };
            this.files = re.files;
            this.busy = false;
            this.error = "The worktree changed. Check the list and press Enter again.";
            poke(cx);
            return;
          }
          dirty = re.dirty;
        }
        this.deleted = !p.worktreeOnly; // a failed removal can be tried again when it is the only thing asked
        if (this.remove && p.offer) {
          const plan = planRemove(p.offer, dirty);
          const r = await exec(plan.cmd, plan.args, { timeout: WT_TIMEOUT }).catch((e) => ({ code: 1, stderr: String(e) }));
          if (r.code !== 0) {
            this.busy = false;
            this.error = (r.stderr || r.stdout || "wt could not remove the worktree.").trim();
            poke(cx);
            return;
          }
        }
        try {
          closeOverlay(p.overlay);
        } catch {
          /* already closed */
        }
      },
      { owner: null },
    );
  }

  list(t, title, lines, color) {
    return v_flex()
      .gap(2)
      .child(div().text_size(fs(12)).text_color(t.muted).child(title))
      .children(lines.slice(0, SHOWN).map((l) => div().min_w(0).truncate().text_size(fs(12)).text_color(color).child(l)))
      .when(lines.length > SHOWN, (el) =>
        el.child(
          div()
            .text_size(fs(12))
            .text_color(t.muted)
            .child(`+${lines.length - SHOWN} more`),
        ),
      );
  }

  render() {
    const t = theme(),
      p = props() ?? {},
      overlay = p.overlay;
    const toggle = () => {
      if (!this.busy && !this.deleted && this.loaded) this.remove = !this.remove;
    };
    return v_flex()
      .id("confirm")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (escapeKey(e, cx, overlay)) return;
        if (e.key === "enter") this.submit(cx);
        else if (e.key === "space" && p.offer) {
          toggle();
          cx.notify();
        }
      })
      .w_full()
      .min_h(0)
      .p(20)
      .gap(14)
      .bg(t.popover)
      .text_color(t.foreground)
      .child(dialogTitle(t, p.worktreeOnly ? "Delete this worktree?" : this.deleted ? "Session deleted" : "Delete this session?"))
      .child(
        v_flex()
          .gap(3)
          .child(div().min_w(0).truncate().text_size(fs(13)).font_medium().child(p.title))
          .child(div().min_w(0).truncate().text_size(fs(12)).text_color(t.muted).child([p.worktree, p.status].filter(Boolean).join(" · ")))
          .child(
            div()
              .text_size(fs(12))
              .text_color(t.muted)
              .child(p.worktreeOnly ? "Nothing is running in it." : p.alone ? "Ends the agent and closes its tab." : "Ends the agent."),
          ),
      )
      .when(Boolean(p.offer), (el) =>
        el
          .child(div().h(1).bg(t.border))
          .child(
            div()
              .text_size(fs(12))
              .text_color(t.muted)
              .child(p.worktreeOnly ? `Removes the worktree ${p.offer.branch}.` : `This is the last session in the worktree ${p.offer.branch}.`),
          )
          .when(!this.loaded, (e) => e.child(div().text_size(fs(12)).text_color(t.muted).child("Checking the worktree…")))
          .when(this.files.length > 0, (e) => e.child(this.list(t, `${this.files.length} uncommitted`, this.files, t.working)))
          .when(this.unpushed.length > 0, (e) =>
            e.child(this.list(t, `${this.unpushed.length} unpushed commit${this.unpushed.length === 1 ? "" : "s"}`, this.unpushed, t.working)),
          )
          .when(this.loaded && !this.check.known, (e) =>
            e.child(div().text_size(fs(12)).text_color(t.working).child("Could not check the worktree. Removing will not discard anything.")),
          )
          .when(this.check.known && this.files.length === 0 && this.unpushed.length === 0, (e) =>
            e.child(div().text_size(fs(12)).text_color(t.muted).child("Clean, nothing unpushed.")),
          )
          .child(
            h_flex()
              .id("cf-remove")
              .gap(8)
              .items_center()
              .cursor_pointer()
              .on_click((_e, cx) => {
                toggle();
                cx.notify();
              })
              .child(
                div()
                  .size(16)
                  .flex_none()
                  .flex()
                  .items_center()
                  .justify_center()
                  .rounded(4)
                  .border_1()
                  .border_color(this.remove ? t.blocked : t.input)
                  .text_size(fs(11))
                  .text_color(t.blocked)
                  .child(this.remove ? "✓" : ""),
              )
              .child(
                div()
                  .text_size(fs(12))
                  .text_color(this.remove ? t.blocked : t.foreground)
                  .child(removeLabel(forceCount(this.check))),
              ),
          ),
      )
      .when(Boolean(this.error), (el) =>
        el.child(
          v_flex()
            .gap(3)
            .when(this.deleted && !p.worktreeOnly, (e) =>
              e.child(div().text_size(fs(12)).text_color(t.muted).child("The session is gone. The worktree was kept.")),
            )
            .child(div().text_size(fs(12)).text_color(t.blocked).child(this.error)),
        ),
      )
      .child(
        h_flex()
          .pt(4)
          .gap(8)
          .justify_end()
          .child(button(t, "cf-cancel", this.deleted ? "Close" : "Cancel", "plain", () => closeOverlay(overlay)))
          .when(!this.deleted, (el) => el.child(button(t, "cf-delete", this.busy ? "Deleting…" : "Delete", "danger", (_e, cx) => this.submit(cx)))),
      );
  }
}
