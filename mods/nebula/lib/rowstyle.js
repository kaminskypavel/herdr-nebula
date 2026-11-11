// How a session row's state shows in its text, not only in its dot (the critique: every title was the
// same white). One pure mapping that Tree, List, Cards and Columns share. No herdr imports, so node can test it.
//
//   title   "needs" white semibold (red is its dot, bar and "needs you"), "unseen" white semibold, "seen" muted, "plain" white, "dim" (exited, archived, nebula)
//   ageText the right-hand words: "needs you" for a row that needs you, else the row's age
//   ageTone "needs" red semibold, "unseen" cyan, "plain" the view's usual age color
//   bar     "needs" for the red bar at the row's left edge, else null

const DIM = { title: "dim", ageTone: "plain", bar: null };

/** -> { title, ageText, ageTone, bar } for a board row. */
export function rowLook(row) {
  const age = row.age ?? "";
  if (row.exited || row.archived || row.kind === "nebula") return { ...DIM, ageText: age };
  switch (row.status) {
    case "needs":
      return { title: "needs", ageText: "needs you", ageTone: "needs", bar: "needs" };
    case "unseen":
      return { title: "unseen", ageText: age, ageTone: "unseen", bar: null };
    case "seen":
      return { title: "seen", ageText: age, ageTone: "plain", bar: null };
    default:
      return { title: "plain", ageText: age, ageTone: "plain", bar: null };
  }
}
