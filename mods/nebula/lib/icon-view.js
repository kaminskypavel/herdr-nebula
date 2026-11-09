// A project's icon as an element: the picture (or initials on a colored square) with an optional
// badge (the status dot) at its bottom right. Used by the board's tabs and the picker and +N lists.
// This file imports gpui, so node tests do not load it.
import { div, image } from "gpui-kit";

const RADIUS = 5;

// icon: { path, initials, color } (lib/icons.js iconFor). badge: an element or null. ring: the color around
// the badge, the background the icon sits on.
/** @param {{ icon: any, size?: number, badge?: any, ring?: any }} o */
export function projectIcon({ icon, size = 18, badge = null, ring }) {
  const face = icon.path
    ? div().size(size).rounded(RADIUS).overflow_hidden().flex_none().child(image(icon.path).size(size).rounded(RADIUS))
    : div()
        .size(size)
        .rounded(RADIUS)
        .flex_none()
        .flex()
        .items_center()
        .justify_center()
        .bg(icon.color)
        .text_size(Math.round(size * 0.45))
        .font_semibold()
        .text_color("#ffffff")
        .child(icon.initials);
  return div()
    .relative()
    .size(size)
    .flex_none()
    .child(face)
    .when(Boolean(badge), (el) =>
      el.child(div().absolute().right(-3).bottom(-3).size(10).rounded_full().bg(ring).flex().items_center().justify_center().child(badge)),
    );
}
