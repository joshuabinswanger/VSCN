// THE TOGGLETIP (2026-09-24, Josh: "it would be nice if it would pop out like
// a box … something UX proven and nice"). The pattern is Heydon Pickering's
// toggletip from Inclusive Components: a button that opens a note on click or
// tap — never hover, which a phone does not have.
//
// The box HOVERS directly under the field it explains, exactly as wide as that
// field, over whatever comes next (2026-09-24, Josh: "when you click in a field
// the help opens up beneath the field in a box that hovers over it. it should
// always have the same width as the field"). An earlier version of the same
// day sat in the flow under the label and pushed the field down.
//
// Two ways in: focusing a text field opens its tip, and the i opens it for any
// field, including the chip groups and checkboxes that have nothing to type in.
// A text field wears its i inside, at its right edge (2026-09-24, Josh: "the i
// should be in the text fields not next to the title"); the others keep theirs
// beside the title.
// One open at a time; leaving the field, Esc, a tap anywhere else, or the i
// again closes it. The note keeps its id and stays in the field's
// aria-describedby, so a screen reader hears it whether or not the box is open.
//
// "Anywhere else" is a POINTER tap, not a click (2026-09-27, Josh: "hints not
// sticky on iphone"). iOS sends a click only to an element that looks
// clickable (a control, a click handler, cursor: pointer), so a tap on the
// page's blank paper reached no click listener and the box stayed open until
// some control was tapped. Pointer events reach every element. A swipe that
// turns into a scroll is cancelled, and the box stays open and rides along
// with its field (.profile-form is its containing block, for that reason).

const OPEN = '[data-infotip][aria-expanded="true"]';
const NOTE = ".field-note[data-tip]";
/** Gap between the field's bottom edge and the box, room for the caret. */
const GAP = 7;

let observer: ResizeObserver | null = null;

function noteOf(button: Element): HTMLElement | null {
  const id = button.getAttribute("aria-controls");
  return id ? document.getElementById(id) : null;
}

function buttonOf(note: HTMLElement): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-infotip][aria-controls="${note.id}"]`);
}

/** The tip a control describes, if it has one — the field side of the pair. */
function tipOfField(field: Element | null): HTMLElement | null {
  const ids = field?.getAttribute("aria-describedby")?.split(/\s+/) ?? [];
  for (const id of ids) {
    const note = document.getElementById(id);
    if (note?.matches(NOTE)) return note;
  }
  return null;
}

/** Text entry only: a checkbox or a chip is clicked, not typed in, and opening
 *  a box on every tick would bury the form. Those get their tip from the i. */
function isTextEntry(el: Element | null): el is HTMLElement {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  return el instanceof HTMLInputElement && !/^(checkbox|radio|button|submit|reset|file|hidden|range|color)$/.test(el.type);
}

/**
 * What the box lines up with. The field whose aria-describedby names the note —
 * widened to its "https://" frame where it has one, and to the whole row for a
 * checkbox, whose own width is a square. A note no control names (the gallery's
 * cover note, the projects note) lines up with the label row of its i.
 */
function anchorOf(note: HTMLElement): HTMLElement | null {
  const field = document.querySelector<HTMLElement>(`[aria-describedby~="${note.id}"]`);
  if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) {
    return field.closest<HTMLElement>(".label-row") ?? field.closest("label") ?? field;
  }
  if (field) return field.closest<HTMLElement>(".input-prefix-wrap") ?? field;
  const button = buttonOf(note);
  return button?.closest<HTMLElement>(".label-row") ?? button?.parentElement ?? null;
}

/**
 * Puts an open note under its field, at the field's width. Measures instead of
 * trusting offsetParent: with top/left at zero the note's own rect IS its
 * containing block's origin, whichever ancestor that turns out to be.
 */
export function placeInfoTip(note: HTMLElement): void {
  const anchor = anchorOf(note);
  if (!anchor || note.hidden) return;
  const a = anchor.getBoundingClientRect();
  if (a.width === 0) return;
  // The entrance animation moves the box, and a measurement taken mid-slide
  // would be off by the slide; clearing the inline style afterwards restarts it.
  note.style.animation = "none";
  note.style.left = "0px";
  note.style.top = "0px";
  const origin = note.getBoundingClientRect();
  note.style.left = `${Math.round(a.left - origin.left)}px`;
  note.style.top = `${Math.round(a.bottom - origin.top + GAP)}px`;
  note.style.width = `${Math.round(a.width)}px`;
  // The caret points at the i — at the field's right edge when the i sits in
  // the field, under the title when it sits beside one.
  const button = buttonOf(note);
  if (button) {
    const b = button.getBoundingClientRect();
    const x = Math.min(Math.max(b.left + b.width / 2 - a.left, 9), a.width - 9);
    note.style.setProperty("--infotip-caret", `${Math.round(x)}px`);
  }
  note.style.animation = "";
}

function setOpen(note: HTMLElement, open: boolean): void {
  buttonOf(note)?.setAttribute("aria-expanded", String(open));
  note.hidden = !open;
  observer?.disconnect();
  if (!open) return;
  placeInfoTip(note);
  // A textarea that grows, or a field that reflows, carries its box along.
  const anchor = anchorOf(note);
  if (anchor && typeof ResizeObserver !== "undefined") {
    observer ??= new ResizeObserver(() => {
      const current = document.querySelector<HTMLElement>(`${NOTE}:not([hidden])`);
      if (current) placeInfoTip(current);
    });
    observer.observe(anchor);
  }
}

function closeAll(except?: HTMLElement | null): void {
  document.querySelectorAll<HTMLElement>(`${NOTE}:not([hidden])`).forEach((note) => {
    if (note !== except) setOpen(note, false);
  });
  // A button whose note went missing (a re-rendered gallery row) still says open.
  document.querySelectorAll(OPEN).forEach((b) => {
    const note = noteOf(b);
    if (!note || note.hidden) b.setAttribute("aria-expanded", "false");
  });
}

/** On the i or inside an open box: the two places a tap never closes from. */
function onTip(target: Element | null): boolean {
  return Boolean(target?.closest(`[data-infotip], ${NOTE}`));
}

/**
 * The tip a tap on `target` keeps open: the one belonging to the text field
 * tapped, or to the field whose label was tapped. Everything else is
 * "elsewhere". Not document.activeElement: on iOS a tap on blank paper leaves
 * the field focused and the keyboard up, and the box must close anyway.
 */
function tipKeptBy(target: Element | null): HTMLElement | null {
  const field =
    target?.closest("input, textarea, select") ?? target?.closest("label")?.control ?? null;
  return isTextEntry(field) ? tipOfField(field) : null;
}

declare global {
  interface Window {
    __vscnInfoTips?: boolean;
  }
}

/**
 * ONE set of document listeners for every tip on the page, including the ones
 * in gallery rows that are re-cloned on every upload — binding per button
 * would lose them on each re-render.
 *
 * The guard lives on window, not in this module (2026-09-24, Josh: "the i does
 * not expand anything"). Astro INLINES this small script into the page, once
 * per component that renders an i — eight copies on /profile, each its own
 * module with its own flag. Every copy installed a click handler, so one click
 * toggled the box eight times and it ended where it started. Opening on focus
 * survived only because opening twice is still open. ClientRouter keeps the
 * window, so the guard also holds across navigations.
 */
export function installInfoTips(): void {
  if (window.__vscnInfoTips) return;
  window.__vscnInfoTips = true;

  // Pressing the i, or inside the box, must not take focus out of the field:
  // otherwise the field's focusout closes the box a moment before the click
  // would, and on a phone the keyboard drops.
  document.addEventListener("mousedown", (event) => {
    if (onTip(event.target as Element | null)) event.preventDefault();
  });

  // The tap that is under way: whether it began on the i or in the box, and
  // which tip it keeps if it ends somewhere else ("ignore" when it began on a
  // tip, or turned into a scroll). Decided where the finger went DOWN, so a
  // text selection dragged out of the field does not count as a tap outside.
  let pointerOnTip = false;
  let tapKeeps: HTMLElement | null | "ignore" = "ignore";

  document.addEventListener("pointerdown", (event) => {
    const target = event.target as Element | null;
    pointerOnTip = onTip(target);
    tapKeeps = pointerOnTip ? "ignore" : tipKeptBy(target);
  });

  document.addEventListener("pointerup", () => {
    const keeps = tapKeeps;
    tapKeeps = "ignore";
    // pointerOnTip stays set for the focusout and click that follow, which on
    // iOS arrive a task or more later; the click clears it.
    if (keeps !== "ignore") closeAll(keeps);
  });

  document.addEventListener("pointercancel", () => {
    tapKeeps = "ignore";
    pointerOnTip = false;
  });

  document.addEventListener("focusin", (event) => {
    const field = event.target as Element | null;
    if (!isTextEntry(field)) return;
    const note = tipOfField(field);
    if (!note) return;
    closeAll(note);
    if (note.hidden) setOpen(note, true);
  });

  document.addEventListener("focusout", (event) => {
    const note = tipOfField(event.target as Element | null);
    if (!note || note.hidden) return;
    const next = event.relatedTarget as Element | null;
    if (next && (next === buttonOf(note) || note.contains(next))) return;
    // A tap on the i or the box that moved focus anyway (Safari does not
    // focus a tapped button, so relatedTarget is null): the click decides.
    if (pointerOnTip) return;
    setOpen(note, false);
  });

  // The i toggles its box, by pointer or by keyboard (Enter and Space on a
  // button arrive as a click). Closing on a tap elsewhere is pointerup's job.
  document.addEventListener("click", (event) => {
    pointerOnTip = false;
    const button = (event.target as Element | null)?.closest<HTMLElement>("[data-infotip]");
    const note = button && noteOf(button);
    if (!note) {
      // A control pressed from the keyboard (detail 0: no pointer behind it)
      // is "elsewhere" too, as a click anywhere was before pointerup took over.
      if (event.detail === 0) closeAll(tipOfField(document.activeElement));
      return;
    }
    const open = note.hidden;
    closeAll(note);
    setOpen(note, open);
  });

  document.addEventListener("keydown", (event) => {
    pointerOnTip = false;
    if (event.key !== "Escape") return;
    const note = document.querySelector<HTMLElement>(`${NOTE}:not([hidden])`);
    if (!note) return;
    const button = buttonOf(note);
    const active = document.activeElement;
    setOpen(note, false);
    // Focus goes back to the i only when it was on the i (or nowhere): Esc
    // pressed while typing must leave the cursor in the field.
    if (button && (!active || active === document.body || active === button)) button.focus();
  });

  window.addEventListener("resize", () => {
    const note = document.querySelector<HTMLElement>(`${NOTE}:not([hidden])`);
    if (note) placeInfoTip(note);
  });
}
