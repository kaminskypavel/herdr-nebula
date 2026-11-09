// Where the keyboard is, as the rail sees it. Three states: FOLDED (the board is
// hidden, the terminal has the keys), TERMINAL (the board is shown, the terminal has
// the keys) and BOARD (the board is shown and has the keys). `step` takes an event and
// answers the next state plus one thing for the caller to do:
//   show-board      show the board and give it the keys
//   focus-board     give the shown board the keys (a launch pulls them away, so the
//                   caller asks again after a short delay)
//   fold            hide the board and give the terminal the keys
//   focus-terminal  give the terminal the keys
//   null            nothing; Herdr or the user already did it
// Events: chord (the focus key), enter (Enter on a row), launch, rowClick,
// terminalClick, keys { board } (the board's own report of whether it has the keys),
// visible { shown } (Herdr showed or hid the board outside the chord).
// No herdr imports, so node can test it.

export const FOLDED = "folded";
export const TERMINAL = "terminal";
export const BOARD = "board";

// Herdr can take the keyboard back for a moment after a pane focus or launch, so a focus is asked for again after each of these delays (ms).
export const REFOCUS_MS = [300, 900];

const to = (state, act = null) => ({ state, act });

export function step(state, ev) {
  switch (ev.type) {
    case "chord":
      if (state === FOLDED) return to(BOARD, "show-board");
      if (state === TERMINAL) return to(BOARD, "focus-board");
      return to(FOLDED, "fold");
    case "enter":
      return state === BOARD ? to(TERMINAL, "focus-terminal") : to(state);
    case "launch":
      return state === BOARD ? to(BOARD, "focus-board") : to(state);
    case "rowClick":
      return state === TERMINAL ? to(BOARD, "focus-board") : to(state);
    case "terminalClick":
      return state === BOARD ? to(TERMINAL) : to(state);
    case "keys":
      if (state === FOLDED) return to(state);
      return to(ev.board ? BOARD : state === BOARD ? TERMINAL : state);
    case "visible":
      if (!ev.shown) return to(FOLDED);
      return to(state === FOLDED ? TERMINAL : state);
    default:
      return to(state);
  }
}
