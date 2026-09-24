// THE TOGGLETIP (2026-09-24, Josh: "it would be nice if it would pop out like
// a box … something UX proven and nice"). The pattern is Heydon Pickering's
// toggletip from Inclusive Components: a button that opens a note on click or
// tap — never hover, which a phone does not have — with the note drawn as a box
// whose caret points back at the button that opened it.
//
// The box sits IN THE FLOW, directly under its label, and pushes the field
// down rather than floating over it: a floating bubble has to be positioned
// against the viewport, and on a phone it covers the very input it explains.
//
// One open at a time; Esc, a click anywhere else, or the i again closes it.
// The note keeps its id and stays in the field's aria-describedby, so a screen
// reader hears it whether or not the box is open.

const OPEN = '[data-infotip][aria-expanded="true"]';

function noteOf(button: Element): HTMLElement | null {
  const id = button.getAttribute("aria-controls");
  return id ? document.getElementById(id) : null;
}

/** Aims the note's caret at the middle of its button. Call after the note is visible. */
export function placeInfoTip(button: Element, note: HTMLElement): void {
  const b = button.getBoundingClientRect();
  const n = note.getBoundingClientRect();
  if (n.width === 0) return;
  const x = Math.min(Math.max(b.left + b.width / 2 - n.left, 12), n.width - 12);
  note.style.setProperty("--infotip-caret", `${Math.round(x)}px`);
}

function setOpen(button: Element, open: boolean): void {
  button.setAttribute("aria-expanded", String(open));
  const note = noteOf(button);
  if (!note) return;
  note.hidden = !open;
  if (open) placeInfoTip(button, note);
}

function closeAll(except?: Element): void {
  document.querySelectorAll(OPEN).forEach((b) => {
    if (b !== except) setOpen(b, false);
  });
}

let installed = false;

/**
 * ONE set of document listeners for every tip on the page, including the ones
 * in gallery rows that are re-cloned on every upload — binding per button
 * would lose them on each re-render. Idempotent: the component's script runs
 * once per page load, but ClientRouter keeps the document.
 */
export function installInfoTips(): void {
  if (installed) return;
  installed = true;

  document.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const button = target?.closest("[data-infotip]");
    if (button) {
      const open = button.getAttribute("aria-expanded") !== "true";
      closeAll(button);
      setOpen(button, open);
      return;
    }
    // A click inside the open box leaves it open, so its text can be selected.
    if (target?.closest(".field-note[data-tip]")) return;
    closeAll();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const button = document.querySelector<HTMLElement>(OPEN);
    if (!button) return;
    const active = document.activeElement;
    setOpen(button, false);
    // Focus goes back to the i only when it was on the i (or nowhere): Esc
    // pressed while typing in another field must not pull the cursor out.
    if (!active || active === document.body || active === button) button.focus();
  });

  window.addEventListener("resize", () => {
    const button = document.querySelector(OPEN);
    const note = button && noteOf(button);
    if (button && note && !note.hidden) placeInfoTip(button, note);
  });
}
