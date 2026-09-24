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
// One open at a time; leaving the field, Esc, a click anywhere else, or the i
// again closes it. The note keeps its id and stays in the field's
// aria-describedby, so a screen reader hears it whether or not the box is open.

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

  // Pressing the i, or inside the box, must not take focus out of the field:
  // otherwise the field's focusout closes the box a moment before the click
  // would, and on a phone the keyboard drops.
  document.addEventListener("mousedown", (event) => {
    const target = event.target as Element | null;
    if (target?.closest(`[data-infotip], ${NOTE}`)) event.preventDefault();
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
    setOpen(note, false);
  });

  document.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const button = target?.closest<HTMLElement>("[data-infotip]");
    const note = button && noteOf(button);
    if (note) {
      const open = note.hidden;
      closeAll(note);
      setOpen(note, open);
      return;
    }
    // A click inside the open box leaves it open, so its text can be read.
    if (target?.closest(NOTE)) return;
    // The click that focused a field (its title, or the field itself) has
    // just opened that field's tip; everything else closes.
    closeAll(tipOfField(document.activeElement));
  });

  document.addEventListener("keydown", (event) => {
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
